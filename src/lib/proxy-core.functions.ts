import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { FeedResponse, Bando } from "./bandocore-types";

const PROXY_CORE_URL = "https://proxy-core.com";

const InputSchema = z.object({
  force_refresh: z.boolean().optional(),
});

/**
 * fetchFeedFromProxyCore
 * - Loads the authenticated user's company_profiles row.
 * - POSTs the full profile as JSON to https://proxy-core.com.
 * - Persists the returned payload in feed_cache so the app can serve
 *   the last useful feed offline.
 * - Falls back to the latest cache entry when the proxy is unreachable.
 *
 * No proprietary API keys ship with the client: scraping + AI keys
 * live inside the Proxy-Core service.
 */
export const fetchFeedFromProxyCore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input ?? {}))
  .handler(async ({ context }): Promise<FeedResponse> => {
    const { supabase, userId } = context;

    const { data: profile, error: profileError } = await supabase
      .from("company_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) throw new Error("Impossibile leggere il profilo aziendale");
    if (!profile) throw new Error("PROFILE_MISSING");

    let bandi: Bando[] | null = null;
    let source: FeedResponse["source"] = "proxy-core";

    try {
      const res = await fetch(PROXY_CORE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-BandoCore-Client": "web",
        },
        body: JSON.stringify({ profile }),
        signal: AbortSignal.timeout(25_000),
      });

      if (!res.ok) throw new Error(`Proxy-Core HTTP ${res.status}`);
      const payload = (await res.json()) as { bandi?: Bando[] } | Bando[];
      bandi = Array.isArray(payload) ? payload : (payload.bandi ?? []);
    } catch (err) {
      console.warn("[proxy-core] fetch failed, falling back to cache:", err);
      const { data: cached } = await supabase
        .from("feed_cache")
        .select("payload, fetched_at")
        .eq("user_id", userId)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached?.payload) {
        const cachedBandi = (cached.payload as { bandi?: Bando[] }).bandi ?? [];
        return {
          bandi: cachedBandi,
          fetched_at: cached.fetched_at,
          source: "cache",
        };
      }
      throw new Error("Proxy-Core non raggiungibile e nessuna cache disponibile.");
    }

    const fetched_at = new Date().toISOString();
    // Persist in feed_cache for offline availability
    await supabase.from("feed_cache").insert({
      user_id: userId,
      payload: { bandi },
      fetched_at,
    });

    return { bandi: bandi ?? [], fetched_at, source };
  });

export const loadCachedFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeedResponse | null> => {
    const { data } = await context.supabase
      .from("feed_cache")
      .select("payload, fetched_at")
      .eq("user_id", context.userId)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const bandi = (data.payload as { bandi?: Bando[] }).bandi ?? [];
    return { bandi, fetched_at: data.fetched_at, source: "cache" };
  });