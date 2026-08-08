/**
 * Enforcement server-side dei limiti di piano.
 * Le decisioni non passano mai dal browser: quote e cadenze sono applicate
 * con funzioni atomiche a database sul tenant (impresa) risolto lato server.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveEntitlement, type Entitlement, type SubscriptionSnapshot } from "./billing";
import { periodKey, type QuotaKind } from "./usage";

/** Client di servizio non tipizzato: i contatori non sono esposti alla Data API. */
function usageClient(): SupabaseClient {
  return createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function entitlementForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  nowIso = new Date().toISOString(),
): Promise<Entitlement> {
  const { data, error } = await supabase
    .from("ueradar_subscriptions")
    .select(
      "status, plan_code, plan_seats, trial_ends_at, current_period_end, cancel_at_period_end",
    )
    .eq("user_id", tenantId)
    .maybeSingle();
  // Fail-closed: qualunque errore di lettura nega l'accesso.
  if (error) return resolveEntitlement(null, nowIso);
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
  return resolveEntitlement(snapshot, nowIso);
}

export type ConsumeResult = { allowed: boolean; code: string; used: number; limit: number };

/** Consuma una unità di quota mensile in modo atomico. */
export async function consumeQuota(
  tenantId: string,
  kind: QuotaKind,
  limit: number,
  nowIso = new Date().toISOString(),
): Promise<ConsumeResult> {
  const { data, error } = await usageClient().rpc("ueradar_consume_quota", {
    _tenant: tenantId,
    _period: periodKey(nowIso),
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

export async function readUsage(tenantId: string, nowIso = new Date().toISOString()) {
  const { data, error } = await usageClient()
    .from("ueradar_usage_counters")
    .select("period_ym, deep_verifications, dossiers, last_full_search_at, last_urgent_search_at")
    .eq("user_id", tenantId)
    .eq("period_ym", periodKey(nowIso))
    .maybeSingle();
  if (error) return null;
  return (data as Record<string, unknown> | null) ?? null;
}
