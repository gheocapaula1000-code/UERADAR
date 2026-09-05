import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { FeedResponse, FeedView, Bando } from "./bandocore-types";
import { feedViewOf, mapCoreOpportunity, parseGatewayEnvelope } from "./proxy-core.server";
import { decideFeedCache } from "./feed-cache-policy";
import type { Json } from "@/integrations/supabase/types";

const InputSchema = z.object({
  force_refresh: z.boolean().optional(),
  /** Accetta l'envelope live (anche vuoto) e sostituisce un feed_cache stale. Non accoda. */
  skip_reuse: z.boolean().optional(),
  deep_search: z.boolean().optional(),
  mode: z.enum(["catalog", "profile"]).optional(),
});

function asCachedFeed(row: { payload: unknown; fetched_at: string } | null): FeedResponse | null {
  if (!row?.payload || typeof row.payload !== "object") return null;
  const payload = row.payload as FeedResponse;
  if (!Array.isArray(payload.bandi)) return null;
  return {
    ...payload,
    fetched_at: row.fetched_at,
    source: "cache",
    view: feedViewOf(payload),
    generated_at: typeof payload.generated_at === "string" ? payload.generated_at : row.fetched_at,
  };
}

function pickCachedView(
  rows: Array<{ payload: unknown; fetched_at: string }> | null,
  view: FeedView,
): FeedResponse | null {
  for (const row of rows ?? []) {
    const cached = asCachedFeed(row);
    if (cached && feedViewOf(cached) === view) return cached;
  }
  return null;
}

// fetchFeedFromProxyCore
// - Nessun secret del Central Core viene letto qui: la server function invoca
//   la Edge Function `trovabandi-feed` con il client user-scoped, che inoltra
//   il JWT dell'utente. Solo la Edge Function conosce URL e chiave del Core.
// - Persiste il feed completo in feed_cache (offline) e le opportunità locali
//   in cached_hidden_bandi con il client di servizio: quelle tabelle non sono
//   raggiungibili dal browser via Data API.
// - Cadenza e entitlement sono applicati anche dentro la Edge Function, che
//   è invocabile direttamente con un JWT valido.
export const fetchFeedFromProxyCore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => InputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<FeedResponse> => {
    const { supabase, userId } = context;
    const { resolveTenantContext } = await import("./tenant.server");
    // Tutte le letture/scritture di cache sono confinate all'impresa risolta.
    const tenant = await resolveTenantContext(supabase, userId);
    const tenantId = tenant.tenant_owner_id;

    // Enforcement server-side: entitlement e profondità del piano. La cadenza è
    // riservata una sola volta, dentro la Edge Function.
    const { entitlementForTenant } = await import("./usage.server");
    const { cacheClient } = await import("./cache.server");
    const cache = cacheClient();
    const nowIso = new Date().toISOString();
    const entitlement = await entitlementForTenant(supabase, tenantId, nowIso);
    if (!entitlement.entitled) throw new Error(`FEED_NOT_ENTITLED:${entitlement.reason}`);
    // Fail-closed sulle fonti: il gateway espone un solo set verificabile e non
    // fornisce una classificazione affidabile per livello, quindi nessun piano
    // riceve o dichiara una copertura diversa finché non sarà verificabile.
    const { AVAILABLE_SOURCE_TIER } = await import("./catalog");
    const deepSearch =
      (data.deep_search ?? false) && entitlement.limits.sourceTier !== AVAILABLE_SOURCE_TIER;
    const view: FeedView = data.mode === "profile" ? "profile" : "catalog";

    let bandi: Bando[] | null = null;
    let fetchedAt = new Date().toISOString();
    let generatedAt = fetchedAt;
    const source: FeedResponse["source"] = "central-core";
    let persistHiddenCache = false;
    let admission: FeedResponse["admission"];

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
        body: view === "catalog" ? { action: "catalog" } : { action: "feed" },
      });
      if (error) throw new Error("GATEWAY_ERROR");

      const envelope = parseGatewayEnvelope(payload);
      if (!envelope) throw new Error("GATEWAY_INVALID_PAYLOAD");
      const mapped = envelope.bandi.map((item) => mapCoreOpportunity(item));
      // Ammissione fail-closed: solo fonti core, scadenza/apertura e dato economico.
      const { admitFeed } = await import("./feed-admission");
      const report = admitFeed(mapped, Date.parse(nowIso));
      bandi = report.admitted;
      if (report.attested_hosts.length > 0) {
        const { coreAttestedSignal, emitOpsSignal } = await import("./ops-signal");
        for (const host of report.attested_hosts) emitOpsSignal(coreAttestedSignal(host));
      }
      admission = {
        admitted_count: report.admitted_count,
        rejected_count: report.rejected_count,
        rejected_by_reason: report.rejected_by_reason as Record<string, number>,
        active_sources: report.active_sources,
        attested_hosts: report.attested_hosts,
      };
      // `fetched_at` indica quando questa app ha completato con successo la
      // lettura del Core. Il timestamp dell'envelope può essere la data di una
      // generazione precedente e resta quindi confinato a `generated_at`.
      fetchedAt = nowIso;
      const rawGeneratedAt =
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>).generated_at
          : undefined;
      generatedAt =
        typeof rawGeneratedAt === "string" && Number.isFinite(Date.parse(rawGeneratedAt))
          ? rawGeneratedAt
          : nowIso;

      const { data: previousRows, error: previousError } = await cache
        .from("feed_cache")
        .select("payload, fetched_at")
        .eq("user_id", tenantId)
        .order("fetched_at", { ascending: false })
        .limit(8);
      if (previousError) throw new Error("CACHE_READ_FAILED");

      const previous = pickCachedView(previousRows, view);
      const next: FeedResponse = {
        bandi,
        fetched_at: fetchedAt,
        generated_at: generatedAt,
        source,
        deep_search: deepSearch,
        admission,
        view,
      };
      const cacheDecision = decideFeedCache(previous, next, Date.parse(nowIso), {
        skipReuse: data.skip_reuse === true,
      });
      // Riuso dei bandi precedenti (envelope vuoto), ma con i timestamp reali
      // dell'ultima lettura del Core: nessun bando inventato e il client può
      // riconoscere che l'aggiornamento è avvenuto davvero. Il Core è stato
      // raggiunto, quindi la risposta è una lettura dal vivo, non una cache.
      if (cacheDecision === "reuse-previous" && previous) {
        const reused: FeedResponse = {
          ...previous,
          fetched_at: nowIso,
          generated_at: generatedAt,
          source: "central-core",
          view,
        };
        const { error: cacheWriteError } = await cache.from("feed_cache").insert({
          user_id: tenantId,
          payload: reused as unknown as Json,
          fetched_at: nowIso,
        });
        if (cacheWriteError) throw new Error("CACHE_WRITE_FAILED");
        return reused;
      }

      if (cacheDecision === "persist") {
        persistHiddenCache = view === "profile";
        const { error: cacheWriteError } = await cache.from("feed_cache").insert({
          user_id: tenantId,
          payload: next as unknown as Json,
          fetched_at: fetchedAt,
        });
        // «Cerca» deve comunque consegnare l'envelope live: un insert fallito
        // non deve far ricadere sul feed_cache del 02/09.
        if (cacheWriteError && data.skip_reuse !== true) throw new Error("CACHE_WRITE_FAILED");
      }
    } catch (err) {
      console.warn("[trovabandi-feed] feed failed, falling back to cache:", err);
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: cachedRows, error: cacheFallbackError } = await cache
        .from("feed_cache")
        .select("payload, fetched_at")
        .eq("user_id", tenantId)
        .gte("fetched_at", cutoff)
        .order("fetched_at", { ascending: false })
        .limit(8);
      if (cacheFallbackError) throw new Error("CACHE_FALLBACK_READ_FAILED");

      const cached = pickCachedView(cachedRows, view);
      if (cached) {
        return {
          ...cached,
          deep_search: deepSearch,
        };
      }
      throw new Error("Motore bandi non raggiungibile e nessuna cache disponibile.");
    }

    // Persist i bandi "sommersi" in tabella dedicata (resilienza).
    const hidden = (bandi ?? []).filter((b) => b.is_hidden);
    if (persistHiddenCache && hidden.length > 0) {
      const rows = hidden.map((b) => ({
        user_id: tenantId,
        bando_id: b.id,
        payload: b as unknown as Json,
        fonte_extratestuale: b.fonte_extratestuale ?? null,
        competition_index: b.competition_index ?? null,
        comune: b.comune ?? null,
        provincia: b.provincia ?? null,
        codice_istat: b.codice_istat ?? null,
      }));
      const { error: hiddenCacheError } = await cache
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
      admission,
      view,
    };
  });

