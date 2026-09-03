CREATE OR REPLACE FUNCTION public.ueradar_attach_checkout_session(
  _user_id uuid, _price_id text, _session_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _row record;
BEGIN
  IF _user_id IS NULL OR coalesce(_price_id, '') = '' OR coalesce(_session_id, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ueradar_checkout:' || _user_id::text, 0));

  SELECT * INTO _row FROM public.ueradar_checkout_intents
  WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_INTENT_MISSING');
  END IF;
  IF _row.price_id IS DISTINCT FROM _price_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_INTENT_PRICE_MISMATCH');
  END IF;
  IF _row.expires_at IS NULL OR _row.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_INTENT_EXPIRED');
  END IF;
  IF _row.session_id IS NOT NULL AND _row.session_id IS DISTINCT FROM _session_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_SESSION_ALREADY_BOUND');
  END IF;

  UPDATE public.ueradar_checkout_intents
  SET session_id = _session_id
  WHERE user_id = _user_id;

  RETURN jsonb_build_object('ok', true, 'code', 'OK');
END;
$$;

REVOKE ALL ON FUNCTION public.ueradar_attach_checkout_session(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_attach_checkout_session(uuid, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.ueradar_billing_apply_subscription(
  _user_id uuid,
  _event_id text,
  _lease_token uuid,
  _event_created_at timestamp with time zone,
  _expected_customer text,
  _expected_subscription text,
  _expected_price text,
  _checkout_session_id text,
  _patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
  _intent record;
  _first_binding boolean := false;
  _new_status text := _patch->>'status';
  _new_sub text := nullif(btrim(coalesce(_patch->>'provider_subscription_id', '')), '');
  _new_price text := nullif(btrim(coalesce(_patch->>'stripe_price_id', '')), '');
  _new_plan text := nullif(btrim(coalesce(_patch->>'plan_code', '')), '');
  _new_customer text := nullif(btrim(coalesce(_patch->>'provider_customer_id', '')), '');
  _exp_customer text := nullif(btrim(coalesce(_expected_customer, '')), '');
  _exp_sub text := nullif(btrim(coalesce(_expected_subscription, '')), '');
  _exp_price text := nullif(btrim(coalesce(_expected_price, '')), '');
  _session text := nullif(btrim(coalesce(_checkout_session_id, '')), '');
  _period_end timestamptz := nullif(_patch->>'current_period_end', '')::timestamptz;
  _effective_period timestamptz;
BEGIN
  IF _user_id IS NULL OR _event_created_at IS NULL OR _new_status IS NULL THEN
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

  IF _exp_price IS NOT NULL AND _new_price IS NOT NULL
     AND _exp_price IS DISTINCT FROM _new_price THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PRICE_MISMATCH');
  END IF;

  IF _row.provider_customer_id IS NOT NULL AND (
       (_exp_customer IS NOT NULL AND _row.provider_customer_id IS DISTINCT FROM _exp_customer)
    OR (_new_customer IS NOT NULL AND _row.provider_customer_id IS DISTINCT FROM _new_customer)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CUSTOMER_MISMATCH');
  END IF;

  IF _row.provider_subscription_id IS NOT NULL AND (
       (_exp_sub IS NOT NULL AND _row.provider_subscription_id IS DISTINCT FROM _exp_sub)
    OR (_new_sub IS NOT NULL AND _row.provider_subscription_id IS DISTINCT FROM _new_sub)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SUBSCRIPTION_REASSIGNMENT_BLOCKED');
  END IF;

  IF _row.provider_subscription_id IS NULL AND _new_sub IS NOT NULL THEN
    _first_binding := true;

    IF _session IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'FIRST_BINDING_REQUIRES_CHECKOUT_SESSION');
    END IF;
    IF _exp_sub IS NULL OR _exp_sub IS DISTINCT FROM _new_sub THEN
      RETURN jsonb_build_object('ok', false, 'code', 'FIRST_BINDING_SUBSCRIPTION_REQUIRED');
    END IF;
    IF _exp_customer IS NULL OR _new_customer IS NULL OR _exp_customer IS DISTINCT FROM _new_customer THEN
      RETURN jsonb_build_object('ok', false, 'code', 'FIRST_BINDING_CUSTOMER_REQUIRED');
    END IF;
    IF _new_price IS NULL OR _exp_price IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'FIRST_BINDING_PRICE_REQUIRED');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('ueradar_checkout:' || _user_id::text, 0));
    SELECT * INTO _intent FROM public.ueradar_checkout_intents
    WHERE user_id = _user_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_INTENT_MISSING');
    END IF;
    IF _intent.session_id IS NULL OR _intent.session_id IS DISTINCT FROM _session THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_SESSION_MISMATCH');
    END IF;
    IF _intent.price_id IS DISTINCT FROM _new_price THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_INTENT_PRICE_MISMATCH');
    END IF;
    IF _intent.expires_at IS NULL OR _intent.expires_at <= _event_created_at THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_INTENT_EXPIRED');
    END IF;
  END IF;

  IF _row.last_event_created_at IS NOT NULL THEN
    IF _event_created_at < _row.last_event_created_at THEN
      RETURN jsonb_build_object('ok', false, 'code', 'EVENT_OUT_OF_ORDER');
    END IF;
    IF _event_created_at = _row.last_event_created_at THEN
      IF _row.status = 'canceled' AND _new_status <> 'canceled' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'CANCELED_NOT_REACTIVATED');
      END IF;
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

  _effective_period := coalesce(_period_end, _row.current_period_end);

  IF _new_status IN ('active', 'trialing', 'past_due')
     AND (_effective_period IS NULL OR _effective_period <= _event_created_at) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PERIOD_END_NOT_IN_FUTURE');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ueradar_billing_events
    WHERE event_id = _event_id
      AND status = 'processing'
      AND lease_token IS NOT DISTINCT FROM _lease_token
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at > clock_timestamp()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LEASE_LOST');
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
      current_period_end = _effective_period,
      trial_consumed = coalesce((_patch->>'trial_consumed')::boolean, trial_consumed),
      last_event_created_at = _event_created_at
  WHERE user_id = _user_id;

  IF _first_binding THEN
    DELETE FROM public.ueradar_checkout_intents WHERE user_id = _user_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'APPLIED',
                            'first_binding', _first_binding);
END;
$function$;

REVOKE ALL ON FUNCTION public.ueradar_billing_apply_subscription(uuid, text, uuid, timestamptz, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_billing_apply_subscription(uuid, text, uuid, timestamptz, text, text, text, text, jsonb) TO service_role;