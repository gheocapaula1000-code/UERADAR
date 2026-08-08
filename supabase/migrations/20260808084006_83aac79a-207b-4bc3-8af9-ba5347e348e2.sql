ALTER TABLE public.ueradar_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS plan_seats integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trial_consumed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS latest_invoice_url text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'test';

CREATE UNIQUE INDEX IF NOT EXISTS ueradar_subscriptions_customer_idx
  ON public.ueradar_subscriptions (provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ueradar_company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'invited',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ueradar_company_members_owner_email_idx
  ON public.ueradar_company_members (owner_user_id, lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ueradar_company_members TO authenticated;
GRANT ALL ON public.ueradar_company_members TO service_role;
ALTER TABLE public.ueradar_company_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ueradar_members_owner_manage ON public.ueradar_company_members;
CREATE POLICY ueradar_members_owner_manage ON public.ueradar_company_members
  FOR ALL TO authenticated
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS ueradar_members_self_read ON public.ueradar_company_members;
CREATE POLICY ueradar_members_self_read ON public.ueradar_company_members
  FOR SELECT TO authenticated
  USING (auth.uid() = member_user_id);

DROP TRIGGER IF EXISTS ueradar_company_members_updated_at ON public.ueradar_company_members;
CREATE TRIGGER ueradar_company_members_updated_at
  BEFORE UPDATE ON public.ueradar_company_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.ueradar_billing_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ueradar_billing_events TO service_role;
ALTER TABLE public.ueradar_billing_events ENABLE ROW LEVEL SECURITY;