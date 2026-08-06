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
