import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { FeedResponse, Bando } from "./bandocore-types";
import { mapCoreOpportunity, parseGatewayEnvelope } from "./proxy-core.server";
import { decideFeedCache } from "./feed-cache-policy";
import type { Json } from "@/integrations/supabase/types";

const InputSchema = z.object({
  force_refresh: z.boolean().optional(),
  deep_search: z.boolean().optional(),
});

// fetchFeedFromProxyCore
// - Nessun secret del Central Core viene letto qui: la server function invoca
//   la Edge Function `trovabandi-feed` con il client user-scoped, che inoltra
//   il JWT dell'utente. Solo la Edge Function conosce URL e chiave del Core.
// - Persiste il feed completo in feed_cache (offline) e i bandi "sommersi"
//   in cached_hidden_bandi, sempre sotto RLS dell'utente.
export const fetchFeedFromProxyCore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => InputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<FeedResponse> => {
    const { supabase, userId } = context;
    const deepSearch = data.deep_search ?? true;

    let bandi: Bando[] | null = null;
    let fetchedAt = new Date().toISOString();
    let generatedAt = fetchedAt;
    const source: FeedResponse["source"] = "central-core";
    let persistHiddenCache = false;

    try {
      if (data.force_refresh) {
        // La coda deve confermare {ok:true, queued:true}: nessun refresh "finto".
        const { data: refreshPayload, error: refreshError } = await supabase.functions.invoke(
          "trovabandi-feed",
          { body: { action: "request_refresh" } },
        );
        if (refreshError) throw new Error("REFRESH_QUEUE_FAILED");
        const refresh = refreshPayload as { ok?: unknown; queued?: unknown } | null;
        if (!refresh || refresh.ok !== true || refresh.queued !== true)
          throw new Error("REFRESH_QUEUE_FAILED");
      }

      const { data: payload, error } = await supabase.functions.invoke("trovabandi-feed", {
        body: { action: "feed" },
      });
      if (error) throw new Error("GATEWAY_ERROR");

      const envelope = parseGatewayEnvelope(payload);
      if (!envelope) throw new Error("GATEWAY_INVALID_PAYLOAD");
      bandi = envelope.bandi.map((item) => mapCoreOpportunity(item));
      fetchedAt = envelope.fetched_at;
      generatedAt = envelope.generated_at;

      const { data: previousRow, error: previousError } = await supabase
        .from("feed_cache")
        .select("payload, fetched_at")
        .eq("user_id", userId)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previousError) throw new Error("CACHE_READ_FAILED");

      const previous = previousRow?.payload
        ? ({
            ...(previousRow.payload as unknown as FeedResponse),
            fetched_at: previousRow.fetched_at,
            source: "cache",
          } as FeedResponse)
        : null;
      const next: FeedResponse = {
        bandi,
        fetched_at: fetchedAt,
        generated_at: generatedAt,
        source,
        deep_search: deepSearch,
      };
      const cacheDecision = decideFeedCache(previous, next);
      if (cacheDecision === "reuse-previous" && previous) return previous;
      if (cacheDecision === "persist") {
        persistHiddenCache = true;
        const { error: cacheWriteError } = await supabase.from("feed_cache").insert({
          user_id: userId,
          payload: next as unknown as Json,
          fetched_at: fetchedAt,
        });
        if (cacheWriteError) throw new Error("CACHE_WRITE_FAILED");
      }
    } catch (err) {
      console.warn("[trovabandi-feed] feed failed, falling back to cache:", err);
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: cached, error: cacheFallbackError } = await supabase
        .from("feed_cache")
        .select("payload, fetched_at")
        .eq("user_id", userId)
        .gte("fetched_at", cutoff)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cacheFallbackError) throw new Error("CACHE_FALLBACK_READ_FAILED");

      if (cached?.payload) {
        const cachedBandi = (cached.payload as { bandi?: Bando[] }).bandi ?? [];
        return {
          bandi: cachedBandi,
          fetched_at: cached.fetched_at,
          source: "cache",
          deep_search: deepSearch,
          generated_at:
            typeof (cached.payload as { generated_at?: unknown }).generated_at === "string"
              ? (cached.payload as { generated_at: string }).generated_at
              : cached.fetched_at,
        };
      }
      throw new Error("Motore bandi non raggiungibile e nessuna cache disponibile.");
    }

    // Persist i bandi "sommersi" in tabella dedicata (resilienza).
    const hidden = (bandi ?? []).filter((b) => b.is_hidden);
    if (persistHiddenCache && hidden.length > 0) {
      const rows = hidden.map((b) => ({
        user_id: userId,
        bando_id: b.id,
        payload: b as unknown as Json,
        fonte_extratestuale: b.fonte_extratestuale ?? null,
        competition_index: b.competition_index ?? null,
        comune: b.comune ?? null,
        provincia: b.provincia ?? null,
        codice_istat: b.codice_istat ?? null,
      }));
      const { error: hiddenCacheError } = await supabase
        .from("cached_hidden_bandi")
        .upsert(rows, { onConflict: "user_id,bando_id" });
      if (hiddenCacheError) throw new Error("HIDDEN_CACHE_WRITE_FAILED");
    }

    return {
      bandi: bandi ?? [],
      fetched_at: fetchedAt,
      generated_at: generatedAt,
      source,
      deep_search: deepSearch,
    };
  });

export const requestFeedRefresh = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ queued: true }> => {
    // Accoda una singola richiesta di refresh, senza leggere il feed.
    const { data, error } = await context.supabase.functions.invoke("trovabandi-feed", {
      body: { action: "request_refresh" },
    });
    if (error) throw new Error("REFRESH_QUEUE_FAILED");
    const refresh = data as { ok?: unknown; queued?: unknown } | null;
    if (!refresh || refresh.ok !== true || refresh.queued !== true)
      throw new Error("REFRESH_QUEUE_FAILED");
    return { queued: true };
  });

export const loadCachedFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeedResponse | null> => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error: feedCacheError } = await context.supabase
      .from("feed_cache")
      .select("payload, fetched_at")
      .eq("user_id", context.userId)
      .gte("fetched_at", cutoff)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (feedCacheError) throw new Error("CACHE_READ_FAILED");

    const { data: hiddenRows, error: hiddenCacheError } = await context.supabase
      .from("cached_hidden_bandi")
      .select("payload")
      .eq("user_id", context.userId)
      .gte("discovered_at", cutoff)
      .order("discovered_at", { ascending: false });
    if (hiddenCacheError) throw new Error("HIDDEN_CACHE_READ_FAILED");

    const feedBandi = data ? ((data.payload as { bandi?: Bando[] }).bandi ?? []) : [];
    const hiddenBandi = (hiddenRows ?? []).map((r) => r.payload as unknown as Bando);

    // Dedup: il feed vince (più fresco), la cache sommersa riempie i buchi.
    const seen = new Set(feedBandi.map((b) => b.id));
    const merged = [...feedBandi];
    for (const b of hiddenBandi) if (!seen.has(b.id)) merged.push(b);

    if (merged.length === 0) return null;
    return {
      bandi: merged,
      fetched_at: data?.fetched_at ?? new Date(0).toISOString(),
      source: "cache",
      generated_at:
        typeof (data?.payload as { generated_at?: unknown } | null)?.generated_at === "string"
          ? (data?.payload as { generated_at: string }).generated_at
          : data?.fetched_at ?? new Date(0).toISOString(),
    };
  });
