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
  VALUES (_event_id, coalesce(_event_type, ''), false,
          nullif(btrim(coalesce(_object_id, '')), ''),
          nullif(btrim(coalesce(_customer, '')), ''),
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
DECLARE
  _row record;
  _url text := nullif(btrim(coalesce(_invoice_url, '')), '');
  _tax text := nullif(btrim(coalesce(_tax_id, '')), '');
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
  SET latest_invoice_url = coalesce(_url, latest_invoice_url),
      tax_id = coalesce(_tax, tax_id),
      last_event_created_at = greatest(coalesce(last_event_created_at, _event_created_at), _event_created_at)
  WHERE user_id = _user_id;

  RETURN jsonb_build_object('ok', true, 'code', 'INVOICE_APPLIED');
END;
$$;

REVOKE ALL ON FUNCTION public.ueradar_billing_claim_event(text, text, text, text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ueradar_billing_apply_invoice(uuid, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_billing_claim_event(text, text, text, text, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ueradar_billing_apply_invoice(uuid, timestamptz, text, text, text) TO service_role;