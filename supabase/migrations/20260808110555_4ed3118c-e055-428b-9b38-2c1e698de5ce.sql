-- Backfill idempotente: ogni prova già avviata lascia la propria impronta,
-- altrimenti dopo la migrazione la stessa impresa potrebbe riaprire una prova
-- con un nuovo account.
INSERT INTO public.ueradar_trial_registry (fingerprint_type, fingerprint_value, user_id, started_at)
SELECT 'vat',
       public.ueradar_trial_fingerprint(
         'vat', upper(regexp_replace(coalesce(c.partita_iva, ''), '[^0-9A-Za-z]', '', 'g'))),
       s.user_id,
       coalesce(s.trial_started_at, s.created_at)
FROM public.ueradar_subscriptions s
JOIN public.company_profiles c ON c.user_id = s.user_id
WHERE s.trial_started_at IS NOT NULL
  AND length(regexp_replace(coalesce(c.partita_iva, ''), '[^0-9A-Za-z]', '', 'g')) >= 8
ON CONFLICT (fingerprint_type, fingerprint_value) DO NOTHING;

INSERT INTO public.ueradar_trial_registry (fingerprint_type, fingerprint_value, user_id, started_at)
SELECT 'domain',
       public.ueradar_trial_fingerprint('domain', lower(split_part(u.email, '@', 2))),
       s.user_id,
       coalesce(s.trial_started_at, s.created_at)
FROM public.ueradar_subscriptions s
JOIN auth.users u ON u.id = s.user_id
JOIN public.company_profiles c ON c.user_id = s.user_id
WHERE s.trial_started_at IS NOT NULL
  AND length(regexp_replace(coalesce(c.partita_iva, ''), '[^0-9A-Za-z]', '', 'g')) >= 8
  AND coalesce(split_part(u.email, '@', 2), '') <> ''
ON CONFLICT (fingerprint_type, fingerprint_value) DO NOTHING;