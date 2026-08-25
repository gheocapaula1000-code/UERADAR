import type { Bando } from "./bandocore-types";

export type MatchStatus = NonNullable<Bando["match"]>["status"];

export interface MatchStatusMeta {
  status: MatchStatus;
  label: string;
  tone: "positive" | "warning" | "negative";
  /** classi per badge/box */
  boxClass: string;
  badgeClass: string;
  textClass: string;
}

const META: Record<MatchStatus, MatchStatusMeta> = {
  COMPATIBILE: {
    status: "COMPATIBILE",
    label: "Compatibile",
    tone: "positive",
    boxClass: "border-emerald-500/30 bg-emerald-500/5",
    badgeClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    textClass: "text-emerald-400",
  },
  DA_VERIFICARE: {
    status: "DA_VERIFICARE",
    label: "Da verificare",
    tone: "warning",
    boxClass: "border-warning/30 bg-warning/5",
    badgeClass: "border-warning/40 bg-warning/10 text-warning",
    textClass: "text-warning",
  },
  NON_COMPATIBILE: {
    status: "NON_COMPATIBILE",
    label: "Non compatibile",
    tone: "negative",
    boxClass: "border-destructive/30 bg-destructive/5",
    badgeClass: "border-destructive/40 bg-destructive/10 text-destructive",
    textClass: "text-destructive",
  },
};

/** Normalizza qualunque valore proveniente dal Central Core in uno stato noto. */
export function normalizeMatchStatus(value: unknown): MatchStatus {
  const key = typeof value === "string" ? value.trim().toUpperCase() : "";
  return key === "COMPATIBILE" || key === "NON_COMPATIBILE" || key === "DA_VERIFICARE"
    ? (key as MatchStatus)
    : "DA_VERIFICARE";
}

/** Metadati di resa: NON_COMPATIBILE non deve mai apparire come "Da verificare". */
export function matchStatusMeta(value: unknown): MatchStatusMeta {
  return META[normalizeMatchStatus(value)];
}

export type MatchPreview = MatchStatusMeta & {
  score: number | null;
  confirmed: string[];
  missing: string[];
  blockers: string[];
};

const PREVIEW_LIMIT = 2;

function previewLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, PREVIEW_LIMIT);
}

/**
 * Anteprima del match per le card: usa solo stato, punteggio e motivi
 * restituiti dal feed. Nessun punteggio inventato.
 */
export function matchPreview(match: Bando["match"] | null | undefined): MatchPreview | null {
  if (!match) return null;
  const meta = matchStatusMeta(match.status);
  const raw = match.score;
  const score =
    typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : null;
  return {
    ...meta,
    score,
    confirmed: previewLines(match.confirmed),
    missing: previewLines(match.missing),
    blockers: previewLines(match.blockers),
  };
}

export function deadlineTime(bando: Pick<Bando, "scadenza">): number | null {
  if (!bando.scadenza) return null;
  const time = new Date(bando.scadenza).getTime();
  return Number.isFinite(time) ? time : null;
}

/** True quando la scadenza è passata (fine giornata della data di scadenza). */
export function isExpired(bando: Pick<Bando, "scadenza">, now: number = Date.now()): boolean {
  const time = deadlineTime(bando);
  if (time === null) return false;
  return time + 86_400_000 - 1 < now;
}

export function isActive(bando: Pick<Bando, "scadenza">, now: number = Date.now()): boolean {
  return !isExpired(bando, now);
}

export function daysLeft(bando: Pick<Bando, "scadenza">, now: number = Date.now()): number | null {
  const time = deadlineTime(bando);
  return time === null ? null : Math.ceil((time - now) / 86_400_000);
}

/** Un bando è "flash" solo se è ancora attivo. */
export function isFlash(
  bando: Pick<Bando, "scadenza" | "flash" | "click_day">,
  now: number = Date.now(),
): boolean {
  if (isExpired(bando, now)) return false;
  const left = daysLeft(bando, now);
  return Boolean(bando.flash || bando.click_day || (left !== null && left <= 10));
}

/* ------------------------------------------------------------------ *
 * Qualità del dato: "Verificato" è fail-closed.
 * Il badge attesta solo la presenza dei dati obbligatori dalla fonte
 * ufficiale; non è e non va presentato come garanzia di ammissibilità.
 * ------------------------------------------------------------------ */

export const VERIFIED_HINT =
  "Verificato = data (o sportello) e importo massimo sul testo ufficiale. Riguarda i dati della scheda, non la tua impresa.";

/** Testo unico per le schede a sportello, in italiano semplice. */
export const SPORTELLO_NOTICE =
  "Puoi chiedere adesso. Non c'è una data di chiusura: si può chiedere fino a esaurimento fondi.";


function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Procedura a sportello dichiarata dalla fonte: l'assenza di scadenza è un
 * dato completo, non un buco. Nessuna data viene inventata.
 */
export function isSportello(
  bando: Pick<Bando, "verification_status" | "sportello">,
): boolean {
  return bando.sportello === true || bando.verification_status === "SPORTELLO";
}

/** Lo stato "data" è completo con una scadenza ufficiale oppure con lo sportello. */
export function hasDateState(
  bando: Pick<Bando, "scadenza" | "verification_status" | "sportello">,
): boolean {
  return nonEmpty(bando.scadenza) || isSportello(bando);
}

