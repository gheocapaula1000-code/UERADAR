-- Le RPC di applicazione diventano gli unici punti di scrittura e verificano
-- la presa in carico dell'evento sotto lock prima di qualunque UPDATE.
DROP FUNCTION IF EXISTS public.ueradar_billing_apply_subscription(uuid, timestamptz, jsonb);
DROP FUNCTION IF EXISTS public.ueradar_billing_apply_invoice(uuid, timestamptz, text, text, text);

CREATE OR REPLACE FUNCTION public.ueradar_billing_assert_lease(_event_id text, _lease_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _ev record;
BEGIN
  IF _event_id IS NULL OR _event_id = '' OR _lease_token IS NULL THEN
    RETURN false;
  END IF;
  -- Lock sull'evento: la validità del lease non può cambiare sotto di noi.
  SELECT * INTO _ev FROM public.ueradar_billing_events
  WHERE event_id = _event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN _ev.status = 'processing'
     AND _ev.lease_token IS NOT DISTINCT FROM _lease_token
     AND _ev.lease_expires_at IS NOT NULL
     AND _ev.lease_expires_at > now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.ueradar_billing_apply_subscription(
  _user_id uuid,
  _event_id text,
  _lease_token uuid,
  _event_created_at timestamp with time zone,
  _expected_customer text,
  _expected_subscription text,
  _expected_price text,
  _patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
  _new_status text := _patch->>'status';
  _new_sub text := _patch->>'provider_subscription_id';
  _new_price text := _patch->>'stripe_price_id';
  _new_plan text := _patch->>'plan_code';
  _new_customer text := _patch->>'provider_customer_id';
BEGIN
  IF _user_id IS NULL OR _event_created_at IS NULL OR _new_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  -- Nessuna scrittura senza presa in carico viva: un worker sostituito da un
  -- retry viene fermato qui, prima di toccare l'abbonamento.
  IF NOT public.ueradar_billing_assert_lease(_event_id, _lease_token) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LEASE_LOST');
  END IF;

  -- Lock per utente: due eventi concorrenti non si sovrascrivono a metà.
  SELECT * INTO _row FROM public.ueradar_subscriptions
  WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SUBSCRIPTION_ROW');
  END IF;

  -- Il legame utente/cliente/abbonamento/prezzo è deciso qui, sotto lock.
  IF _expected_price IS NOT NULL AND _new_price IS NOT NULL
     AND _expected_price IS DISTINCT FROM _new_price THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PRICE_MISMATCH');
  END IF;

  IF _row.provider_customer_id IS NOT NULL AND _expected_customer IS NOT NULL
     AND _row.provider_customer_id IS DISTINCT FROM _expected_customer THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CUSTOMER_MISMATCH');
  END IF;
  IF _row.provider_customer_id IS NOT NULL AND _new_customer IS NOT NULL
     AND _row.provider_customer_id IS DISTINCT FROM _new_customer THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CUSTOMER_MISMATCH');
  END IF;

  IF _row.provider_subscription_id IS NOT NULL
     AND _expected_subscription IS NOT NULL
     AND _row.provider_subscription_id IS DISTINCT FROM _expected_subscription
     AND _row.status NOT IN ('canceled', 'incomplete_expired') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SUBSCRIPTION_REASSIGNMENT_BLOCKED');
  END IF;
  IF _row.provider_subscription_id IS NOT NULL AND _new_sub IS NOT NULL
     AND _row.provider_subscription_id IS DISTINCT FROM _new_sub
     AND _row.status NOT IN ('canceled', 'incomplete_expired') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SUBSCRIPTION_REASSIGNMENT_BLOCKED');
  END IF;

  IF _row.last_event_created_at IS NOT NULL THEN
    IF _event_created_at < _row.last_event_created_at THEN
      RETURN jsonb_build_object('ok', false, 'code', 'EVENT_OUT_OF_ORDER');
    END IF;
    IF _event_created_at = _row.last_event_created_at THEN
      -- Stesso istante: un annullamento non può essere riattivato.
      IF _row.status = 'canceled' AND _new_status <> 'canceled' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'CANCELED_NOT_REACTIVATED');
      END IF;
      -- Stesso istante e snapshot canonici divergenti su abbonamento, prezzo o
      -- piano: nessuno dei due può vincere arbitrariamente.
      IF _new_status <> 'canceled' AND (
           (_new_sub IS NOT NULL AND _row.provider_subscription_id IS NOT NULL
              AND _new_sub IS DISTINCT FROM _row.provider_subscription_id)
        OR (_new_price IS NOT NULL AND _row.stripe_price_id IS NOT NULL
              AND _new_price IS DISTINCT FROM _row.stripe_price_id)
        OR (_new_plan IS NOT NULL AND _row.plan_code IS NOT NULL
              AND _new_plan IS DISTINCT FROM _row.plan_code)
      ) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'CANONICAL_CONFLICT');
      END IF;
    END IF;
  END IF;

  UPDATE public.ueradar_subscriptions
  SET status = _new_status,
      provider = coalesce(_patch->>'provider', provider),
      billing_mode = coalesce(_patch->>'billing_mode', billing_mode),
      provider_subscription_id = coalesce(_new_sub, provider_subscription_id),
      provider_customer_id = coalesce(_new_customer, provider_customer_id),
      stripe_price_id = coalesce(_new_price, stripe_price_id),
      plan_code = coalesce(_new_plan, plan_code),
      plan_seats = coalesce((_patch->>'plan_seats')::integer, plan_seats),
      cancel_at_period_end = coalesce((_patch->>'cancel_at_period_end')::boolean, cancel_at_period_end),
      current_period_end = nullif(_patch->>'current_period_end', '')::timestamptz,
      trial_consumed = coalesce((_patch->>'trial_consumed')::boolean, trial_consumed),
      last_event_created_at = _event_created_at
  WHERE user_id = _user_id;

  RETURN jsonb_build_object('ok', true, 'code', 'APPLIED');
