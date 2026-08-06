
CREATE TABLE public.cached_hidden_bandi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  bando_id text NOT NULL,
  payload jsonb NOT NULL,
  fonte_extratestuale text,
  competition_index integer,
  comune text,
  provincia text,
  codice_istat text,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, bando_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cached_hidden_bandi TO authenticated;
GRANT ALL ON public.cached_hidden_bandi TO service_role;

ALTER TABLE public.cached_hidden_bandi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own hidden bandi cache"
  ON public.cached_hidden_bandi
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_cached_hidden_bandi_updated_at
  BEFORE UPDATE ON public.cached_hidden_bandi
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.company_profiles
  ADD COLUMN IF NOT EXISTS codice_istat text;
