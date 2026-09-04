export type ContractRow = Record<string, unknown>;

export const MATCHING_PROFILE_FIELDS = [
  "forma_giuridica",
  "codice_ateco",
  "ateco_secondari",
  "regione",
  "provincia",
  "comune",
  "codice_istat",
  "numero_dipendenti",
  "fatturato_annuo",
  "anno_costituzione",
  "imprenditoria_femminile",
  "impresa_giovanile",
  "startup_innovativa",
  "pmi_innovativa",
  "dimensione_impresa",
  "investimenti_previsti",
  "spesa_prevista",
  "de_minimis_ultimi_3_anni",
  "impresa_in_difficolta",
  "paese_sede",
  "disponibile_consorzio_europeo",
] as const;

export const BANDO_CATEGORIES = [
  "FONDO_PERDUTO",
  "FINANZIAMENTO_AGEVOLATO",
  "TASSO_ZERO",
  "CREDITO_IMPOSTA",
  "IMPRENDITORIA_FEMMINILE",
  "IMPRENDITORIA_GIOVANILE",
  "DIGITALIZZAZIONE",
  "TRANSIZIONE_ENERGETICA",
  "RICERCA_SVILUPPO",
  "INTERNAZIONALIZZAZIONE",
  "STARTUP_INNOVAZIONE",
  "FORMAZIONE_OCCUPAZIONE",
  "AGRICOLTURA_RURALE",
  "TURISMO_CULTURA",
  "ECONOMIA_CIRCOLARE",
  "GARANZIA",
  "VOUCHER",
  "ALTRO",
] as const;

const AUTHORITY_LEVELS = ["EU", "EUROPEO", "NAZIONALE", "REGIONALE", "CAMERALE", "COMUNALE"] as const;
const VERIFICATION_STATUSES = ["VERIFICATO", "PARZIALE", "DA_VERIFICARE", "SPORTELLO"] as const;
const MATCH_STATUSES = ["COMPATIBILE", "DA_VERIFICARE", "NON_COMPATIBILE"] as const;

const OPTIONAL_TEXT = [
  "region",
  "province",
  "municipality",
  "protocol_email",
  "source_kind",
  "programme_name",
  "programme_code",
  "pnrr_mission",
  "pnrr_component",
  "implementing_body",
  "municipality_istat_code",
] as const;
const OPTIONAL_URL = ["forms_url", "application_url"] as const;
const OPTIONAL_DATE = ["deadline_at", "opens_at", "last_verified_at", "first_seen_at"] as const;
const OPTIONAL_NUMBER = ["max_grant_amount", "rarity_score", "min_partners", "aid_intensity_percent", "total_budget", "competition_index"] as const;
const OPTIONAL_BOOLEAN = [
  "click_day",
  "official_source",
  "consortium_required",
  "sportello",
] as const;
const OPTIONAL_STRING_ARRAY = ["requirements", "eligible_expenses", "eligible_countries", "eligible_ateco_codes", "eligible_ateco_prefixes"] as const;

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown): value is string | null | undefined {
  return value == null || typeof value === "string";
}

/** Postgres numeric arriva spesso come stringa JSON ("150000.00"). */
export function coerceFiniteNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "boolean") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function optionalFiniteNumber(value: unknown): boolean {
  return value == null || coerceFiniteNumber(value) !== undefined;
}

function optionalBoolean(value: unknown): value is boolean | null | undefined {
  return value == null || typeof value === "boolean";
}

function optionalStringArray(value: unknown): value is string[] | null | undefined {
  return value == null || (Array.isArray(value) && value.every(nonEmptyString));
}

export function isHttpUrl(value: unknown): value is string {
  if (!nonEmptyString(value)) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && !!parsed.hostname;
  } catch {
    return false;
  }
}

function optionalHttpUrl(value: unknown): value is string | null | undefined {
  if (value == null) return true;
  if (typeof value !== "string") return false;
  return value.trim() === "" || isHttpUrl(value.trim());
}

/** URL opzionale valido; stringa vuota o non-HTTP → assente, non errore di riga. */
export function coerceOptionalHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || !isHttpUrl(trimmed)) return undefined;
  return trimmed;
}

function optionalIsoDate(value: unknown): value is string | null | undefined {
  return value == null || (nonEmptyString(value) && Number.isFinite(Date.parse(value)));
}

function validMatch(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const match = value as ContractRow;
  return (
    typeof match.status === "string" &&
    MATCH_STATUSES.includes(match.status as (typeof MATCH_STATUSES)[number]) &&
    typeof match.score === "number" &&
    Number.isFinite(match.score) &&
    match.score >= 0 &&
    match.score <= 100 &&
    optionalStringArray(match.confirmed) &&
    optionalStringArray(match.missing) &&
    optionalStringArray(match.blockers)
  );
}

function validPdfFieldMapping(value: unknown): boolean {
  if (value == null) return true;
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const row = entry as ContractRow;
    return (
      nonEmptyString(row.pdf_label) &&
      nonEmptyString(row.profile_field) &&
      optionalString(row.static_value)
    );
  });
}

