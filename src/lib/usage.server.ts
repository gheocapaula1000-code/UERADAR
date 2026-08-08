/**
 * Enforcement server-side dei limiti di piano.
 * Le decisioni non passano mai dal browser: quote e cadenze sono applicate
 * con funzioni atomiche a database sul tenant (impresa) risolto lato server.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveEntitlement, type Entitlement, type SubscriptionSnapshot } from "./billing";
import { periodKey, usagePeriodKey, type QuotaKind } from "./usage";

/** Client di servizio non tipizzato: i contatori non sono esposti alla Data API. */
function usageClient(): SupabaseClient {
  return createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TenantUsageContext = { entitlement: Entitlement; period: string };

/**
 * Entitlement + periodo di consumo del tenant.
 * Durante la prova il periodo copre l'intera prova, non il mese solare.
 */
export async function tenantUsageContext(
  supabase: SupabaseClient,
  tenantId: string,
  nowIso = new Date().toISOString(),
): Promise<TenantUsageContext> {
  const { entitlement, trialStartedAt } = await readEntitlement(supabase, tenantId, nowIso);
  const period = usagePeriodKey({
    isTrial: entitlement.state === "TRIAL",
    trialStartedAt,
    nowIso,
  });
  return { entitlement, period };
}

export async function entitlementForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  nowIso = new Date().toISOString(),
): Promise<Entitlement> {
  return (await readEntitlement(supabase, tenantId, nowIso)).entitlement;
}

async function readEntitlement(
  supabase: SupabaseClient,
  tenantId: string,
  nowIso: string,
): Promise<{ entitlement: Entitlement; trialStartedAt: string | null }> {
  const { data, error } = await supabase
    .from("ueradar_subscriptions")
    .select(
      "status, plan_code, plan_seats, trial_started_at, trial_ends_at, current_period_end, cancel_at_period_end",
    )
    .eq("user_id", tenantId)
    .maybeSingle();
  // Fail-closed: qualunque errore di lettura nega l'accesso.
  if (error) return { entitlement: resolveEntitlement(null, nowIso), trialStartedAt: null };
  const row = data as Record<string, unknown> | null;
  const snapshot: SubscriptionSnapshot | null = row
    ? {
        status: String(row["status"] ?? ""),
        trial_ends_at: (row["trial_ends_at"] as string | null) ?? null,
        current_period_end: (row["current_period_end"] as string | null) ?? null,
        cancel_at_period_end: Boolean(row["cancel_at_period_end"]),
        plan_code: (row["plan_code"] as string | null) ?? null,
        plan_seats: Number(row["plan_seats"] ?? 0),
      }
    : null;
  return {
    entitlement: resolveEntitlement(snapshot, nowIso),
    trialStartedAt: (row?.["trial_started_at"] as string | null) ?? null,
  };
}

export type ConsumeResult = { allowed: boolean; code: string; used: number; limit: number };

/**
 * Consuma una unità di quota in modo atomico e idempotente per opportunità:
 * riaprire la stessa opportunità nello stesso periodo non consuma di nuovo.
 */
export async function consumeQuotaOnce(input: {
  tenantId: string;
  kind: QuotaKind;
  opportunityId: string;
  limit: number;
  period: string;
}): Promise<ConsumeResult> {
  const { data, error } = await usageClient().rpc("ueradar_consume_quota_once", {
    _tenant: input.tenantId,
    _period: input.period,
    _kind: input.kind,
    _opportunity: input.opportunityId,
    _limit: input.limit,
  });
  if (error)
    return { allowed: false, code: "USAGE_UNAVAILABLE", used: 0, limit: input.limit };
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    allowed: row["allowed"] === true,
    code: typeof row["code"] === "string" ? (row["code"] as string) : "USAGE_UNAVAILABLE",
    used: Number(row["used"] ?? 0),
    limit: input.limit,
  };
}

/** Consuma una unità di quota mensile in modo atomico. */
export async function consumeQuota(
  tenantId: string,
  kind: QuotaKind,
  limit: number,
  nowIso = new Date().toISOString(),
  period = periodKey(nowIso),
): Promise<ConsumeResult> {
  const { data, error } = await usageClient().rpc("ueradar_consume_quota", {
    _tenant: tenantId,
    _period: period,
    _kind: kind,
    _limit: limit,
  });
  if (error) return { allowed: false, code: "USAGE_UNAVAILABLE", used: 0, limit };
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    allowed: row["allowed"] === true,
    code: typeof row["code"] === "string" ? (row["code"] as string) : "USAGE_UNAVAILABLE",
    used: Number(row["used"] ?? 0),
    limit,
  };
}

export type LaneResult = { allowed: boolean; code: string; retry_after_seconds: number };

/** Rivendica una corsa di ricerca rispettando la cadenza del piano. */
export async function claimSearchLane(
  tenantId: string,
  lane: "full" | "urgent",
  minIntervalMinutes: number | null,
  nowIso = new Date().toISOString(),
): Promise<LaneResult> {
  if (minIntervalMinutes === null)
    return { allowed: false, code: "LANE_NOT_INCLUDED", retry_after_seconds: 0 };
  const { data, error } = await usageClient().rpc("ueradar_claim_search_lane", {
    _tenant: tenantId,
    _period: periodKey(nowIso),
    _lane: lane,
    _min_interval_minutes: minIntervalMinutes,
  });
  if (error) return { allowed: false, code: "USAGE_UNAVAILABLE", retry_after_seconds: 0 };
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    allowed: row["allowed"] === true,
    code: typeof row["code"] === "string" ? (row["code"] as string) : "USAGE_UNAVAILABLE",
    retry_after_seconds: Number(row["retry_after_seconds"] ?? 0),
  };
}

export async function readUsage(
  tenantId: string,
  nowIso = new Date().toISOString(),
  period = periodKey(nowIso),
) {
  const { data, error } = await usageClient()
    .from("ueradar_usage_counters")
    .select("period_ym, deep_verifications, dossiers, last_full_search_at, last_urgent_search_at")
    .eq("user_id", tenantId)
    .eq("period_ym", period)
    .maybeSingle();
  if (error) return null;
  return (data as Record<string, unknown> | null) ?? null;
}
