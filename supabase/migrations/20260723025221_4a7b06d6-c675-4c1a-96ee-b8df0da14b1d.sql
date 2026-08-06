-- replay-safe: idempotent (no duplicate_object on fresh replay or already-migrated DB)
DO $$ BEGIN
  CREATE TYPE public.legal_form AS ENUM ('DITTA_INDIVIDUALE', 'SRL', 'SRLS', 'SPA', 'SAS', 'SNC', 'ALTRO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.company_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  ragione_sociale TEXT NOT NULL,
  partita_iva TEXT NOT NULL,
  forma_giuridica public.legal_form NOT NULL,
  codice_ateco TEXT NOT NULL,
  regione TEXT NOT NULL,
  provincia TEXT NOT NULL,
  comune TEXT NOT NULL,
  numero_dipendenti INTEGER NOT NULL DEFAULT 0,
  fatturato_annuo NUMERIC(15,2) NOT NULL DEFAULT 0,
  anno_costituzione INTEGER NOT NULL,
  imprenditoria_femminile BOOLEAN NOT NULL DEFAULT false,
  legale_rappresentante TEXT,
  email_referente TEXT,
  telefono TEXT,
  pec TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_profiles TO authenticated;
GRANT ALL ON public.company_profiles TO service_role;
ALTER TABLE public.company_profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_profiles' AND policyname = 'Users manage own company profile'
  ) THEN
    CREATE POLICY "Users manage own company profile" ON public.company_profiles
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.feed_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feed_cache_user_idx ON public.feed_cache(user_id, fetched_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feed_cache TO authenticated;
GRANT ALL ON public.feed_cache TO service_role;
ALTER TABLE public.feed_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'feed_cache' AND policyname = 'Users manage own feed cache'
  ) THEN
    CREATE POLICY "Users manage own feed cache" ON public.feed_cache
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE TRIGGER company_profiles_updated_at BEFORE UPDATE ON public.company_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
