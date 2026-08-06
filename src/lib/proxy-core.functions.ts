import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { FeedResponse, Bando } from "./bandocore-types";
import { mapCoreOpportunity, parseGatewayFeed } from "./proxy-core.server";
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
  .validator((input: unknown) => InputSchema.parse(input ?? {}))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<FeedResponse> => {
    const { supabase, userId } = context;
    const deepSearch = data.deep_search ?? true;

    let bandi: Bando[] | null = null;
    const source: FeedResponse["source"] = "central-core";

    try {
      if (data.force_refresh) {
        await supabase.functions
          .invoke("trovabandi-feed", { body: { action: "request_refresh" } })
          .catch(() => undefined);
      }

      const { data: payload, error } = await supabase.functions.invoke("trovabandi-feed", {
        body: { action: "feed" },
      });
      if (error) throw new Error("GATEWAY_ERROR");

      const rows = parseGatewayFeed(payload);
      if (!rows) throw new Error("GATEWAY_INVALID_PAYLOAD");
      bandi = rows.map((item) => mapCoreOpportunity(item));
    } catch (err) {
      console.warn("[trovabandi-feed] feed failed, falling back to cache:", err);
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
          deep_search: deepSearch,
        };
      }
      throw new Error("Motore bandi non raggiungibile e nessuna cache disponibile.");
    }

    const fetched_at = new Date().toISOString();
    await supabase.from("feed_cache").insert({
      user_id: userId,
      payload: { bandi } as unknown as Json,
      fetched_at,
    });

    // Persist i bandi "sommersi" in tabella dedicata (resilienza).
    const hidden = (bandi ?? []).filter((b) => b.is_hidden);
    if (hidden.length > 0) {
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
      await supabase.from("cached_hidden_bandi").upsert(rows, { onConflict: "user_id,bando_id" });
    }

    return { bandi: bandi ?? [], fetched_at, source, deep_search: deepSearch };
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

    const { data: hiddenRows } = await context.supabase
      .from("cached_hidden_bandi")
      .select("payload")
      .eq("user_id", context.userId)
      .order("discovered_at", { ascending: false });

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
    };
  });
