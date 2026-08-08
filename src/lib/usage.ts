/**
 * Consumi e cadenze: logica pura, testabile e usata dall'enforcement server-side.
 * Le opportunità pertinenti mostrate non sono mai limitate: i limiti riguardano
 * soltanto verifiche approfondite, dossier e frequenza delle ricerche.
 */
export type QuotaKind = "deep_verifications" | "dossiers";

export type QuotaDecision = {
  allowed: boolean;
  reason: "OK" | "QUOTA_EXCEEDED" | "NOT_CONTRACTED" | "INVALID_USAGE";
  remaining: number;
};

/** limit -1 = definito da contratto (nessun blocco applicativo). */
export function quotaDecision(used: unknown, limit: number): QuotaDecision {
  if (limit < 0) return { allowed: true, reason: "OK", remaining: Number.POSITIVE_INFINITY };
  if (limit === 0) return { allowed: false, reason: "NOT_CONTRACTED", remaining: 0 };
  const current = typeof used === "number" && Number.isFinite(used) && used >= 0 ? used : null;
  if (current === null) return { allowed: false, reason: "INVALID_USAGE", remaining: 0 };
  if (current >= limit) return { allowed: false, reason: "QUOTA_EXCEEDED", remaining: 0 };
  return { allowed: true, reason: "OK", remaining: limit - current };
}

export type CadenceDecision = {
  allowed: boolean;
  reason: "OK" | "TOO_SOON" | "LANE_NOT_INCLUDED" | "INVALID_CLOCK";
  retryAfterSeconds: number;
};

export function cadenceDecision(
  lastRunAt: unknown,
  nowIso: string,
  minIntervalMinutes: number | null,
): CadenceDecision {
  if (minIntervalMinutes === null)
    return { allowed: false, reason: "LANE_NOT_INCLUDED", retryAfterSeconds: 0 };
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return { allowed: false, reason: "INVALID_CLOCK", retryAfterSeconds: 0 };
  if (typeof lastRunAt !== "string" || !lastRunAt)
    return { allowed: true, reason: "OK", retryAfterSeconds: 0 };
  const last = Date.parse(lastRunAt);
  if (!Number.isFinite(last)) return { allowed: true, reason: "OK", retryAfterSeconds: 0 };
  const elapsedMs = now - last;
  const windowMs = minIntervalMinutes * 60_000;
  if (elapsedMs >= windowMs) return { allowed: true, reason: "OK", retryAfterSeconds: 0 };
  return {
    allowed: false,
    reason: "TOO_SOON",
    retryAfterSeconds: Math.ceil((windowMs - elapsedMs) / 1000),
  };
}

/** Chiave del periodo di consumo: mese solare UTC. */
export function periodKey(nowIso: string): string {
  const d = new Date(nowIso);
  if (!Number.isFinite(d.getTime())) throw new Error("INVALID_CLOCK");
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type UsageRow = {
  period_ym: string;
  deep_verifications: number;
  dossiers: number;
  last_full_search_at: string | null;
  last_urgent_search_at: string | null;
};

export const EMPTY_USAGE: UsageRow = {
  period_ym: "",
  deep_verifications: 0,
  dossiers: 0,
  last_full_search_at: null,
  last_urgent_search_at: null,
};
