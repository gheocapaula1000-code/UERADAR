-- Lease di proprietà sul registro eventi: un worker scaduto non può chiudere
-- un evento già reclamato da un retry.
ALTER TABLE public.ueradar_billing_events
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

-- Presa in carico esclusiva dell'evento.
CREATE OR REPLACE FUNCTION public.ueradar_billing_claim_event(
  _event_id text,
  _event_type text,
  _object_id text,
  _customer text,
  _event_created_at timestamptz,
  _lease_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _token uuid := gen_random_uuid();
  _row record;
BEGIN
  IF _event_id IS NULL OR _event_id = '' OR _event_created_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  INSERT INTO public.ueradar_billing_events
    (event_id, event_type, livemode, object_id, provider_customer_id,
     event_created_at, status, attempts, lease_token, lease_expires_at)
  VALUES (_event_id, coalesce(_event_type, ''), false, _object_id, _customer,
          _event_created_at, 'processing', 1, _token,
          now() + make_interval(secs => greatest(coalesce(_lease_seconds, 300), 30)))
  ON CONFLICT (event_id) DO NOTHING;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'code', 'CLAIMED', 'lease_token', _token);
  END IF;

  SELECT * INTO _row FROM public.ueradar_billing_events
  WHERE event_id = _event_id FOR UPDATE;

  IF _row.status = 'succeeded' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_PROCESSED');
  END IF;

  -- Presa in carico ancora valida: un secondo worker non parte.
  IF _row.status = 'processing'
     AND _row.lease_expires_at IS NOT NULL
     AND _row.lease_expires_at > now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EVENT_ALREADY_IN_PROGRESS');
  END IF;

  UPDATE public.ueradar_billing_events
  SET status = 'processing',
      error_code = NULL,
      attempts = coalesce(attempts, 1) + 1,
      lease_token = _token,
      lease_expires_at = now() + make_interval(secs => greatest(coalesce(_lease_seconds, 300), 30))
  WHERE event_id = _event_id;

  RETURN jsonb_build_object('ok', true, 'code', 'RECLAIMED', 'lease_token', _token);
END;
$$;

-- Chiusura: consentita solo al proprietario corrente della presa in carico.
CREATE OR REPLACE FUNCTION public.ueradar_billing_settle_event(
  _event_id text,
  _lease_token uuid,
  _ok boolean,
  _code text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _updated integer;
BEGIN
  UPDATE public.ueradar_billing_events
  SET status = CASE WHEN _ok THEN 'succeeded' ELSE 'failed' END,
      error_code = CASE WHEN _ok THEN NULL ELSE _code END,
      processed_at = CASE WHEN _ok THEN now() ELSE NULL END,
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE event_id = _event_id
    AND lease_token IS NOT DISTINCT FROM _lease_token
    AND _lease_token IS NOT NULL;
  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LEASE_LOST');
  END IF;
  RETURN jsonb_build_object('ok', true, 'code', 'SETTLED');
END;
$$;

-- Applicazione atomica dello stato canonico della subscription.
CREATE OR REPLACE FUNCTION public.ueradar_billing_apply_subscription(
  _user_id uuid,
  _event_created_at timestamptz,
  _patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row record;
  _new_status text := _patch->>'status';
BEGIN
  IF _user_id IS NULL OR _event_created_at IS NULL OR _new_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  -- Lock per utente: due eventi concorrenti non si sovrascrivono a metà.
  SELECT * INTO _row FROM public.ueradar_subscriptions
  WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SUBSCRIPTION_ROW');
  END IF;

  IF _row.last_event_created_at IS NOT NULL THEN
    IF _event_created_at < _row.last_event_created_at THEN
      RETURN jsonb_build_object('ok', false, 'code', 'EVENT_OUT_OF_ORDER');
    END IF;
    -- Stesso istante: un annullamento non può essere riattivato.
    IF _event_created_at = _row.last_event_created_at
       AND _row.status = 'canceled' AND _new_status <> 'canceled' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CANCELED_NOT_REACTIVATED');
    END IF;
  END IF;

  UPDATE public.ueradar_subscriptions
  SET status = _new_status,
      provider = coalesce(_patch->>'provider', provider),
      billing_mode = coalesce(_patch->>'billing_mode', billing_mode),
      provider_subscription_id = coalesce(_patch->>'provider_subscription_id', provider_subscription_id),
      provider_customer_id = coalesce(_patch->>'provider_customer_id', provider_customer_id),
      stripe_price_id = coalesce(_patch->>'stripe_price_id', stripe_price_id),
      plan_code = coalesce(_patch->>'plan_code', plan_code),
      plan_seats = coalesce((_patch->>'plan_seats')::integer, plan_seats),
      cancel_at_period_end = coalesce((_patch->>'cancel_at_period_end')::boolean, cancel_at_period_end),
      current_period_end = nullif(_patch->>'current_period_end', '')::timestamptz,
      trial_consumed = coalesce((_patch->>'trial_consumed')::boolean, trial_consumed),
      last_event_created_at = _event_created_at
  WHERE user_id = _user_id;

  RETURN jsonb_build_object('ok', true, 'code', 'APPLIED');
END;
$$;

-- Fatture: solo dati documentali, mai lo stato dell'abbonamento.
CREATE OR REPLACE FUNCTION public.ueradar_billing_apply_invoice(
  _user_id uuid,
  _event_created_at timestamptz,
  _subscription_id text,
  _invoice_url text,
  _tax_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _row record;
BEGIN
  IF _user_id IS NULL OR _event_created_at IS NULL OR coalesce(_subscription_id, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  SELECT * INTO _row FROM public.ueradar_subscriptions
  WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SUBSCRIPTION_ROW');
  END IF;
  IF _row.provider_subscription_id IS DISTINCT FROM _subscription_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SUBSCRIPTION_MISMATCH');
  END IF;
  IF _row.last_event_created_at IS NOT NULL
     AND _event_created_at < _row.last_event_created_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EVENT_OUT_OF_ORDER');
  END IF;

  UPDATE public.ueradar_subscriptions
  SET latest_invoice_url = coalesce(_invoice_url, latest_invoice_url),
      tax_id = coalesce(_tax_id, tax_id),
      last_event_created_at = greatest(coalesce(last_event_created_at, _event_created_at), _event_created_at)
  WHERE user_id = _user_id;

  RETURN jsonb_build_object('ok', true, 'code', 'INVOICE_APPLIED');
END;
$$;

-- Nessun accesso dal browser: solo il servizio può invocare queste procedure.
REVOKE ALL ON FUNCTION public.ueradar_billing_claim_event(text, text, text, text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ueradar_billing_settle_event(text, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ueradar_billing_apply_subscription(uuid, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ueradar_billing_apply_invoice(uuid, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_billing_claim_event(text, text, text, text, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ueradar_billing_settle_event(text, uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ueradar_billing_apply_subscription(uuid, timestamptz, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ueradar_billing_apply_invoice(uuid, timestamptz, text, text, text) TO service_role;