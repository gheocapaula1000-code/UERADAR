-- Additive fields required for honest eligibility matching.
ALTER TABLE public.company_profiles
  ADD COLUMN IF NOT EXISTS impresa_giovanile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS startup_innovativa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pmi_innovativa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dimensione_impresa text,
  ADD COLUMN IF NOT EXISTS ateco_secondari text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS investimenti_previsti text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS spesa_prevista numeric(15,2),
  ADD COLUMN IF NOT EXISTS de_minimis_ultimi_3_anni numeric(15,2),
  ADD COLUMN IF NOT EXISTS impresa_in_difficolta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paese_sede text NOT NULL DEFAULT 'IT',
  ADD COLUMN IF NOT EXISTS disponibile_consorzio_europeo boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.company_profiles
    ADD CONSTRAINT company_profiles_dimensione_impresa_check
    CHECK (dimensione_impresa IS NULL OR dimensione_impresa IN ('MICRO', 'PICCOLA', 'MEDIA', 'GRANDE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
