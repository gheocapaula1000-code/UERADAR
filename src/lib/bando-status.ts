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
  "Verificato = dati obbligatori presenti dalla fonte; non è garanzia di ammissibilità.";

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
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
 */
export function isVerified(bando: Bando, now: number = Date.now()): boolean {
  if (bando.verification_status !== "VERIFICATO") return false;
  if (!nonEmpty(bando.titolo) || !nonEmpty(bando.ente)) return false;
  if (!officialLink(bando)) return false;
  if (!nonEmpty(bando.scadenza) || isExpired(bando, now)) return false;
  if (!hasEconomics(bando)) return false;
  // Requisiti o evidenza documentale: se entrambi assenti non si promuove.
  const hasRequisiti = (bando.requisiti ?? []).some((r) => nonEmpty(r));
  const hasEvidence = (bando.evidence ?? []).some((e) => nonEmpty(e?.source_url));
  if (!hasRequisiti && !hasEvidence) return false;
  return true;
}

/** True quando mancano scadenza e/o dato economico: scheda da completare sulla fonte. */
export function hasIncompleteCoreData(bando: Bando): boolean {
  return !nonEmpty(bando.scadenza) || !hasEconomics(bando);
}

/**
 * Ordinamento UI: verificati in alto, poi scadenza futura, poi dato economico.
 * Nessun bando viene nascosto: al massimo deprioritizzato.
 */
export function qualityRank(bando: Bando, now: number = Date.now()): number {
  if (isVerified(bando, now)) return 0;
  const withDeadline = nonEmpty(bando.scadenza) && !isExpired(bando, now);
  if (withDeadline) return 1;
  if (hasEconomics(bando)) return 2;
  if (nonEmpty(bando.scadenza)) return 3;
  return 4;
}

/** Comparatore stabile per il feed (rank, poi scadenza più vicina). */
export function compareByQuality(a: Bando, b: Bando, now: number = Date.now()): number {
  const rank = qualityRank(a, now) - qualityRank(b, now);
  if (rank !== 0) return rank;
  const ta = deadlineTime(a) ?? Number.POSITIVE_INFINITY;
  const tb = deadlineTime(b) ?? Number.POSITIVE_INFINITY;
  return ta - tb;
}
