CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  urgent_enabled boolean NOT NULL DEFAULT true,
  morning_digest_enabled boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'Europe/Rome',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id text NOT NULL,
  notification_type text NOT NULL CHECK (notification_type IN ('NEW_MATCH', 'URGENT_DEADLINE', 'CLICK_DAY', 'UPDATED')),
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  emailed_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, opportunity_id, notification_type)
);

CREATE INDEX IF NOT EXISTS daily_notifications_user_idx
  ON public.daily_notifications (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT SELECT, UPDATE ON public.daily_notifications TO authenticated;
GRANT ALL ON public.notification_preferences, public.daily_notifications TO service_role;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification preferences"
  ON public.notification_preferences FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users read own notifications"
  ON public.daily_notifications FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications"
  ON public.daily_notifications FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);