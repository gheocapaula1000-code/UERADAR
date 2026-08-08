/**
 * Entitlement e cadenza applicati DENTRO la Edge Function.
 * La Edge è invocabile direttamente con un JWT valido: non può fidarsi del
 * gate applicativo. Questo modulo è puro (nessun IO) e duplica volutamente le
 * sole regole necessarie al gateway; il catalogo completo resta in src/lib.
 */
export type EdgeLimits = {
  fullSearchIntervalMinutes: number;
  urgentLaneIntervalMinutes: number | null;
};

export type EdgeEntitlement = {
  entitled: boolean;
  state: "TRIAL" | "ACTIVE" | "TRIAL_NOT_STARTED" | "TRIAL_EXPIRED" | "DENIED";
  reason: string;
  limits: EdgeLimits;
};

const DENIED_LIMITS: EdgeLimits = {
  fullSearchIntervalMinutes: Number.MAX_SAFE_INTEGER,
  urgentLaneIntervalMinutes: null,
};

const TRIAL_LIMITS: EdgeLimits = { fullSearchIntervalMinutes: 120, urgentLaneIntervalMinutes: 15 };

/** Cadenze per codice piano: allineate al catalogo applicativo. */
const PLAN_LIMITS: Record<string, EdgeLimits> = {
  ueradar_trial: TRIAL_LIMITS,
  ueradar_professional_monthly: { fullSearchIntervalMinutes: 720, urgentLaneIntervalMinutes: null },
  ueradar_professional_annual: { fullSearchIntervalMinutes: 720, urgentLaneIntervalMinutes: null },
  ueradar_business_monthly: { fullSearchIntervalMinutes: 120, urgentLaneIntervalMinutes: 15 },
  ueradar_business_annual: { fullSearchIntervalMinutes: 120, urgentLaneIntervalMinutes: 15 },
  ueradar_executive_monthly: { fullSearchIntervalMinutes: 60, urgentLaneIntervalMinutes: 5 },
  ueradar_executive_annual: { fullSearchIntervalMinutes: 60, urgentLaneIntervalMinutes: 5 },
  ueradar_enterprise: { fullSearchIntervalMinutes: 60, urgentLaneIntervalMinutes: 5 },
};

export function edgeLimitsForPlanCode(code: unknown): EdgeLimits {
  return (typeof code === "string" && PLAN_LIMITS[code]) || TRIAL_LIMITS;
}

function deny(state: EdgeEntitlement["state"], reason: string): EdgeEntitlement {
  return { entitled: false, state, reason, limits: DENIED_LIMITS };
}

/**
 * Fail-closed: senza riga, con clock non valido o con stato non abilitante
 * l'accesso al gateway è negato.
 */
export function edgeEntitlement(
  row: Record<string, unknown> | null | undefined,
  nowIso: string,
): EdgeEntitlement {
  if (!row) return deny("DENIED", "NO_SUBSCRIPTION_ROW");
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return deny("DENIED", "INVALID_CLOCK");

  const status = typeof row["status"] === "string" ? row["status"] : "";
  if (status === "pending") return deny("TRIAL_NOT_STARTED", "TRIAL_NOT_STARTED");

  if (status === "trialing") {
    const end = Date.parse(String(row["trial_ends_at"] ?? ""));
    if (!Number.isFinite(end)) return deny("DENIED", "TRIAL_WITHOUT_END");
    if (end <= now) return deny("TRIAL_EXPIRED", "TRIAL_EXPIRED");
    return { entitled: true, state: "TRIAL", reason: "TRIAL_ACTIVE", limits: TRIAL_LIMITS };
  }

  if (status === "active") {
    const end = Date.parse(String(row["current_period_end"] ?? ""));
    if (!Number.isFinite(end)) return deny("DENIED", "ACTIVE_WITHOUT_PERIOD_END");
    if (end <= now) return deny("DENIED", "PERIOD_ENDED");
    const code = row["plan_code"];
    if (code === "ueradar_trial" || !(typeof code === "string" && PLAN_LIMITS[code]))
      return deny("DENIED", "ACTIVE_WITHOUT_PLAN");
    return { entitled: true, state: "ACTIVE", reason: "ACTIVE", limits: edgeLimitsForPlanCode(code) };
  }

  return deny("DENIED", `STATUS_${(status || "UNKNOWN").toUpperCase()}`);
}

/** Corsia e cadenza minima per l'azione richiesta. */
export function laneFor(
  action: "feed" | "request_refresh",
  limits: EdgeLimits,
): { lane: "full" | "urgent"; minutes: number } {
  if (action === "request_refresh" && limits.urgentLaneIntervalMinutes !== null)
    return { lane: "urgent", minutes: limits.urgentLaneIntervalMinutes };
  return { lane: "full", minutes: limits.fullSearchIntervalMinutes };
}