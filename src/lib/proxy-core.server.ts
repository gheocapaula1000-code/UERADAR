import type { Bando } from "./bandocore-types";

export type CoreOpportunity = Record<string, unknown> & {
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

