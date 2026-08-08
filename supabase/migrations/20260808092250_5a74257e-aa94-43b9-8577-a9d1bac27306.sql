DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'company_profiles','feed_cache','cached_hidden_bandi','notification_preferences'
  ] LOOP
    EXECUTE format('REVOKE MAINTAIN ON public.%I FROM anon, authenticated, PUBLIC', t);
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  -- MAINTAIN non esiste su versioni Postgres precedenti: nessuna azione necessaria.
  NULL;
END $$;
