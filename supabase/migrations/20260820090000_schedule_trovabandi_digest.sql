-- replay-safe: idempotent
-- UERADAR only (config.toml project_id fbqjrmhvxxujpzztgvsc).
-- Schedules trovabandi-digest. Does not change billing or the feed contract.
-- pg_cron.timezone cannot be changed without a server restart (stays GMT).
-- Morning 04:40 GMT = 06:40 Europe/Rome CEST, after Core release_gate 06:25.
-- Urgent 10:15 GMT = 12:15 Europe/Rome CEST. Winter these are 05:40 / 11:15 CET;
-- the Edge Function fail-closes if release_gate is not 200 / gate_passed /
-- cron_activation_allowed. Do not weaken that gate.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM PUBLIC;
REVOKE ALL ON SCHEMA internal FROM anon, authenticated;
GRANT USAGE ON SCHEMA internal TO postgres;

CREATE OR REPLACE FUNCTION internal.invoke_trovabandi_digest(p_mode text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
  v_url constant text :=
    'https://fbqjrmhvxxujpzztgvsc.supabase.co/functions/v1/trovabandi-digest';
  v_count integer;
  v_pages integer;
  v_limit constant integer := 10;
  v_page integer;
  v_offset integer;
BEGIN
  IF p_mode IS DISTINCT FROM 'morning' AND p_mode IS DISTINCT FROM 'urgent' THEN
    RAISE EXCEPTION 'INVALID_DIGEST_MODE';
  END IF;

  SELECT ds.decrypted_secret
    INTO v_secret
    FROM vault.decrypted_secrets AS ds
   WHERE ds.name = 'TROVABANDI_CRON_SECRET'
   LIMIT 1;

  IF v_secret IS NULL OR btrim(v_secret) = '' THEN
    RAISE EXCEPTION 'TROVABANDI_CRON_SECRET missing from vault';
  END IF;

  -- pg_net sends only after commit, so we cannot wait on has_more in this
  -- transaction. Page by profile count with the same limit the function uses;
  -- that is the same walk as next_offset until has_more is false.
  SELECT count(*)::integer INTO v_count FROM public.company_profiles;
  v_pages := GREATEST(1, CEIL(v_count::numeric / v_limit)::integer);
  IF v_pages > 50 THEN
    v_pages := 50;
  END IF;

  FOR v_page IN 0 .. (v_pages - 1) LOOP
    v_offset := v_page * v_limit;
    PERFORM net.http_post(
      url := v_url,
      body := jsonb_build_object(
        'mode', p_mode,
        'offset', v_offset,
        'limit', v_limit
      ),
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', v_secret
      ),
      timeout_milliseconds := 120000
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION internal.invoke_trovabandi_digest(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION internal.invoke_trovabandi_digest(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.invoke_trovabandi_digest(text) TO postgres;

DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE EXCEPTION 'cron.job missing after pg_cron enable';
  END IF;
  FOR r IN
    SELECT j.jobname
      FROM cron.job AS j
     WHERE j.jobname LIKE 'trovabandi-digest%'
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'trovabandi-digest-morning',
  '40 4 * * *',
  $cron$SELECT internal.invoke_trovabandi_digest('morning')$cron$
);

SELECT cron.schedule(
  'trovabandi-digest-urgent',
  '15 10 * * *',
  $cron$SELECT internal.invoke_trovabandi_digest('urgent')$cron$
);
