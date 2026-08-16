import type { Bando, BandoScope } from "./bandocore-types";

/**
 * Registro delle fonti core v1 (ordine di priorità).
 * Un bando entra nel feed solo se la sua URL ufficiale appartiene a una di
 * queste fonti: meglio pochi bandi solidi che molti incompleti.
 */
export interface CoreSource {
  id:
    | "veneto"
    | "invitalia"
    | "mimit"
    | "eu"
    | "padova"
    | "cciaa"
    | "gal"
    | "unioncamere"
    | "provincia";
  label: string;
  homepage: string;
  hosts: string[];
  level: BandoScope;
}

export const CORE_SOURCES: CoreSource[] = [
  {
    id: "veneto",
    label: "Regione Veneto — Bandi",
    homepage: "https://bandi.regione.veneto.it",
    hosts: ["bandi.regione.veneto.it", "regione.veneto.it"],
    level: "REGIONALE",
  },
  {
    id: "invitalia",
    label: "Invitalia — Incentivi PMI e imprese",
    homepage: "https://www.invitalia.it",
    hosts: ["invitalia.it"],
    level: "NAZIONALE",
  },
  {
    id: "mimit",
    label: "MIMIT — incentivi.gov.it",
    homepage: "https://www.incentivi.gov.it",
    hosts: ["incentivi.gov.it", "mimit.gov.it"],
    level: "NAZIONALE",
  },
  {
    id: "eu",
    label: "EU Funding & Tenders Portal",
    homepage: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/home",
    hosts: ["ec.europa.eu", "europa.eu", "eismea.ec.europa.eu", "eurekanetwork.org"],
    level: "EUROPEO",
  },
  {
    id: "padova",
    label: "Comune di Padova — Padovanet",
    homepage: "https://www.padovanet.it",
    hosts: ["padovanet.it"],
    level: "COMUNALE",
  },
  {
    id: "cciaa",
    label: "Camera di Commercio di Padova",
    homepage: "https://www.pd.camcom.it",
    hosts: ["pd.camcom.it", "camcom.it"],
    level: "CAMERALE",
  },
  {
    id: "gal",
    label: "GAL Patavino",
    homepage: "https://www.galpatavino.it",
    hosts: ["galpatavino.it"],
    level: "COMUNALE",
  },
  {
    id: "unioncamere",
    label: "Unioncamere",
    homepage: "https://www.unioncamere.gov.it",
    hosts: ["unioncamere.gov.it"],
    level: "CAMERALE",
  },
  {
    id: "provincia",
    label: "Provincia di Padova",
    homepage: "https://www.provincia.pd.it",
    hosts: ["provincia.pd.it", "provincia.padova.it"],
    level: "REGIONALE",
  },
];

export const ADMITTED_LEVELS: BandoScope[] = [
  "COMUNALE",
  "CAMERALE",
  "REGIONALE",
  "NAZIONALE",
  "EUROPEO",
];

export type RejectReason =
  | "NO_TITLE"
  | "NO_AUTHORITY"
  | "NO_OFFICIAL_URL"
  | "SOURCE_NOT_CORE"
  | "LEVEL_NOT_ADMITTED"
  | "DEADLINE_PAST";

/** Buchi informativi tollerati: la scheda entra nel feed, ma dichiara cosa manca. */
export interface AdmissionGaps {
  missing_deadline: boolean;
  missing_economics: boolean;
}

export const MISSING_DEADLINE_LABEL = "Manca la scadenza nel testo ufficiale";
export const MISSING_ECONOMICS_LABEL = "Manca l'importo nel testo ufficiale";

function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Restituisce la fonte core proprietaria dell'URL ufficiale, o null. */
export function sourceForUrl(url: string | undefined | null): CoreSource | null {
  if (typeof url !== "string" || url.length === 0) return null;
  const host = hostOf(url);
  if (!host) return null;
  return (
    CORE_SOURCES.find((source) =>
      source.hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`)),
    ) ?? null
  );
}

function hasEconomicData(bando: Bando): boolean {
  const amount = bando.importo_max;
  const intensity = bando.aid_intensity_percent;
  const expenses = bando.eligible_expenses;
  if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) return true;
  if (typeof intensity === "number" && Number.isFinite(intensity) && intensity > 0) return true;
  return Array.isArray(expenses) && expenses.length > 0;
}

function parseDate(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type Admission =
  | { ok: true; source: CoreSource; gaps: AdmissionGaps }
  | { ok: false; reason: RejectReason };

/**
 * Ammissione: nessun dato viene dedotto o inventato.
 * Obbligatori titolo, ente, URL ufficiale su fonte core, livello ammesso e
 * scadenza non passata. Scadenza/apertura o dato economico assenti non
 * scartano la scheda: vengono segnalati come buchi dichiarati.
 */
export function admitBando(bando: Bando, now: number = Date.now()): Admission {
  if (!bando.titolo?.trim()) return { ok: false, reason: "NO_TITLE" };
  if (!bando.ente?.trim()) return { ok: false, reason: "NO_AUTHORITY" };

  const officialUrl = bando.official_url ?? bando.notice_url;
  if (!officialUrl) return { ok: false, reason: "NO_OFFICIAL_URL" };
  const source = sourceForUrl(officialUrl);
  if (!source) return { ok: false, reason: "SOURCE_NOT_CORE" };

  if (!ADMITTED_LEVELS.includes(bando.scope)) return { ok: false, reason: "LEVEL_NOT_ADMITTED" };

  const deadline = parseDate(bando.scadenza);
  const opening = parseDate(bando.apertura);
  if (deadline !== null && deadline < now) return { ok: false, reason: "DEADLINE_PAST" };

  return {
    ok: true,
    source,
    gaps: {
      missing_deadline: deadline === null && opening === null,
      missing_economics: !hasEconomicData(bando),
    },
  };
}

export interface AdmissionReport {
  admitted: Bando[];
  admitted_count: number;
  rejected_count: number;
  rejected_by_reason: Partial<Record<RejectReason, number>>;
  active_sources: Array<{ id: CoreSource["id"]; label: string; count: number }>;
}

/** Applica l'ammissione all'intero feed e produce il rendiconto validi/scartati. */
export function admitFeed(bandi: Bando[], now: number = Date.now()): AdmissionReport {
  const admitted: Bando[] = [];
  const rejected_by_reason: Partial<Record<RejectReason, number>> = {};
  const counts = new Map<CoreSource["id"], number>();

  for (const bando of bandi) {
    const verdict = admitBando(bando, now);
    if (verdict.ok) {
      admitted.push(bando);
      counts.set(verdict.source.id, (counts.get(verdict.source.id) ?? 0) + 1);
    } else {
      rejected_by_reason[verdict.reason] = (rejected_by_reason[verdict.reason] ?? 0) + 1;
    }
  }

  return {
    admitted,
    admitted_count: admitted.length,
    rejected_count: bandi.length - admitted.length,
    rejected_by_reason,
    active_sources: CORE_SOURCES.filter((source) => (counts.get(source.id) ?? 0) > 0).map(
      (source) => ({ id: source.id, label: source.label, count: counts.get(source.id) ?? 0 }),
    ),
  };
}