export const requestFeedRefresh = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ queued: true }> => {
    // Stesso gate del feed. La cadenza è riservata dentro la Edge Function,
    // così non esiste un secondo consumo della stessa corsia.
    const { resolveTenantContext } = await import("./tenant.server");
    const { entitlementForTenant } = await import("./usage.server");
    const nowIso = new Date().toISOString();
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const entitlement = await entitlementForTenant(
      context.supabase,
      tenant.tenant_owner_id,
      nowIso,
    );
    if (!entitlement.entitled) throw new Error(`FEED_NOT_ENTITLED:${entitlement.reason}`);
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
    const { resolveTenantContext } = await import("./tenant.server");
    const { entitlementForTenant } = await import("./usage.server");
    const { cacheClient } = await import("./cache.server");
    const cache = cacheClient();
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    // Anche la cache è contenuto premium: prova scaduta o piano non attivo non legge.
    const entitlement = await entitlementForTenant(context.supabase, tenant.tenant_owner_id);
    if (!entitlement.entitled) throw new Error(`FEED_NOT_ENTITLED:${entitlement.reason}`);
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error: feedCacheError } = await cache
      .from("feed_cache")
      .select("payload, fetched_at")
      .eq("user_id", tenant.tenant_owner_id)
      .gte("fetched_at", cutoff)
      .order("fetched_at", { ascending: false })
      .limit(8);
    if (feedCacheError) throw new Error("CACHE_READ_FAILED");

    const catalog = pickCachedView(rows, "catalog");
    const profile = pickCachedView(rows, "profile");
    const primary = catalog ?? profile;
    if (!primary) return null;

    const { data: hiddenRows, error: hiddenCacheError } = await cache
      .from("cached_hidden_bandi")
      .select("payload")
      .eq("user_id", tenant.tenant_owner_id)
      .gte("discovered_at", cutoff)
      .order("discovered_at", { ascending: false });
    if (hiddenCacheError) throw new Error("HIDDEN_CACHE_READ_FAILED");

    const feedBandi = primary.bandi;
    const hiddenBandi =
      feedViewOf(primary) === "profile"
        ? (hiddenRows ?? []).map((r) => r.payload as unknown as Bando)
        : [];

    // Dedup: il feed vince (più fresco), la cache sommersa riempie i buchi.
    const seen = new Set(feedBandi.map((b) => b.id));
    const merged = [...feedBandi];
    for (const b of hiddenBandi) if (!seen.has(b.id)) merged.push(b);

    if (merged.length === 0) return null;
    return {
      ...primary,
      bandi: merged,
      source: "cache",
    };
  });
