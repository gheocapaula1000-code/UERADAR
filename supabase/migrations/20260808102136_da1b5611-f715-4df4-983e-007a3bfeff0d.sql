-- 1) Stati abbonamento completi
ALTER TABLE public.ueradar_subscriptions DROP CONSTRAINT IF EXISTS ueradar_subscriptions_status_check;
ALTER TABLE public.ueradar_subscriptions
  ADD CONSTRAINT ueradar_subscriptions_status_check CHECK (status IN (
    'trialing','active','past_due','canceled','expired','unpaid',
    'incomplete','incomplete_expired','paused','superseded_by_tenant'
  ));

-- 2) Catalogo piani: nuovi codici, retrocompatibili
ALTER TABLE public.ueradar_subscriptions ALTER COLUMN plan_code SET DEFAULT 'ueradar_trial';
ALTER TABLE public.ueradar_subscriptions ALTER COLUMN plan_seats SET DEFAULT 1;

UPDATE public.ueradar_subscriptions
SET plan_code = 'ueradar_executive_monthly', plan_seats = 10
WHERE plan_code = 'ueradar_team_monthly';

UPDATE public.ueradar_subscriptions
SET plan_code = 'ueradar_trial', plan_seats = 1
WHERE provider_subscription_id IS NULL
  AND plan_code IN ('ueradar_pro_monthly','ueradar_business_monthly');

ALTER TABLE public.ueradar_subscriptions DROP CONSTRAINT IF EXISTS ueradar_subscriptions_plan_code_check;
ALTER TABLE public.ueradar_subscriptions
  ADD CONSTRAINT ueradar_subscriptions_plan_code_check CHECK (plan_code IN (
    'ueradar_trial','ueradar_enterprise',
    'ueradar_professional_monthly','ueradar_professional_annual',
    'ueradar_business_monthly','ueradar_business_annual',
    'ueradar_executive_monthly','ueradar_executive_annual'
  ));

CREATE OR REPLACE FUNCTION public.ueradar_create_trial_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  insert into public.ueradar_subscriptions (user_id, plan_code, plan_seats)
  values (new.id, 'ueradar_trial', 1)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 3) Contatori di utilizzo (service-only)
CREATE TABLE IF NOT EXISTS public.ueradar_usage_counters (
  user_id uuid NOT NULL,
  period_ym text NOT NULL,
  deep_verifications integer NOT NULL DEFAULT 0,
  dossiers integer NOT NULL DEFAULT 0,
  last_full_search_at timestamptz,
  last_urgent_search_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period_ym)
);

GRANT ALL ON public.ueradar_usage_counters TO service_role;
REVOKE ALL ON public.ueradar_usage_counters FROM anon, authenticated, PUBLIC;
ALTER TABLE public.ueradar_usage_counters ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS ueradar_usage_counters_updated_at ON public.ueradar_usage_counters;
CREATE TRIGGER ueradar_usage_counters_updated_at
BEFORE UPDATE ON public.ueradar_usage_counters
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Registro prove gratuite (una ogni 12 mesi per P.IVA e dominio)
CREATE TABLE IF NOT EXISTS public.ueradar_trial_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_type text NOT NULL CHECK (fingerprint_type IN ('vat','domain')),
  fingerprint_value text NOT NULL,
  user_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fingerprint_type, fingerprint_value)
);

GRANT ALL ON public.ueradar_trial_registry TO service_role;
REVOKE ALL ON public.ueradar_trial_registry FROM anon, authenticated, PUBLIC;
ALTER TABLE public.ueradar_trial_registry ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS ueradar_trial_registry_updated_at ON public.ueradar_trial_registry;
CREATE TRIGGER ueradar_trial_registry_updated_at
BEFORE UPDATE ON public.ueradar_trial_registry
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Enforcement atomico delle quote mensili
CREATE OR REPLACE FUNCTION public.ueradar_consume_quota(
  _tenant uuid, _period text, _kind text, _limit integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _used integer;
BEGIN
  IF _tenant IS NULL OR _period IS NULL OR _kind NOT IN ('deep_verifications','dossiers') THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'INVALID_INPUT', 'used', 0);
  END IF;

  INSERT INTO public.ueradar_usage_counters (user_id, period_ym)
  VALUES (_tenant, _period)
  ON CONFLICT (user_id, period_ym) DO NOTHING;

  IF _limit = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'NOT_CONTRACTED', 'used', 0);
  END IF;

  IF _kind = 'deep_verifications' THEN
    UPDATE public.ueradar_usage_counters
    SET deep_verifications = deep_verifications + 1
    WHERE user_id = _tenant AND period_ym = _period
      AND (_limit < 0 OR deep_verifications < _limit)
    RETURNING deep_verifications INTO _used;
  ELSE
    UPDATE public.ueradar_usage_counters
    SET dossiers = dossiers + 1
    WHERE user_id = _tenant AND period_ym = _period
      AND (_limit < 0 OR dossiers < _limit)
    RETURNING dossiers INTO _used;
  END IF;

  IF _used IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'QUOTA_EXCEEDED', 'used', _limit);
  END IF;
  RETURN jsonb_build_object('allowed', true, 'code', 'OK', 'used', _used);
END;
$$;

REVOKE ALL ON FUNCTION public.ueradar_consume_quota(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_consume_quota(uuid, text, text, integer) TO service_role;

-- 6) Cadenza minima delle ricerche
CREATE OR REPLACE FUNCTION public.ueradar_claim_search_lane(
  _tenant uuid, _period text, _lane text, _min_interval_minutes integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _last timestamptz; _retry integer;
BEGIN
  IF _tenant IS NULL OR _lane NOT IN ('full','urgent') OR _min_interval_minutes IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'INVALID_INPUT', 'retry_after_seconds', 0);
  END IF;

  INSERT INTO public.ueradar_usage_counters (user_id, period_ym)
  VALUES (_tenant, _period)
  ON CONFLICT (user_id, period_ym) DO NOTHING;

  SELECT CASE WHEN _lane = 'full' THEN last_full_search_at ELSE last_urgent_search_at END
  INTO _last
  FROM public.ueradar_usage_counters
  WHERE user_id = _tenant AND period_ym = _period
  FOR UPDATE;

  IF _last IS NOT NULL AND now() < _last + make_interval(mins => _min_interval_minutes) THEN
    _retry := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (_last + make_interval(mins => _min_interval_minutes) - now()))))::integer;
    RETURN jsonb_build_object('allowed', false, 'code', 'TOO_SOON', 'retry_after_seconds', _retry);
  END IF;

  IF _lane = 'full' THEN
    UPDATE public.ueradar_usage_counters SET last_full_search_at = now()
    WHERE user_id = _tenant AND period_ym = _period;
  ELSE
    UPDATE public.ueradar_usage_counters SET last_urgent_search_at = now()
    WHERE user_id = _tenant AND period_ym = _period;
  END IF;

  RETURN jsonb_build_object('allowed', true, 'code', 'OK', 'retry_after_seconds', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.ueradar_claim_search_lane(uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_claim_search_lane(uuid, text, text, integer) TO service_role;