-- Isolamento definitivo tra oggetti Stripe TEST e LIVE.
-- Una riga senza binding provider (es. trial applicativo) può passare a LIVE;
-- una riga già collegata non può cambiare modalità senza prima essere ripulita
-- da una procedura amministrativa esplicita.

ALTER TABLE public.ueradar_subscriptions
  DROP CONSTRAINT IF EXISTS ueradar_subscriptions_billing_mode_check;

ALTER TABLE public.ueradar_subscriptions
  ADD CONSTRAINT ueradar_subscriptions_billing_mode_check
  CHECK (billing_mode IN ('test', 'live'));

CREATE OR REPLACE FUNCTION public.ueradar_enforce_billing_mode_isolation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.billing_mode NOT IN ('test', 'live') THEN
    RAISE EXCEPTION 'BILLING_MODE_INVALID' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.billing_mode IS DISTINCT FROM OLD.billing_mode
     AND (
       OLD.provider_customer_id IS NOT NULL
       OR OLD.provider_subscription_id IS NOT NULL
       OR OLD.stripe_price_id IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'BILLING_MODE_CONFLICT' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ueradar_billing_mode_isolation
  ON public.ueradar_subscriptions;

CREATE TRIGGER ueradar_billing_mode_isolation
BEFORE INSERT OR UPDATE ON public.ueradar_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.ueradar_enforce_billing_mode_isolation();

REVOKE ALL ON FUNCTION public.ueradar_enforce_billing_mode_isolation() FROM PUBLIC;

-- La presa in carico dell'evento registra il modo reale dell'endpoint.
-- Un eventuale riuso dello stesso event_id con modo opposto è un conflitto,
-- non un retry valido.
CREATE OR REPLACE FUNCTION public.ueradar_billing_claim_event(
  _event_id text,
  _event_type text,
  _object_id text,
  _customer text,
  _livemode boolean,
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
  IF _event_id IS NULL OR _event_id = '' OR _event_created_at IS NULL OR _livemode IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  INSERT INTO public.ueradar_billing_events
    (event_id, event_type, livemode, object_id, provider_customer_id,
     event_created_at, status, attempts, lease_token, lease_expires_at)
  VALUES (_event_id, coalesce(_event_type, ''), _livemode,
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

  IF _row.livemode IS DISTINCT FROM _livemode THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EVENT_MODE_CONFLICT');
  END IF;
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

REVOKE ALL ON FUNCTION public.ueradar_billing_claim_event(
  text, text, text, text, boolean, timestamptz, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_billing_claim_event(
  text, text, text, text, boolean, timestamptz, integer
) TO service_role;

-- The legacy six-argument signature remains service-role-only during the
-- rolling deployment. It is revoked in a post-deploy cleanup once every
-- runtime is confirmed on the mode-aware seven-argument contract.