function validEvidence(value: unknown): boolean {
  if (value == null) return true;
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const row = entry as ContractRow;
    return (
      isHttpUrl(row.source_url) &&
      nonEmptyString(row.evidence_type) &&
      optionalString(row.source_title) &&
      optionalString(row.excerpt) &&
      optionalIsoDate(row.fetched_at)
    );
  });
}

export function matchingProfile(profile: ContractRow): ContractRow {
  const minimized: ContractRow = {};
  for (const field of MATCHING_PROFILE_FIELDS) {
    if (profile[field] !== undefined && profile[field] !== null) minimized[field] = profile[field];
  }
  return minimized;
}

export function opportunityIsValid(item: unknown): item is ContractRow {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const row = item as ContractRow;
  if (
    !nonEmptyString(row.id) ||
    !nonEmptyString(row.title) ||
    !nonEmptyString(row.authority_name) ||
    typeof row.authority_level !== "string" ||
    !AUTHORITY_LEVELS.includes(row.authority_level as (typeof AUTHORITY_LEVELS)[number]) ||
    typeof row.category !== "string" ||
    !BANDO_CATEGORIES.includes(row.category as (typeof BANDO_CATEGORIES)[number]) ||
    !nonEmptyString(row.summary) ||
    !isHttpUrl(row.official_url)
  ) return false;

  if (!OPTIONAL_TEXT.every((key) => optionalString(row[key]))) return false;
  if (!OPTIONAL_URL.every((key) => optionalHttpUrl(row[key]))) return false;
  if (!OPTIONAL_DATE.every((key) => optionalIsoDate(row[key]))) return false;
  if (!OPTIONAL_NUMBER.every((key) => optionalFiniteNumber(row[key]))) return false;
  if (!OPTIONAL_BOOLEAN.every((key) => optionalBoolean(row[key]))) return false;
  if (!OPTIONAL_STRING_ARRAY.every((key) => optionalStringArray(row[key]))) return false;
  if (
    row.verification_status != null &&
    (typeof row.verification_status !== "string" ||
      !VERIFICATION_STATUSES.includes(
        row.verification_status as (typeof VERIFICATION_STATUSES)[number],
      ))
  ) return false;
  return (
    validMatch(row.match) &&
    validEvidence(row.trovabandi_evidence) &&
    validPdfFieldMapping(row.pdf_field_mapping)
  );
}

const OUTPUT_FIELDS = [
  "id", "title", "authority_name", "authority_level", "category", "summary", "official_url",
  ...OPTIONAL_TEXT, ...OPTIONAL_URL, ...OPTIONAL_DATE, ...OPTIONAL_NUMBER, ...OPTIONAL_BOOLEAN,
  ...OPTIONAL_STRING_ARRAY, "verification_status", "trovabandi_evidence", "pdf_field_mapping", "match",
] as const;

function sanitizeOpportunity(row: ContractRow): ContractRow {
  const clean: ContractRow = {};
  const optionalUrls = OPTIONAL_URL as readonly string[];
  for (const field of OUTPUT_FIELDS) {
    const value = row[field];
    if (value === undefined || value === null) continue;
    if (optionalUrls.includes(field)) {
      const url = coerceOptionalHttpUrl(value);
      if (url) clean[field] = url;
      continue;
    }
    if (typeof value === "string" && value.trim() === "") continue;
    if ((OPTIONAL_NUMBER as readonly string[]).includes(field)) {
      const parsed = coerceFiniteNumber(value);
      if (parsed !== undefined) clean[field] = parsed;
      continue;
    }
    clean[field] = value;
  }
  return clean;
}

export type SanitizedFeed =
  | { ok: true; bandi: ContractRow[]; generated_at: string | null }
  | { ok: false; code: string };

export type SanitizeOptions = {
  /** Catalogo: tiene le righe valide e scarta quelle sporche invece di fallire tutto. */
  dropInvalidRows?: boolean;
};

export function sanitizeFeedResponse(
  payload: unknown,
  status: number,
  options: SanitizeOptions = {},
): SanitizedFeed {
  if (status !== 200) return { ok: false, code: "UPSTREAM_STATUS" };
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return { ok: false, code: "UPSTREAM_SHAPE" };
  const body = payload as ContractRow;
  if (body.ok !== true) return { ok: false, code: "UPSTREAM_NOT_OK" };
  if (!Array.isArray(body.bandi)) return { ok: false, code: "UPSTREAM_NO_BANDI" };
  const rows = body.bandi as unknown[];
  let valid: ContractRow[];
  if (options.dropInvalidRows) {
    valid = rows.filter(opportunityIsValid);
    // Tutte le righe invalide: envelope vuoto valido (il proxy può riusare la
    // cache precedente con fetched_at fresco), non 502 totale.
  } else {
    if (!rows.every(opportunityIsValid)) return { ok: false, code: "UPSTREAM_INVALID_ROW" };
    valid = rows as ContractRow[];
  }
  const generatedAt =
    optionalIsoDate(body.generated_at) && typeof body.generated_at === "string"
      ? body.generated_at
      : null;
  return {
    ok: true,
    bandi: valid.map(sanitizeOpportunity),
    generated_at: generatedAt,
  };
}

