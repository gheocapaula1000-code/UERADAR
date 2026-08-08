-- La cache è contenuto premium: il browser non deve poterla leggere o scrivere
-- aggirando il gate applicativo. Accesso solo dal percorso server (service role).
REVOKE ALL ON public.feed_cache FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.cached_hidden_bandi FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.feed_cache TO service_role;
GRANT ALL ON public.cached_hidden_bandi TO service_role;

-- RLS resta attiva: nessuna policy per i client, il service role la bypassa.
DROP POLICY IF EXISTS "Users manage own feed cache" ON public.feed_cache;
DROP POLICY IF EXISTS "Tenant members use feed cache" ON public.feed_cache;
DROP POLICY IF EXISTS "Feed cache confined to tenant" ON public.feed_cache;
DROP POLICY IF EXISTS "Users manage own hidden bandi cache" ON public.cached_hidden_bandi;
DROP POLICY IF EXISTS "Tenant members use hidden bandi cache" ON public.cached_hidden_bandi;
DROP POLICY IF EXISTS "Hidden bandi cache confined to tenant" ON public.cached_hidden_bandi;