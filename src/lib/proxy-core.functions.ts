import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { FeedResponse, Bando } from "./bandocore-types";
import type { Json } from "@/integrations/supabase/types";

const InputSchema = z.object({
  force_refresh: z.boolean().optional(),
  deep_search: z.boolean().optional(),
});

type CoreOpportunity = Record<string, unknown> & {
  id: string;
  title: string;
  authority_name: string;
  authority_level: string;
  category: string;
  summary: string;
  official_url: string;
  deadline_at?: string | null;
  opens_at?: string | null;
  max_grant_amount?: number | null;
  region?: string | null;
  province?: string | null;
  municipality?: string | null;
  protocol_email?: string | null;
  forms_url?: string | null;
  application_url?: string | null;
  click_day?: boolean;
  requirements?: string[];
  eligible_expenses?: string[];
  verification_status?: Bando["verification_status"];
  official_source?: boolean;
  last_verified_at?: string | null;
  first_seen_at?: string | null;
  rarity_score?: number | null;
  source_kind?: string | null;
  programme_name?: string | null;
  programme_code?: string | null;
  pnrr_mission?: string | null;
  pnrr_component?: string | null;
  implementing_body?: string | null;
  eligible_countries?: string[];
  consortium_required?: boolean | null;
  min_partners?: number | null;
  trovabandi_evidence?: Bando["evidence"];
  match?: Bando["match"];
};

function coreEndpoint(): { url: string; secret: string } {
  const base = process.env.CENTRAL_CORE_API_URL?.trim().replace(/\/$/, "") ?? "";
  const secret = process.env.CENTRAL_CORE_API_KEY?.trim() ?? "";
  if (!base || !secret) throw new Error("COLLEGAMENTO_CENTRAL_CORE_NON_CONFIGURATO");
  const url = base.endsWith("/functions/v1/trovabandi-engine")
    ? base
    : `${base}/functions/v1/trovabandi-engine`;
  return { url, secret };
}

function mapCoreOpportunity(item: CoreOpportunity): Bando {
  const scopeMap: Record<string, Bando["scope"]> = {
    EU: "EUROPEO",
    NAZIONALE: "NAZIONALE",
    REGIONALE: "REGIONALE",
    CAMERALE: "CAMERALE",
    COMUNALE: "COMUNALE",
  };
  const category = item.category as Bando["categoria"];
  const deadline = item.deadline_at ?? undefined;
  const daysLeft = deadline
    ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000)
    : null;
  return {
    id: item.id,
    titolo: item.title,
    ente: item.authority_name,
    descrizione: item.summary,
    categoria: category,
    scope: scopeMap[item.authority_level] ?? "NAZIONALE",
    regione: item.region ?? undefined,
    provincia: item.province ?? undefined,
    comune: item.municipality ?? undefined,
    importo_max: item.max_grant_amount ?? undefined,
    scadenza: deadline,
    apertura: item.opens_at ?? undefined,
    click_day: item.click_day === true,
    flash: item.click_day === true || (daysLeft != null && daysLeft >= 0 && daysLeft <= 10),
    pec: item.protocol_email ?? undefined,
    ufficio_protocollo_pec: item.protocol_email ?? undefined,
    piattaforma_url: item.application_url ?? item.official_url,
    modulistica_url: item.forms_url ?? undefined,
    requisiti: item.requirements ?? [],
    eligible_expenses: item.eligible_expenses ?? [],
    verification_status: item.verification_status,
    official_source: item.official_source,
    last_verified_at: item.last_verified_at ?? undefined,
    first_seen_at: item.first_seen_at ?? undefined,
    rarity_score: item.rarity_score ?? undefined,
    source_kind: item.source_kind ?? undefined,
    programme_name: item.programme_name ?? undefined,
    programme_code: item.programme_code ?? undefined,
    pnrr_mission: item.pnrr_mission ?? undefined,
    pnrr_component: item.pnrr_component ?? undefined,
    implementing_body: item.implementing_body ?? undefined,
    eligible_countries: item.eligible_countries ?? [],
    consortium_required: item.consortium_required ?? undefined,
    min_partners: item.min_partners ?? undefined,
    evidence: item.trovabandi_evidence ?? [],
    match: item.match,
    is_hidden:
      (item.rarity_score ?? 0) >= 4 ||
      ["BUR", "ALBO_PRETORIO", "CAMERALE", "GAL", "DECRETO", "EU_PORTAL"].includes(
        item.source_kind ?? "",
      ),
    fonte_extratestuale:
      (item.rarity_score ?? 0) >= 4
        ? `${item.source_kind ?? "Fonte ufficiale"} · reperibilità ${item.rarity_score ?? 1}/5`
        : undefined,
  };
}

async function callCore(action: string, payload: Record<string, unknown>) {
  const { url, secret } = coreEndpoint();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${secret}`,
      "x-internal-secret": secret,
      "x-source-app": "trovabandi",
    },
    body: JSON.stringify({ action, ...payload }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`CENTRAL_CORE_HTTP_${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

// fetchFeedFromProxyCore
// - Carica il profilo aziendale dell'utente autenticato.
// - Legge il catalogo verificato del motore TrovaBandi in Central Core.
// - Il refresh costoso viene accodato e svolto dai cron notturni su Replit.
// - Persiste il feed completo in feed_cache (offline).
// - Salva i bandi "sommersi" (is_hidden === true) in cached_hidden_bandi,
//   così l'utente non li perde se la PA rimuove la fonte originaria.
export const fetchFeedFromProxyCore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => InputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<FeedResponse> => {
    const { supabase, userId } = context;
    const deepSearch = data.deep_search ?? true;

    const { data: profile, error: profileError } = await supabase
      .from("company_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) throw new Error("Impossibile leggere il profilo aziendale");
    if (!profile) throw new Error("PROFILE_MISSING");

    let bandi: Bando[] | null = null;
    const source: FeedResponse["source"] = "central-core";

    try {
      if (data.force_refresh) {
        await callCore("request_refresh", { profile }).catch(() => undefined);
      }
      const payload = await callCore("feed", { profile, limit: 250 });
      const rows = Array.isArray(payload.bandi) ? payload.bandi : [];
      bandi = rows.map((item) => mapCoreOpportunity(item as CoreOpportunity));
    } catch (err) {
      console.warn("[central-core] feed failed, falling back to cache:", err);
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
