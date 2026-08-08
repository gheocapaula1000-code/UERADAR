/**
 * Logica pura di fatturazione UEradar condivisa dalle Edge Function.
 * Nessun segreto qui dentro: solo catalogo piani, mappatura stati ed entitlement.
 * Modalità TEST obbligatoria: qualunque chiave o evento live viene rifiutato.
 */
export type PlanId = "business" | "team";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  amountCents: number;
  currency: "eur";
  seats: number;
  priceEnv: string;
  planCode: string;
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  business: {
    id: "business",
    name: "BUSINESS",
    amountCents: 29900,
    currency: "eur",
    seats: 3,
    priceEnv: "STRIPE_PRICE_BUSINESS",
    planCode: "ueradar_business_monthly",
  },
  team: {
    id: "team",
    name: "TEAM",
    amountCents: 59900,
    currency: "eur",
    seats: 10,
    priceEnv: "STRIPE_PRICE_TEAM",
    planCode: "ueradar_team_monthly",
  },
};

export const SUBSCRIPTION_STATES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const;
export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];

export function normalizeStatus(value: unknown): SubscriptionState | "canceled" {
  return typeof value === "string" && (SUBSCRIPTION_STATES as readonly string[]).includes(value)
    ? (value as SubscriptionState)
    : "canceled";
}

/** La chiave deve essere di test: qualunque altro formato blocca l'operazione. */
export function isTestSecretKey(key: string): boolean {
  return /^(sk|rk)_test_[A-Za-z0-9_]+$/.test(key.trim());
}

export function isTestPriceId(price: string): boolean {
  return /^price_[A-Za-z0-9_]+$/.test(price.trim());
}

export function planFromInput(value: unknown): PlanDefinition | null {
  return value === "business" || value === "team" ? PLANS[value] : null;
}

export function seatsForPlanCode(planCode: unknown): number {
  for (const plan of Object.values(PLANS)) if (plan.planCode === planCode) return plan.seats;
  return 0;
}

export function planFromPriceId(priceId: unknown, map: Record<string, string>): PlanDefinition | null {
  if (typeof priceId !== "string") return null;
  for (const plan of Object.values(PLANS)) if (map[plan.id] === priceId) return plan;
  return null;
}

export type SubscriptionSnapshot = {
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  plan_code: string | null;
  plan_seats: number;
};

export type Entitlement = {
  entitled: boolean;
  state: "TRIAL" | "ACTIVE" | "TRIAL_EXPIRED" | "PAST_DUE" | "UNPAID" | "CANCELED" | "NONE";
  seats: number;
  requiresPayment: boolean;
  requiresPortal: boolean;
  reason: string;
};

const DENIED = (
  state: Entitlement["state"],
  reason: string,
  extra: Partial<Entitlement> = {},
): Entitlement => ({
  entitled: false,
  state,
  seats: 0,
  requiresPayment: true,
  requiresPortal: false,
  reason,
  ...extra,
});

/**
 * Entitlement fail-closed: in assenza di dati validi l'accesso è negato.
 * La prova gratuita di 7 giorni non richiede carta e vale solo fino a trial_ends_at.
 */
export function resolveEntitlement(
  row: SubscriptionSnapshot | null | undefined,
  nowIso: string,
): Entitlement {
  if (!row) return DENIED("NONE", "NO_SUBSCRIPTION_ROW");
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return DENIED("NONE", "INVALID_CLOCK");

  const status = normalizeStatus(row.status);
  const seats = row.plan_seats > 0 ? row.plan_seats : seatsForPlanCode(row.plan_code);
  const trialEnd = row.trial_ends_at ? Date.parse(row.trial_ends_at) : NaN;
  const periodEnd = row.current_period_end ? Date.parse(row.current_period_end) : NaN;

  if (status === "trialing") {
    if (!Number.isFinite(trialEnd)) return DENIED("NONE", "TRIAL_WITHOUT_END");
    if (trialEnd <= now) return DENIED("TRIAL_EXPIRED", "TRIAL_EXPIRED");
    return {
      entitled: true,
      state: "TRIAL",
      seats: seats || PLANS.business.seats,
      requiresPayment: false,
      requiresPortal: false,
      reason: "TRIAL_ACTIVE",
    };
  }

  if (status === "active") {
    if (!Number.isFinite(periodEnd)) return DENIED("CANCELED", "ACTIVE_WITHOUT_PERIOD_END");
    if (periodEnd <= now) return DENIED("CANCELED", "PERIOD_ENDED");
    if (seats <= 0) return DENIED("CANCELED", "PLAN_WITHOUT_SEATS");
    return {
      entitled: true,
      state: "ACTIVE",
      seats,
      requiresPayment: false,
      requiresPortal: false,
      reason: row.cancel_at_period_end ? "ACTIVE_CANCEL_AT_PERIOD_END" : "ACTIVE",
    };
  }

  if (status === "past_due")
    return DENIED("PAST_DUE", "PAST_DUE", { requiresPortal: true, requiresPayment: false });
  if (status === "unpaid")
    return DENIED("UNPAID", "UNPAID", { requiresPortal: true, requiresPayment: false });
  return DENIED("CANCELED", `STATUS_${status.toUpperCase()}`);
}

/** Il numero di utenti nominativi reali della stessa impresa non può superare il piano. */
export function canAddMember(currentMembers: number, entitlement: Entitlement) {
  if (!entitlement.entitled) return { allowed: false, reason: "NOT_ENTITLED" };
  if (currentMembers + 1 > entitlement.seats) return { allowed: false, reason: "SEATS_EXCEEDED" };
  return { allowed: true, reason: "OK" };
}

/** Verifica firma webhook Stripe (schema v1, HMAC SHA-256, tolleranza 5 minuti). */
export async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): Promise<{ ok: boolean; reason: string }> {
  if (!secret.startsWith("whsec_")) return { ok: false, reason: "BAD_WEBHOOK_SECRET" };
  const parts = Object.fromEntries(
    header
      .split(",")
      .map((p) => p.trim().split("="))
      .filter((p) => p.length === 2) as [string, string][],
  );
  const timestamp = Number(parts["t"]);
  const provided = parts["v1"];
  if (!Number.isFinite(timestamp) || !provided) return { ok: false, reason: "BAD_SIGNATURE_HEADER" };
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds)
    return { ok: false, reason: "SIGNATURE_TOO_OLD" };

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== provided.length) return { ok: false, reason: "SIGNATURE_MISMATCH" };
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0 ? { ok: true, reason: "SIGNATURE_OK" } : { ok: false, reason: "SIGNATURE_MISMATCH" };
}