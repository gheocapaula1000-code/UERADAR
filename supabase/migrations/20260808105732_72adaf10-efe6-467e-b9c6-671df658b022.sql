-- 1) Origine e durata della prova: 168 ore esatte, mai estese da login/refresh.
ALTER TABLE public.ueradar_subscriptions ADD COLUMN IF NOT EXISTS trial_source text;
ALTER TABLE public.ueradar_subscriptions DROP CONSTRAINT IF EXISTS ueradar_subscriptions_trial_source_check;
ALTER TABLE public.ueradar_subscriptions
  ADD CONSTRAINT ueradar_subscriptions_trial_source_check
  CHECK (trial_source IS NULL OR trial_source IN ('app_vat_verified','legacy'));

UPDATE public.ueradar_subscriptions
SET trial_source = 'legacy'
WHERE trial_source IS NULL AND trial_started_at IS NOT NULL;

ALTER TABLE public.ueradar_subscriptions DROP CONSTRAINT IF EXISTS ueradar_subscriptions_trial_window_check;
ALTER TABLE public.ueradar_subscriptions
  ADD CONSTRAINT ueradar_subscriptions_trial_window_check
  CHECK (
    trial_started_at IS NULL
    OR trial_ends_at IS NULL
    OR trial_ends_at = trial_started_at + interval '168 hours'
  ) NOT VALID;

-- 2) Registro prove: impronte irreversibili, normalizzazione lato database.
ALTER TABLE public.ueradar_trial_registry ADD COLUMN IF NOT EXISTS fingerprint_algo text NOT NULL DEFAULT 'sha256';

CREATE OR REPLACE FUNCTION public.ueradar_trial_fingerprint(_type text, _value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT encode(sha256(convert_to('ueradar:' || _type || ':' || _value, 'utf8')), 'hex');
$$;

REVOKE ALL ON FUNCTION public.ueradar_trial_fingerprint(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_trial_fingerprint(text, text) TO service_role;

-- Righe storiche in chiaro convertite una sola volta.
UPDATE public.ueradar_trial_registry
SET fingerprint_value = public.ueradar_trial_fingerprint(fingerprint_type, fingerprint_value),
    fingerprint_algo = 'sha256'
WHERE fingerprint_algo <> 'sha256' OR fingerprint_value !~ '^[0-9a-f]{64}$';

-- 3) Avvio prova: impronte hashate, origine tracciata, durata invariata.
CREATE OR REPLACE FUNCTION public.ueradar_start_trial(_user_id uuid, _vat text, _domain text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _vatn text;
  _domn text;
  _vath text;
  _domh text;
  _sub record;
  _now timestamptz := now();
  _ends timestamptz;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  _vatn := upper(regexp_replace(coalesce(_vat, ''), '[^0-9A-Za-z]', '', 'g'));
  IF length(_vatn) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VAT_REQUIRED');
  END IF;
  _domn := nullif(lower(btrim(coalesce(_domain, ''))), '');

  _vath := public.ueradar_trial_fingerprint('vat', _vatn);
  IF _domn IS NOT NULL THEN
    _domh := public.ueradar_trial_fingerprint('domain', _domn);
  END IF;

  SELECT * INTO _sub FROM public.ueradar_subscriptions WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SUBSCRIPTION_ROW');
  END IF;

  IF _sub.status = 'trialing' AND _sub.trial_ends_at IS NOT NULL AND _sub.trial_ends_at > _now THEN
    RETURN jsonb_build_object('ok', true, 'code', 'TRIAL_ALREADY_ACTIVE',
                              'trial_ends_at', _sub.trial_ends_at);
  END IF;

  IF _sub.provider_subscription_id IS NOT NULL
     OR _sub.status IN ('active', 'past_due', 'unpaid', 'incomplete', 'paused') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SUBSCRIPTION_PRESENT');
  END IF;

  IF coalesce(_sub.trial_consumed, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TRIAL_ALREADY_USED');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ueradar_trial_vat:' || _vath, 0));
  IF _domh IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('ueradar_trial_domain:' || _domh, 0));
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ueradar_trial_registry r
    WHERE ((r.fingerprint_type = 'vat' AND r.fingerprint_value = _vath)
        OR (_domh IS NOT NULL AND r.fingerprint_type = 'domain' AND r.fingerprint_value = _domh))
      AND r.started_at > _now - interval '12 months'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TRIAL_COOLDOWN_ACTIVE');
  END IF;

  INSERT INTO public.ueradar_trial_registry (fingerprint_type, fingerprint_value, fingerprint_algo, user_id, started_at)
  VALUES ('vat', _vath, 'sha256', _user_id, _now)
  ON CONFLICT (fingerprint_type, fingerprint_value)
  DO UPDATE SET user_id = EXCLUDED.user_id, started_at = EXCLUDED.started_at;

  IF _domh IS NOT NULL THEN
    INSERT INTO public.ueradar_trial_registry (fingerprint_type, fingerprint_value, fingerprint_algo, user_id, started_at)
    VALUES ('domain', _domh, 'sha256', _user_id, _now)
    ON CONFLICT (fingerprint_type, fingerprint_value)
    DO UPDATE SET user_id = EXCLUDED.user_id, started_at = EXCLUDED.started_at;
  END IF;

  -- Durata fissa: 168 ore dall'avvio. Nessun altro percorso scrive trial_ends_at.
  _ends := _now + interval '168 hours';

  UPDATE public.ueradar_subscriptions
  SET status = 'trialing',
      plan_code = 'ueradar_trial',
      plan_seats = 1,
      trial_started_at = _now,
      trial_ends_at = _ends,
      trial_source = 'app_vat_verified'
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRIAL_ACTIVATION_FAILED';
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'TRIAL_STARTED', 'trial_ends_at', _ends);
END;
$$;

