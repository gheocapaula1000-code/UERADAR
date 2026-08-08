ALTER TABLE public.ueradar_checkout_intents ADD COLUMN IF NOT EXISTS session_id text;

CREATE OR REPLACE FUNCTION public.ueradar_claim_checkout_intent(
  _user_id uuid, _price_id text, _plan_code text, _ttl_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row record; _now timestamptz := now();
BEGIN
  IF _user_id IS NULL OR coalesce(_price_id, '') = '' OR coalesce(_plan_code, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ueradar_checkout:' || _user_id::text, 0));

  SELECT * INTO _row FROM public.ueradar_checkout_intents
  WHERE user_id = _user_id FOR UPDATE;

  -- Una prenotazione viva blocca qualunque secondo checkout, anche stesso Price.
  -- L'unica prosecuzione ammessa e' la ripresa della sessione gia' registrata.
  IF FOUND AND _row.expires_at > _now THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_ALREADY_IN_PROGRESS',
                              'session_id', _row.session_id,
                              'price_id', _row.price_id);
  END IF;

  INSERT INTO public.ueradar_checkout_intents (user_id, price_id, plan_code, expires_at, session_id)
  VALUES (_user_id, _price_id, _plan_code,
          _now + make_interval(secs => greatest(coalesce(_ttl_seconds, 1800), 60)), NULL)
  ON CONFLICT (user_id) DO UPDATE
  SET price_id = EXCLUDED.price_id,
      plan_code = EXCLUDED.plan_code,
      expires_at = EXCLUDED.expires_at,
      session_id = NULL;

  RETURN jsonb_build_object('ok', true, 'code', 'OK');
END;
$$;

CREATE OR REPLACE FUNCTION public.ueradar_attach_checkout_session(
  _user_id uuid, _price_id text, _session_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
  IF _row.session_id IS NOT NULL AND _row.session_id IS DISTINCT FROM _session_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_SESSION_ALREADY_BOUND');
  END IF;

  UPDATE public.ueradar_checkout_intents
  SET session_id = _session_id
  WHERE user_id = _user_id;

  RETURN jsonb_build_object('ok', true, 'code', 'OK');
END;
$$;

-- Rilascio sicuro: solo prenotazioni senza sessione registrata.
CREATE OR REPLACE FUNCTION public.ueradar_release_checkout_intent(
  _user_id uuid, _price_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _deleted integer;
BEGIN
  IF _user_id IS NULL OR coalesce(_price_id, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ueradar_checkout:' || _user_id::text, 0));

  DELETE FROM public.ueradar_checkout_intents
  WHERE user_id = _user_id AND price_id = _price_id AND session_id IS NULL;
  GET DIAGNOSTICS _deleted = ROW_COUNT;

  IF _deleted = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_INTENT_NOT_RELEASABLE');
  END IF;
  RETURN jsonb_build_object('ok', true, 'code', 'OK');
END;
$$;

-- Verifica intento + primo binding + apply + consumo: una sola transazione.
CREATE OR REPLACE FUNCTION public.ueradar_billing_apply_subscription(
  _user_id uuid, _event_id text, _lease_token uuid,
  _event_created_at timestamp with time zone,
  _expected_customer text, _expected_subscription text, _expected_price text,
  _patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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

  IF _row.provider_subscription_id IS NOT NULL
     AND _row.status NOT IN ('canceled', 'incomplete_expired')
     AND (
       (_exp_sub IS NOT NULL AND _row.provider_subscription_id IS DISTINCT FROM _exp_sub)
    OR (_new_sub IS NOT NULL AND _row.provider_subscription_id IS DISTINCT FROM _new_sub)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SUBSCRIPTION_REASSIGNMENT_BLOCKED');
  END IF;

  -- Primo collegamento: l'intento e' arbitro DB, consumato solo con l'apply.
  IF _row.provider_subscription_id IS NULL AND _new_sub IS NOT NULL THEN
    _first_binding := true;
    PERFORM pg_advisory_xact_lock(hashtextextended('ueradar_checkout:' || _user_id::text, 0));
    SELECT * INTO _intent FROM public.ueradar_checkout_intents
    WHERE user_id = _user_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_INTENT_MISSING');
    END IF;
    IF _intent.price_id IS DISTINCT FROM coalesce(_new_price, _exp_price) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_INTENT_PRICE_MISMATCH');
    END IF;
    IF _intent.expires_at <= now() THEN
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

  IF _first_binding THEN
    DELETE FROM public.ueradar_checkout_intents WHERE user_id = _user_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'APPLIED',
                            'first_binding', _first_binding);
END;
$$;

REVOKE ALL ON FUNCTION public.ueradar_attach_checkout_session(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_attach_checkout_session(uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.ueradar_release_checkout_intent(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_release_checkout_intent(uuid, text) TO service_role;