/** Almeno un dato economico utilizzabile (importo, intensità o spese ammissibili). */
export function hasEconomics(bando: Bando): boolean {
  if (typeof bando.importo_max === "number" && bando.importo_max > 0) return true;
  if (typeof bando.aid_intensity_percent === "number" && bando.aid_intensity_percent > 0)
    return true;
  return (bando.eligible_expenses ?? []).some((e) => nonEmpty(e));
}

export function officialLink(bando: Bando): string | null {
  const url = bando.official_url ?? bando.notice_url;
  return nonEmpty(url) ? (url as string) : null;
}

/**
 * Fail-closed: in assenza anche di un solo dato obbligatorio il bando NON è
 * verificato. Nessuna promozione automatica, nessun valore inventato.
 * Lo sportello vale come stato-data completo.
 */
export function isVerified(bando: Bando, now: number = Date.now()): boolean {
  const status = bando.verification_status;
  if (status !== "VERIFICATO" && status !== "SPORTELLO") return false;
  if (!nonEmpty(bando.titolo) || !nonEmpty(bando.ente)) return false;
  if (!officialLink(bando)) return false;
  if (!hasDateState(bando) || isExpired(bando, now)) return false;
  if (!hasEconomics(bando)) return false;
  // Requisiti o evidenza documentale: se entrambi assenti non si promuove.
  const hasRequisiti = (bando.requisiti ?? []).some((r) => nonEmpty(r));
  const hasEvidence = (bando.evidence ?? []).some((e) => nonEmpty(e?.source_url));
  if (!hasRequisiti && !hasEvidence) return false;
  return true;
}

/** True quando manca lo stato-data (scadenza o sportello) e/o il dato economico. */
export function hasIncompleteCoreData(bando: Bando): boolean {
  return !hasDateState(bando) || !hasEconomics(bando);
}

/**
 * Fonte sommersa o poco diffusa: is_hidden da Core oppure rarity_score >= 4.
 * Usato solo per ordinamento e contatori UI, non inventa schede.
 */
export function isRareOrHidden(bando: Pick<Bando, "is_hidden" | "rarity_score">): boolean {
  if (bando.is_hidden === true) return true;
  const rarity = bando.rarity_score;
  return typeof rarity === "number" && Number.isFinite(rarity) && rarity >= 4;
}

/**
 * Ordinamento UI: verificati in alto, poi scadenza futura, poi dato economico.
 * Nessun bando viene nascosto: al massimo deprioritizzato.
 */
export function qualityRank(bando: Bando, now: number = Date.now()): number {
  if (isVerified(bando, now)) return 0;
  const withDeadline = hasDateState(bando) && !isExpired(bando, now);
  if (withDeadline) return 1;
  if (hasEconomics(bando)) return 2;
  if (hasDateState(bando)) return 3;
  return 4;
}

/** Comparatore stabile per il feed (rank, poi nascosti/rari, poi scadenza più vicina). */
export function compareByQuality(a: Bando, b: Bando, now: number = Date.now()): number {
  const rank = qualityRank(a, now) - qualityRank(b, now);
  if (rank !== 0) return rank;
  // A parità di qualità dati: fonti locali / poco diffuse prima
  const rareA = isRareOrHidden(a) ? 0 : 1;
  const rareB = isRareOrHidden(b) ? 0 : 1;
  if (rareA !== rareB) return rareA - rareB;
  const ta = deadlineTime(a) ?? Number.POSITIVE_INFINITY;
  const tb = deadlineTime(b) ?? Number.POSITIVE_INFINITY;
  return ta - tb;
}

/* ------------------------------------------------------------------ *
 * Ranking geografico (ADDITIVE, non-breaking)
 * ------------------------------------------------------------------ *
 * Preferisce bandi della stessa provincia/comune o regione del profilo.
 * Non nasconde mai i bandi nazionali/europei e non altera compareByQuality.
 * Se il profilo non ha dati geografici, il boost è 0 → comportamento identico.
 */

export type GeoProfile = {
  regione?: string | null;
  provincia?: string | null;
  comune?: string | null;
} | null;

function normGeo(v?: string | null): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/**
 * Boost geografico puro.
 * - Stessa provincia o stesso comune → +40
 * - Stessa regione → +25
 * - Altrimenti → 0
 */
export function geographicBoost(
  bando: Pick<Bando, "scope" | "regione" | "provincia" | "comune">,
  profile: GeoProfile,
): number {
  if (!profile) return 0;

  const br = normGeo(bando.regione);
  const bp = normGeo(bando.provincia);
  const bc = normGeo(bando.comune);
  const pr = normGeo(profile.regione);
  const pp = normGeo(profile.provincia);
  const pc = normGeo(profile.comune);

  // Stessa provincia o stesso comune
  if ((bp && pp && bp === pp) || (bc && pc && bc === pc)) return 40;

  // Stessa regione
  if (br && pr && br === pr) return 25;

  return 0;
}

/**
 * Comparatore esteso: prima la qualità dati (invariata), poi il boost geografico.
 * Sostituibile in qualsiasi punto che oggi usa compareByQuality.
 */
export function compareByQualityAndGeo(
  a: Bando,
  b: Bando,
  profile: GeoProfile,
  now: number = Date.now(),
): number {
  const quality = compareByQuality(a, b, now);
  if (quality !== 0) return quality;
  // Boost più alto = prima in lista → invertito rispetto al rank numerico
  return geographicBoost(b, profile) - geographicBoost(a, profile);
}
