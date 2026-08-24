import type { Bando } from "./bandocore-types";
import {
  coerceOptionalHttpUrl,
  sanitizeFeedResponse,
  type ContractRow,
} from "../../supabase/functions/_shared/trovabandi-contract.ts";

export type CoreOpportunity = ContractRow & {
  id: string;
  title: string;
  authority_name: string;
  authority_level: string;
  category: string;
  summary: string;
  official_url: string;
};

export type GatewayEnvelope = {
  bandi: CoreOpportunity[];
  fetched_at: string;
  generated_at: string;
  view?: "catalog" | "profile";
};

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

/** Usa lo stesso contratto puro importato dalla Edge Function: nessuna copia divergente. */
export function parseGatewayEnvelope(payload: unknown): GatewayEnvelope | null {
  const sanitized = sanitizeFeedResponse(payload, 200);
  if (!sanitized.ok) return null;
  const body = payload as Record<string, unknown>;
  const now = new Date().toISOString();
  const fetchedAt = validDate(body.fetched_at) ? body.fetched_at : now;
  const generatedAt = sanitized.generated_at ?? fetchedAt;
  const view = body.view === "catalog" || body.view === "profile" ? body.view : undefined;
  return {
    bandi: sanitized.bandi as CoreOpportunity[],
    fetched_at: fetchedAt,
    generated_at: generatedAt,
    view,
  };
}

export function feedViewOf(feed: { view?: unknown } | null | undefined): "catalog" | "profile" {
  return feed?.view === "catalog" ? "catalog" : "profile";
}

export function gatewayRowIsValid(item: unknown): item is CoreOpportunity {
  const result = sanitizeFeedResponse({ ok: true, bandi: [item] }, 200);
  return result.ok;
}

export function parseGatewayFeed(payload: unknown): CoreOpportunity[] | null {
  return parseGatewayEnvelope(payload)?.bandi ?? null;
}

export function mapCoreOpportunity(item: CoreOpportunity): Bando {
  const scopeMap: Record<string, Bando["scope"]> = {
    EU: "EUROPEO",
    EUROPEO: "EUROPEO",
    NAZIONALE: "NAZIONALE",
    REGIONALE: "REGIONALE",
    CAMERALE: "CAMERALE",
    COMUNALE: "COMUNALE",
  };
  const deadline = (item.deadline_at as string | null | undefined) ?? undefined;
  const daysLeft = deadline
    ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000)
    : null;
  const officialUrl = item.official_url as string;
  const applicationUrl = coerceOptionalHttpUrl(item.application_url);
  const formsUrl = coerceOptionalHttpUrl(item.forms_url);
  const protocolEmail = (item.protocol_email as string | null | undefined) ?? undefined;
  const rarity = (item.rarity_score as number | null | undefined) ?? undefined;
  const sourceKind = (item.source_kind as string | null | undefined) ?? undefined;

  return {
    id: item.id,
    titolo: item.title,
    ente: item.authority_name,
    descrizione: item.summary,
    categoria: item.category as Bando["categoria"],
    scope: scopeMap[item.authority_level],
    regione: (item.region as string | null | undefined) ?? undefined,
    provincia: (item.province as string | null | undefined) ?? undefined,
    comune: (item.municipality as string | null | undefined) ?? undefined,
    codice_istat: (item.municipality_istat_code as string | null | undefined) ?? undefined,
    importo_max: (item.max_grant_amount as number | null | undefined) ?? undefined,
    scadenza: deadline,
    apertura: (item.opens_at as string | null | undefined) ?? undefined,
    click_day: item.click_day === true,
    flash: item.click_day === true || (daysLeft != null && daysLeft >= 0 && daysLeft <= 10),
    pec: protocolEmail,
    ufficio_protocollo_pec: protocolEmail,
    piattaforma_url: applicationUrl,
    modulistica_url: formsUrl,
    notice_url: officialUrl,
    application_url: applicationUrl,
    official_url: officialUrl,
    requisiti: (item.requirements as string[] | null | undefined) ?? [],
    ateco_compatibili: (item.eligible_ateco_codes as string[] | null | undefined) ?? [],
    pdf_field_mapping:
      (item.pdf_field_mapping as Bando["pdf_field_mapping"] | undefined) ?? undefined,
    aid_intensity_percent:
      (item.aid_intensity_percent as number | null | undefined) ?? undefined,
    total_budget: (item.total_budget as number | null | undefined) ?? undefined,
    competition_index:
      (item.competition_index as number | null | undefined) ?? undefined,
    eligible_expenses: (item.eligible_expenses as string[] | null | undefined) ?? [],
    verification_status: item.verification_status as Bando["verification_status"],
    sportello: item.sportello === true || item.verification_status === "SPORTELLO",
    official_source: item.official_source as boolean | undefined,
    last_verified_at: (item.last_verified_at as string | null | undefined) ?? undefined,
    first_seen_at: (item.first_seen_at as string | null | undefined) ?? undefined,
    rarity_score: rarity,
    source_kind: sourceKind,
    programme_name: (item.programme_name as string | null | undefined) ?? undefined,
    programme_code: (item.programme_code as string | null | undefined) ?? undefined,
    pnrr_mission: (item.pnrr_mission as string | null | undefined) ?? undefined,
    pnrr_component: (item.pnrr_component as string | null | undefined) ?? undefined,
    implementing_body: (item.implementing_body as string | null | undefined) ?? undefined,
    eligible_countries: (item.eligible_countries as string[] | null | undefined) ?? [],
    consortium_required: (item.consortium_required as boolean | null | undefined) ?? undefined,
    min_partners: (item.min_partners as number | null | undefined) ?? undefined,
    evidence: (item.trovabandi_evidence as Bando["evidence"] | undefined) ?? [],
    match: item.match as Bando["match"],
    is_hidden:
      (rarity ?? 0) >= 4 ||
      ["BUR", "ALBO_PRETORIO", "CAMERALE", "GAL", "DECRETO", "EU_PORTAL"].includes(
        sourceKind ?? "",
      ),
    fonte_extratestuale:
      (rarity ?? 0) >= 4
        ? `${sourceKind ?? "Fonte ufficiale"} · reperibilità ${rarity ?? 1}/5`
        : undefined,
  };
}
