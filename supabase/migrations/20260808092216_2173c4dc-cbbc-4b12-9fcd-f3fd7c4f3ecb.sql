-- UEradar: hardening privilegi tabelle private (RLS non copre TRUNCATE)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'company_profiles','feed_cache','cached_hidden_bandi','daily_notifications',
    'notification_preferences','ueradar_subscriptions','ueradar_company_members',
    'ueradar_billing_events'
  ] LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM anon, authenticated, PUBLIC', t);
  END LOOP;
END $$;

-- Registro eventi fatturazione: nessun accesso via Data API.
REVOKE ALL ON public.ueradar_billing_events FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.ueradar_billing_events TO service_role;

-- Membri impresa: sola lettura per authenticated, mutazioni solo server-side.
REVOKE ALL ON public.ueradar_company_members FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.ueradar_company_members TO authenticated;
GRANT ALL ON public.ueradar_company_members TO service_role;

-- Abbonamenti: sola lettura (policy per tenant), scritture solo server-side.
REVOKE ALL ON public.ueradar_subscriptions FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.ueradar_subscriptions TO authenticated;
GRANT ALL ON public.ueradar_subscriptions TO service_role;

-- Notifiche: lettura e aggiornamento (lettura/letto), niente insert o delete dal client.
REVOKE ALL ON public.daily_notifications FROM anon, authenticated, PUBLIC;
GRANT SELECT, UPDATE ON public.daily_notifications TO authenticated;
GRANT ALL ON public.daily_notifications TO service_role;

-- Dati d'impresa e cache gestiti dall'utente entro le policy di tenant.
REVOKE ALL ON public.company_profiles FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_profiles TO authenticated;
GRANT ALL ON public.company_profiles TO service_role;

REVOKE ALL ON public.feed_cache FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_cache TO authenticated;
GRANT ALL ON public.feed_cache TO service_role;

REVOKE ALL ON public.cached_hidden_bandi FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cached_hidden_bandi TO authenticated;
GRANT ALL ON public.cached_hidden_bandi TO service_role;

REVOKE ALL ON public.notification_preferences FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