REVOKE ALL ON FUNCTION public.ueradar_start_trial(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_start_trial(uuid, text, text) TO service_role;

-- 4) Invito collaboratore: conteggio e inserimento nella stessa transazione.
CREATE OR REPLACE FUNCTION public.ueradar_invite_member(
  _owner uuid,
  _email text,
  _first_name text,
  _last_name text,
  _declared_role text,
  _seats integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _norm text;
  _count integer;
BEGIN
  IF _owner IS NULL OR _seats IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;
  IF _declared_role NOT IN ('dipendente','socio','amministratore') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ROLE');
  END IF;
  _norm := lower(btrim(coalesce(_email, '')));
  IF _norm = '' OR position('@' in _norm) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_EMAIL');
  END IF;
  IF _seats = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENTITLED');
  END IF;

  -- Serializza gli inviti dello stesso titolare: niente corsa fra conteggio e insert.
  PERFORM pg_advisory_xact_lock(hashtextextended('ueradar_seats:' || _owner::text, 0));

  SELECT count(*) INTO _count
  FROM public.ueradar_company_members
  WHERE owner_user_id = _owner;

  -- Il titolare occupa sempre un posto.
  IF _seats > 0 AND (_count + 1 + 1) > _seats THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEATS_EXCEEDED', 'used', _count + 1);
  END IF;

  INSERT INTO public.ueradar_company_members
    (owner_user_id, email, first_name, last_name, declared_role, owner_attested_at, role, status)
  VALUES (_owner, _norm, btrim(_first_name), btrim(_last_name), _declared_role, now(), 'member', 'invited');

  RETURN jsonb_build_object('ok', true, 'code', 'OK', 'used', _count + 2);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MEMBER_ALREADY_PRESENT');
END;
$$;

REVOKE ALL ON FUNCTION public.ueradar_invite_member(uuid, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_invite_member(uuid, text, text, text, text, integer) TO service_role;

-- 5) Limite di 2 obiettivi durante la prova, applicato dal database.
CREATE OR REPLACE FUNCTION public.ueradar_enforce_trial_objectives()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _owner uuid;
  _status text;
BEGIN
  IF NEW.investimenti_previsti IS NULL OR array_length(NEW.investimenti_previsti, 1) IS NULL
     OR array_length(NEW.investimenti_previsti, 1) <= 2 THEN
    RETURN NEW;
  END IF;

  _owner := public.ueradar_tenant_owner(NEW.user_id);
  SELECT status INTO _status FROM public.ueradar_subscriptions WHERE user_id = _owner;

  IF coalesce(_status, 'pending') IN ('trialing', 'pending') THEN
    RAISE EXCEPTION 'TRIAL_OBJECTIVES_LIMIT'
      USING HINT = 'Durante la prova gratuita sono ammessi al massimo 2 obiettivi.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ueradar_company_profiles_trial_objectives ON public.company_profiles;
CREATE TRIGGER ueradar_company_profiles_trial_objectives
BEFORE INSERT OR UPDATE ON public.company_profiles
FOR EACH ROW EXECUTE FUNCTION public.ueradar_enforce_trial_objectives();