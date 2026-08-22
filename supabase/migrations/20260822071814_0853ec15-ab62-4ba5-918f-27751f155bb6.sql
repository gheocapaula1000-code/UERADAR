-- 1) Nessuna funzione del progetto è eseguibile dai ruoli client per default.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- 2) Solo gli helper usati dalle policy RLS tornano eseguibili dagli utenti autenticati.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_current_tenant() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_is_tenant_owner() TO authenticated;

-- 3) Tabelle interne: RLS attiva e nessun privilegio client (fail-closed esplicito).
ALTER TABLE public.feed_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cached_hidden_bandi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ueradar_checkout_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ueradar_usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ueradar_usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ueradar_trial_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ueradar_billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ueradar_company_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.feed_cache FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.cached_hidden_bandi FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.ueradar_checkout_intents FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.ueradar_usage_counters FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.ueradar_usage_ledger FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.ueradar_trial_registry FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.ueradar_billing_events FROM anon, authenticated, PUBLIC;

GRANT ALL ON public.feed_cache TO service_role;
GRANT ALL ON public.cached_hidden_bandi TO service_role;
GRANT ALL ON public.ueradar_checkout_intents TO service_role;
GRANT ALL ON public.ueradar_usage_counters TO service_role;
GRANT ALL ON public.ueradar_usage_ledger TO service_role;
GRANT ALL ON public.ueradar_trial_registry TO service_role;
GRANT ALL ON public.ueradar_billing_events TO service_role;

-- 4) Membri impresa: sola lettura per i client, scritture solo lato server.
REVOKE ALL ON public.ueradar_company_members FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.ueradar_company_members TO authenticated;
GRANT ALL ON public.ueradar_company_members TO service_role;