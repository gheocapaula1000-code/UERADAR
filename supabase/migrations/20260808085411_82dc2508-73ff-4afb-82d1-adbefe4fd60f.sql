-- Eventi di fatturazione: nessun payload personale, solo metadati minimi e stato
ALTER TABLE public.ueradar_billing_events
  DROP COLUMN IF EXISTS payload;

ALTER TABLE public.ueradar_billing_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processing',
  ADD COLUMN IF NOT EXISTS object_id text,
  ADD COLUMN IF NOT EXISTS provider_customer_id text,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.ueradar_billing_events
  ALTER COLUMN processed_at DROP NOT NULL,
  ALTER COLUMN processed_at DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ueradar_billing_events_status_chk'
  ) THEN
    ALTER TABLE public.ueradar_billing_events
      ADD CONSTRAINT ueradar_billing_events_status_chk
      CHECK (status IN ('processing', 'succeeded', 'failed'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS ueradar_billing_events_updated_at ON public.ueradar_billing_events;
CREATE TRIGGER ueradar_billing_events_updated_at
  BEFORE UPDATE ON public.ueradar_billing_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Utenti nominativi: dati anagrafici, ruolo dichiarato e attestazione del titolare
ALTER TABLE public.ueradar_company_members
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS declared_role text,
  ADD COLUMN IF NOT EXISTS owner_attested_at timestamptz,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ueradar_company_members_declared_role_chk'
  ) THEN
    ALTER TABLE public.ueradar_company_members
      ADD CONSTRAINT ueradar_company_members_declared_role_chk
      CHECK (declared_role IS NULL OR declared_role IN ('dipendente', 'socio', 'amministratore'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ueradar_company_members_status_chk'
  ) THEN
    ALTER TABLE public.ueradar_company_members
      ADD CONSTRAINT ueradar_company_members_status_chk
      CHECK (status IN ('invited', 'accepted', 'revoked'));
  END IF;
END $$;

-- Un utente accettato può appartenere a una sola impresa
CREATE UNIQUE INDEX IF NOT EXISTS ueradar_company_members_single_company_idx
  ON public.ueradar_company_members (member_user_id)
  WHERE member_user_id IS NOT NULL;

-- L'invitato vede e accetta solo l'invito destinato alla propria email
DROP POLICY IF EXISTS ueradar_members_self_read ON public.ueradar_company_members;
CREATE POLICY ueradar_members_self_read ON public.ueradar_company_members
  FOR SELECT TO authenticated
  USING (
    auth.uid() = member_user_id
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

DROP POLICY IF EXISTS ueradar_members_self_accept ON public.ueradar_company_members;
CREATE POLICY ueradar_members_self_accept ON public.ueradar_company_members
  FOR UPDATE TO authenticated
  USING (
    status = 'invited'
    AND member_user_id IS NULL
    AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  WITH CHECK (
    member_user_id = auth.uid()
    AND lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );