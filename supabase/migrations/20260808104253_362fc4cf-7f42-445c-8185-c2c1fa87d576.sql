-- 1) Stato "pending": nessuna prova concessa automaticamente alla registrazione.
ALTER TABLE public.ueradar_subscriptions DROP CONSTRAINT IF EXISTS ueradar_subscriptions_status_check;
ALTER TABLE public.ueradar_subscriptions
  ADD CONSTRAINT ueradar_subscriptions_status_check CHECK (status IN (
    'pending','trialing','active','past_due','canceled','expired','unpaid',
    'incomplete','incomplete_expired','paused','superseded_by_tenant'
  ));

ALTER TABLE public.ueradar_subscriptions ALTER COLUMN trial_ends_at DROP NOT NULL;
ALTER TABLE public.ueradar_subscriptions ALTER COLUMN trial_ends_at DROP DEFAULT;
ALTER TABLE public.ueradar_subscriptions ALTER COLUMN trial_started_at DROP NOT NULL;
ALTER TABLE public.ueradar_subscriptions ALTER COLUMN trial_started_at DROP DEFAULT;
ALTER TABLE public.ueradar_subscriptions ALTER COLUMN status SET DEFAULT 'pending';

CREATE OR REPLACE FUNCTION public.ueradar_create_trial_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  -- Nessun entitlement alla registrazione: la prova parte solo dopo verifica P.IVA.
  insert into public.ueradar_subscriptions (user_id, plan_code, plan_seats, status,
                                            trial_started_at, trial_ends_at)
  values (new.id, 'ueradar_trial', 1, 'pending', null, null)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 2) Avvio prova: transazione unica, fingerprint P.IVA + dominio, riapertura dopo 12 mesi.
CREATE OR REPLACE FUNCTION public.ueradar_start_trial(_user_id uuid, _vat text, _domain text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _vatn text;
  _domn text;
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

  SELECT * INTO _sub FROM public.ueradar_subscriptions WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SUBSCRIPTION_ROW');
  END IF;

  -- Una prova già in corso non viene mai interrotta o riavviata.
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

  -- Serializzazione per fingerprint: due richieste concorrenti non aprono due prove.
  PERFORM pg_advisory_xact_lock(hashtextextended('ueradar_trial_vat:' || _vatn, 0));
  IF _domn IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('ueradar_trial_domain:' || _domn, 0));
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ueradar_trial_registry r
    WHERE ((r.fingerprint_type = 'vat' AND r.fingerprint_value = _vatn)
        OR (_domn IS NOT NULL AND r.fingerprint_type = 'domain' AND r.fingerprint_value = _domn))
      AND r.started_at > _now - interval '12 months'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TRIAL_COOLDOWN_ACTIVE');
  END IF;

  -- UNIQUE permanente: dopo 12 mesi si aggiorna la riga esistente, non se ne crea una seconda.
  INSERT INTO public.ueradar_trial_registry (fingerprint_type, fingerprint_value, user_id, started_at)
  VALUES ('vat', _vatn, _user_id, _now)
  ON CONFLICT (fingerprint_type, fingerprint_value)
  DO UPDATE SET user_id = EXCLUDED.user_id, started_at = EXCLUDED.started_at;

  IF _domn IS NOT NULL THEN
    INSERT INTO public.ueradar_trial_registry (fingerprint_type, fingerprint_value, user_id, started_at)
    VALUES ('domain', _domn, _user_id, _now)
    ON CONFLICT (fingerprint_type, fingerprint_value)
    DO UPDATE SET user_id = EXCLUDED.user_id, started_at = EXCLUDED.started_at;
  END IF;

  _ends := _now + interval '168 hours';

  UPDATE public.ueradar_subscriptions
  SET status = 'trialing',
      plan_code = 'ueradar_trial',
      plan_seats = 1,
      trial_started_at = _now,
      trial_ends_at = _ends
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRIAL_ACTIVATION_FAILED';
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'TRIAL_STARTED', 'trial_ends_at', _ends);
END;
$$;

REVOKE ALL ON FUNCTION public.ueradar_start_trial(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_start_trial(uuid, text, text) TO service_role;

-- 3) Registro consumi per opportunità: il claim è idempotente nel periodo.
CREATE TABLE IF NOT EXISTS public.ueradar_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  period_ym text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('deep_verifications','dossiers')),
  opportunity_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_ym, kind, opportunity_id)
);

GRANT ALL ON public.ueradar_usage_ledger TO service_role;
REVOKE ALL ON public.ueradar_usage_ledger FROM anon, authenticated, PUBLIC;
ALTER TABLE public.ueradar_usage_ledger ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ueradar_consume_quota_once(
  _tenant uuid, _period text, _kind text, _opportunity text, _limit integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _used integer; _current integer;
BEGIN
  IF _tenant IS NULL OR _period IS NULL OR _opportunity IS NULL OR _opportunity = ''
     OR _kind NOT IN ('deep_verifications','dossiers') THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'INVALID_INPUT', 'used', 0);
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_tenant::text || ':' || _period || ':' || _kind || ':' || _opportunity, 0));

  INSERT INTO public.ueradar_usage_counters (user_id, period_ym)
  VALUES (_tenant, _period)
  ON CONFLICT (user_id, period_ym) DO NOTHING;

  -- Riapertura della stessa opportunità nello stesso periodo: nessun nuovo consumo.
  IF EXISTS (SELECT 1 FROM public.ueradar_usage_ledger
             WHERE tenant_id = _tenant AND period_ym = _period
               AND kind = _kind AND opportunity_id = _opportunity) THEN
    SELECT CASE WHEN _kind = 'deep_verifications' THEN deep_verifications ELSE dossiers END
    INTO _current FROM public.ueradar_usage_counters
    WHERE user_id = _tenant AND period_ym = _period;
    RETURN jsonb_build_object('allowed', true, 'code', 'ALREADY_CLAIMED',
                              'used', coalesce(_current, 0));
  END IF;

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

  INSERT INTO public.ueradar_usage_ledger (tenant_id, period_ym, kind, opportunity_id)
  VALUES (_tenant, _period, _kind, _opportunity);

  RETURN jsonb_build_object('allowed', true, 'code', 'OK', 'used', _used);
END;
$$;

REVOKE ALL ON FUNCTION public.ueradar_consume_quota_once(uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_consume_quota_once(uuid, text, text, text, integer) TO service_role;

-- 4) Eventi di fatturazione: ordinamento e antiregressione degli stati.
ALTER TABLE public.ueradar_billing_events ADD COLUMN IF NOT EXISTS event_created_at timestamptz;
ALTER TABLE public.ueradar_subscriptions ADD COLUMN IF NOT EXISTS last_event_created_at timestamptz;