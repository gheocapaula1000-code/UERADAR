-- Test di integrazione eseguito sul database reale: prova che la transizione
-- pending -> trialing passi il CHECK su trial_source e duri esattamente 168 ore.
-- Lo stato originale della riga viene ripristinato nella stessa transazione.
DO $$
DECLARE
  _uid uuid;
  _before public.ueradar_subscriptions%ROWTYPE;
  _after public.ueradar_subscriptions%ROWTYPE;
  _res jsonb;
  _vat text := 'IT99999999999';
BEGIN
  SELECT * INTO _before FROM public.ueradar_subscriptions ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN
    RAISE NOTICE 'TRIAL_TEST_SKIPPED: nessuna riga abbonamento';
    RETURN;
  END IF;
  _uid := _before.user_id;

  -- Stato di partenza equivalente a un account appena registrato.
  UPDATE public.ueradar_subscriptions
  SET status = 'pending', plan_code = 'ueradar_trial', trial_source = NULL,
      trial_started_at = NULL, trial_ends_at = NULL, trial_consumed = false,
      provider = NULL, provider_subscription_id = NULL
  WHERE user_id = _uid;

  _res := public.ueradar_start_trial(_uid, _vat, NULL);
  IF coalesce(_res->>'code', '') <> 'TRIAL_STARTED' THEN
    RAISE EXCEPTION 'TRIAL_TEST_FAILED: avvio prova non riuscito (%)', _res;
  END IF;

  SELECT * INTO _after FROM public.ueradar_subscriptions WHERE user_id = _uid;
  IF _after.status <> 'trialing' THEN
    RAISE EXCEPTION 'TRIAL_TEST_FAILED: stato atteso trialing, trovato %', _after.status;
  END IF;
  IF _after.trial_source IS DISTINCT FROM 'app_vat_verified' THEN
    RAISE EXCEPTION 'TRIAL_TEST_FAILED: trial_source non ammesso (%)', _after.trial_source;
  END IF;
  IF _after.trial_ends_at - _after.trial_started_at <> interval '168 hours' THEN
    RAISE EXCEPTION 'TRIAL_TEST_FAILED: durata attesa 168 ore, trovata %',
      _after.trial_ends_at - _after.trial_started_at;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ueradar_trial_registry
    WHERE fingerprint_type = 'vat'
      AND fingerprint_value = public.ueradar_trial_fingerprint('vat', 'IT99999999999')
  ) THEN
    RAISE EXCEPTION 'TRIAL_TEST_FAILED: impronta anti-riapertura non registrata';
  END IF;

  -- Ripristino: nessuna traccia del test resta nei dati.
  DELETE FROM public.ueradar_trial_registry
  WHERE fingerprint_value = public.ueradar_trial_fingerprint('vat', 'IT99999999999');

  UPDATE public.ueradar_subscriptions
  SET status = _before.status, plan_code = _before.plan_code,
      trial_source = _before.trial_source, trial_started_at = _before.trial_started_at,
      trial_ends_at = _before.trial_ends_at, trial_consumed = _before.trial_consumed,
      provider = _before.provider, provider_subscription_id = _before.provider_subscription_id
  WHERE user_id = _uid;

  RAISE NOTICE 'TRIAL_TEST_PASSED';
END;
$$;