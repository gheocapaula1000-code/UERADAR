/**
 * Accesso server-only alla cache del feed.
 * `feed_cache` e `cached_hidden_bandi` non sono più raggiungibili dalla Data
 * API con il ruolo `authenticated`: il browser non può leggerle o scriverle
 * direttamente, quindi ogni operazione passa da qui dopo autenticazione e
 * risoluzione del tenant lato server.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function cacheClient(): SupabaseClient {
  return createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}