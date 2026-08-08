-- 1) Verifica duplicati PRIMA dei vincoli: se presenti, la migrazione fallisce.
DO $$
DECLARE _dups integer;
BEGIN
  SELECT count(*) INTO _dups FROM (
    SELECT provider_customer_id FROM public.ueradar_subscriptions
    WHERE provider_customer_id IS NOT NULL
    GROUP BY provider_customer_id HAVING count(*) > 1
  ) d;
  IF _dups > 0 THEN
    RAISE EXCEPTION 'DUPLICATE_PROVIDER_CUSTOMER: % gruppi duplicati', _dups;
  END IF;

  SELECT count(*) INTO _dups FROM (
    SELECT provider_subscription_id FROM public.ueradar_subscriptions
    WHERE provider_subscription_id IS NOT NULL
    GROUP BY provider_subscription_id HAVING count(*) > 1
  ) d;
  IF _dups > 0 THEN
    RAISE EXCEPTION 'DUPLICATE_PROVIDER_SUBSCRIPTION: % gruppi duplicati', _dups;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ueradar_subscriptions_provider_customer_uniq
  ON public.ueradar_subscriptions (provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ueradar_subscriptions_provider_subscription_uniq
  ON public.ueradar_subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

-- 2) Prenotazione checkout (SOLO QA): impedisce checkout multipli concorrenti
--    e vincola il primo collegamento al Price effettivamente scelto.
CREATE TABLE IF NOT EXISTS public.ueradar_checkout_intents (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  price_id text NOT NULL,
  plan_code text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabella privata: nessun accesso Data API, solo funzioni SECURITY DEFINER.
REVOKE ALL ON public.ueradar_checkout_intents FROM anon, authenticated;
GRANT ALL ON public.ueradar_checkout_intents TO service_role;
ALTER TABLE public.ueradar_checkout_intents ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS ueradar_checkout_intents_updated_at ON public.ueradar_checkout_intents;
CREATE TRIGGER ueradar_checkout_intents_updated_at
BEFORE UPDATE ON public.ueradar_checkout_intents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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

  -- Un solo checkout per volta: la prenotazione scade da sola (TTL).
  IF FOUND AND _row.expires_at > _now AND _row.price_id IS DISTINCT FROM _price_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_ALREADY_IN_PROGRESS');
  END IF;

  INSERT INTO public.ueradar_checkout_intents (user_id, price_id, plan_code, expires_at)
  VALUES (_user_id, _price_id, _plan_code,
          _now + make_interval(secs => greatest(coalesce(_ttl_seconds, 1800), 60)))
  ON CONFLICT (user_id) DO UPDATE
  SET price_id = EXCLUDED.price_id,
      plan_code = EXCLUDED.plan_code,
      expires_at = EXCLUDED.expires_at;

  RETURN jsonb_build_object('ok', true, 'code', 'OK');
END;
$$;

CREATE OR REPLACE FUNCTION public.ueradar_consume_checkout_intent(
  _user_id uuid, _price_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row record;
BEGIN
  IF _user_id IS NULL OR coalesce(_price_id, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  SELECT * INTO _row FROM public.ueradar_checkout_intents
  WHERE user_id = _user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_INTENT_MISSING');
  END IF;
  IF _row.price_id IS DISTINCT FROM _price_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_INTENT_PRICE_MISMATCH');
  END IF;
  IF _row.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHECKOUT_INTENT_EXPIRED');
  END IF;

  DELETE FROM public.ueradar_checkout_intents WHERE user_id = _user_id;
  RETURN jsonb_build_object('ok', true, 'code', 'OK');
END;
$$;

REVOKE ALL ON FUNCTION public.ueradar_claim_checkout_intent(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_claim_checkout_intent(uuid, text, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.ueradar_consume_checkout_intent(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_consume_checkout_intent(uuid, text) TO service_role;