END;
$function$;

CREATE OR REPLACE FUNCTION public.ueradar_billing_apply_invoice(
  _user_id uuid,
  _event_id text,
  _lease_token uuid,
  _event_created_at timestamp with time zone,
  _expected_customer text,
  _subscription_id text,
  _invoice_url text,
  _tax_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
  _url text := nullif(btrim(coalesce(_invoice_url, '')), '');
  _tax text := nullif(btrim(coalesce(_tax_id, '')), '');
BEGIN
  IF _user_id IS NULL OR _event_created_at IS NULL OR coalesce(_subscription_id, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  IF NOT public.ueradar_billing_assert_lease(_event_id, _lease_token) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LEASE_LOST');
  END IF;

  SELECT * INTO _row FROM public.ueradar_subscriptions
  WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SUBSCRIPTION_ROW');
  END IF;
  IF _row.provider_customer_id IS NOT NULL AND _expected_customer IS NOT NULL
     AND _row.provider_customer_id IS DISTINCT FROM _expected_customer THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CUSTOMER_MISMATCH');
  END IF;
  IF _row.provider_subscription_id IS DISTINCT FROM _subscription_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SUBSCRIPTION_MISMATCH');
  END IF;
  -- Cursore dedicato alle fatture: indipendente dall'ordine degli eventi
  -- di subscription.
  IF _row.last_invoice_event_at IS NOT NULL
     AND _event_created_at < _row.last_invoice_event_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVOICE_OUT_OF_ORDER');
  END IF;

  UPDATE public.ueradar_subscriptions
  SET latest_invoice_url = coalesce(_url, latest_invoice_url),
      tax_id = coalesce(_tax, tax_id),
      last_invoice_event_at = greatest(coalesce(last_invoice_event_at, _event_created_at), _event_created_at)
  WHERE user_id = _user_id;

  RETURN jsonb_build_object('ok', true, 'code', 'INVOICE_APPLIED');
END;
$function$;

REVOKE ALL ON FUNCTION public.ueradar_billing_assert_lease(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ueradar_billing_apply_subscription(uuid, text, uuid, timestamptz, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ueradar_billing_apply_invoice(uuid, text, uuid, timestamptz, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_billing_assert_lease(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ueradar_billing_apply_subscription(uuid, text, uuid, timestamptz, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ueradar_billing_apply_invoice(uuid, text, uuid, timestamptz, text, text, text, text) TO service_role;