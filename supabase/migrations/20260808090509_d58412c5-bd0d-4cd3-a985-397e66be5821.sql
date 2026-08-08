-- La variante parametrica resta di sistema: nessun client può interrogarla.
REVOKE ALL ON FUNCTION public.ueradar_tenant_owner(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ueradar_tenant_owner(uuid) TO service_role;

-- Le funzioni usate dalle policy leggono solo l'impresa dell'utente corrente.
CREATE OR REPLACE FUNCTION public.ueradar_current_tenant()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT m.owner_user_id
      FROM public.ueradar_company_members m
      WHERE m.member_user_id = auth.uid()
        AND m.status = 'accepted'
      ORDER BY m.accepted_at NULLS LAST, m.created_at
      LIMIT 1
    ),
    auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.ueradar_is_tenant_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.ueradar_company_members m
       WHERE m.member_user_id = auth.uid() AND m.status = 'accepted'
     );
$$;

REVOKE ALL ON FUNCTION public.ueradar_current_tenant() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ueradar_is_tenant_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ueradar_current_tenant() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ueradar_is_tenant_owner() TO authenticated, service_role;
