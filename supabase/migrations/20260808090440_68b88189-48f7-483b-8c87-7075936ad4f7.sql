-- 1) Risoluzione autoritativa del tenant (impresa) --------------------------
CREATE OR REPLACE FUNCTION public.ueradar_tenant_owner(_user_id uuid)
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
      WHERE m.member_user_id = _user_id
        AND m.status = 'accepted'
      ORDER BY m.accepted_at NULLS LAST, m.created_at
      LIMIT 1
    ),
    _user_id
  );
$$;

REVOKE ALL ON FUNCTION public.ueradar_tenant_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ueradar_tenant_owner(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ueradar_current_tenant()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.ueradar_tenant_owner(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.ueradar_current_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ueradar_current_tenant() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ueradar_is_tenant_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND public.ueradar_tenant_owner(auth.uid()) = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.ueradar_is_tenant_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ueradar_is_tenant_owner() TO authenticated, service_role;

-- 2) company_profiles: lettura condivisa, scrittura solo del titolare -------
DROP POLICY IF EXISTS "Tenant members read company profile" ON public.company_profiles;
CREATE POLICY "Tenant members read company profile"
  ON public.company_profiles FOR SELECT TO authenticated
  USING (user_id = public.ueradar_current_tenant());

DROP POLICY IF EXISTS "Company profile confined to tenant" ON public.company_profiles;
CREATE POLICY "Company profile confined to tenant"
  ON public.company_profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = public.ueradar_current_tenant())
  WITH CHECK (user_id = public.ueradar_current_tenant() AND public.ueradar_is_tenant_owner());

-- 3) feed_cache: lettura/scrittura confinate al tenant ----------------------
DROP POLICY IF EXISTS "Tenant members use feed cache" ON public.feed_cache;
CREATE POLICY "Tenant members use feed cache"
  ON public.feed_cache FOR ALL TO authenticated
  USING (user_id = public.ueradar_current_tenant())
  WITH CHECK (user_id = public.ueradar_current_tenant());

DROP POLICY IF EXISTS "Feed cache confined to tenant" ON public.feed_cache;
CREATE POLICY "Feed cache confined to tenant"
  ON public.feed_cache AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = public.ueradar_current_tenant())
  WITH CHECK (user_id = public.ueradar_current_tenant());

-- 4) cached_hidden_bandi ----------------------------------------------------
DROP POLICY IF EXISTS "Tenant members use hidden bandi cache" ON public.cached_hidden_bandi;
CREATE POLICY "Tenant members use hidden bandi cache"
  ON public.cached_hidden_bandi FOR ALL TO authenticated
  USING (user_id = public.ueradar_current_tenant())
  WITH CHECK (user_id = public.ueradar_current_tenant());

DROP POLICY IF EXISTS "Hidden bandi cache confined to tenant" ON public.cached_hidden_bandi;
CREATE POLICY "Hidden bandi cache confined to tenant"
  ON public.cached_hidden_bandi AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = public.ueradar_current_tenant())
  WITH CHECK (user_id = public.ueradar_current_tenant());

-- 5) daily_notifications ----------------------------------------------------
DROP POLICY IF EXISTS "Tenant members read notifications" ON public.daily_notifications;
CREATE POLICY "Tenant members read notifications"
  ON public.daily_notifications FOR SELECT TO authenticated
  USING (user_id = public.ueradar_current_tenant());

DROP POLICY IF EXISTS "Tenant members update notifications" ON public.daily_notifications;
CREATE POLICY "Tenant members update notifications"
  ON public.daily_notifications FOR UPDATE TO authenticated
  USING (user_id = public.ueradar_current_tenant())
  WITH CHECK (user_id = public.ueradar_current_tenant());

DROP POLICY IF EXISTS "Notifications confined to tenant" ON public.daily_notifications;
CREATE POLICY "Notifications confined to tenant"
  ON public.daily_notifications AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = public.ueradar_current_tenant())
  WITH CHECK (user_id = public.ueradar_current_tenant());

-- 6) notification_preferences: restano personali, ma mai di terzi ----------
DROP POLICY IF EXISTS "Notification preferences stay personal" ON public.notification_preferences;
CREATE POLICY "Notification preferences stay personal"
  ON public.notification_preferences AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 7) Abbonamento: i membri leggono, non modificano -------------------------
DROP POLICY IF EXISTS "Tenant members read subscription" ON public.ueradar_subscriptions;
CREATE POLICY "Tenant members read subscription"
  ON public.ueradar_subscriptions FOR SELECT TO authenticated
  USING (user_id = public.ueradar_current_tenant());

-- 8) Piano predefinito allineato al catalogo pubblico ----------------------
ALTER TABLE public.ueradar_subscriptions
  ALTER COLUMN plan_code SET DEFAULT 'ueradar_business_monthly';
