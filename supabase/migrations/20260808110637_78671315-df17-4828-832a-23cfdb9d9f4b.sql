CREATE OR REPLACE FUNCTION public.ueradar_start_trial(_user_id uuid, _vat text, _domain text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Una prova già in corso non viene mai interrotta o riavviata, ma la sua
  -- impronta va comunque registrata: altrimenti la stessa impresa potrebbe
  -- riaprire subito una prova con un nuovo account.
  IF _sub.status = 'trialing' AND _sub.trial_ends_at IS NOT NULL AND _sub.trial_ends_at > _now THEN
    INSERT INTO public.ueradar_trial_registry (fingerprint_type, fingerprint_value, user_id, started_at)
    VALUES ('vat', public.ueradar_trial_fingerprint('vat', _vatn), _user_id,
            coalesce(_sub.trial_started_at, _now))
    ON CONFLICT (fingerprint_type, fingerprint_value) DO NOTHING;
    IF _domn IS NOT NULL THEN
      INSERT INTO public.ueradar_trial_registry (fingerprint_type, fingerprint_value, user_id, started_at)
      VALUES ('domain', public.ueradar_trial_fingerprint('domain', _domn), _user_id,
              coalesce(_sub.trial_started_at, _now))
      ON CONFLICT (fingerprint_type, fingerprint_value) DO NOTHING;
    END IF;
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

  PERFORM pg_advisory_xact_lock(hashtextextended('ueradar_trial_vat:' || _vatn, 0));
  IF _domn IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('ueradar_trial_domain:' || _domn, 0));
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ueradar_trial_registry r
    WHERE ((r.fingerprint_type = 'vat'
            AND r.fingerprint_value = public.ueradar_trial_fingerprint('vat', _vatn))
        OR (_domn IS NOT NULL AND r.fingerprint_type = 'domain'
            AND r.fingerprint_value = public.ueradar_trial_fingerprint('domain', _domn)))
      AND r.started_at > _now - interval '12 months'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TRIAL_COOLDOWN_ACTIVE');
  END IF;

  INSERT INTO public.ueradar_trial_registry (fingerprint_type, fingerprint_value, user_id, started_at)
  VALUES ('vat', public.ueradar_trial_fingerprint('vat', _vatn), _user_id, _now)
  ON CONFLICT (fingerprint_type, fingerprint_value)
  DO UPDATE SET user_id = EXCLUDED.user_id, started_at = EXCLUDED.started_at;

  IF _domn IS NOT NULL THEN
    INSERT INTO public.ueradar_trial_registry (fingerprint_type, fingerprint_value, user_id, started_at)
    VALUES ('domain', public.ueradar_trial_fingerprint('domain', _domn), _user_id, _now)
    ON CONFLICT (fingerprint_type, fingerprint_value)
    DO UPDATE SET user_id = EXCLUDED.user_id, started_at = EXCLUDED.started_at;
  END IF;

  _ends := _now + interval '168 hours';

  UPDATE public.ueradar_subscriptions
  SET status = 'trialing',
      plan_code = 'ueradar_trial',
      plan_seats = 1,
      trial_started_at = _now,
      trial_ends_at = _ends,
      trial_source = 'app_no_card'
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRIAL_ACTIVATION_FAILED';
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'TRIAL_STARTED', 'trial_ends_at', _ends);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ueradar_start_trial(uuid, text, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.ueradar_start_trial(uuid, text, text) TO service_role;