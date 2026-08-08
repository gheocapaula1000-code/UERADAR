-- UEradar: hardening RLS ueradar_company_members (nessun write diretto dal client)
DROP POLICY IF EXISTS "ueradar_members_self_accept" ON public.ueradar_company_members;
DROP POLICY IF EXISTS "ueradar_members_owner_manage" ON public.ueradar_company_members;
DROP POLICY IF EXISTS "ueradar_members_self_read" ON public.ueradar_company_members;

REVOKE INSERT, UPDATE, DELETE ON public.ueradar_company_members FROM authenticated;
REVOKE ALL ON public.ueradar_company_members FROM anon;
GRANT SELECT ON public.ueradar_company_members TO authenticated;
GRANT ALL ON public.ueradar_company_members TO service_role;

ALTER TABLE public.ueradar_company_members ENABLE ROW LEVEL SECURITY;

-- Solo letture minime: il titolare legge i propri posti.
CREATE POLICY "ueradar_members_owner_read"
ON public.ueradar_company_members
FOR SELECT
TO authenticated
USING (auth.uid() = owner_user_id);

-- L'invitato legge la propria riga o l'invito indirizzato alla sua email.
CREATE POLICY "ueradar_members_self_read"
ON public.ueradar_company_members
FOR SELECT
TO authenticated
USING (
  auth.uid() = member_user_id
  OR lower(email) = lower(COALESCE((auth.jwt() ->> 'email'), ''))
);
