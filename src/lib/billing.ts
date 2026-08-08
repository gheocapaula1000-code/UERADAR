/**
 * Logica pura di fatturazione UEradar (modalità TEST obbligatoria).
 * Nessun segreto qui: stati abbonamento, entitlement fail-closed, validazione
 * dei prezzi remoti e controllo della capienza utenti. Il catalogo (prezzi,
 * limiti, capienza) vive in `catalog.ts` ed è l'unica fonte di verità.
 */
import {
  CATALOG,
  checkoutTarget,
  formatEuro,
  intervalFromCode,
  normalizePlanCode,
  planFromCode,
  TRIAL_PLAN_CODE,
  type BillingInterval,
  type PlanDefinition,
  type PlanId,
  type PlanLimits,
  type PlanPrice,
} from "./catalog";

export type { BillingInterval, PlanDefinition, PlanId, PlanLimits, PlanPrice };
export { CATALOG, checkoutTarget, formatEuro };

/** Chiave del price map server-side: piano + intervallo. */
export function priceKey(plan: PlanId, interval: BillingInterval): string {
  return `${plan}:${interval}`;
}

export const SUBSCRIPTION_STATES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
  "superseded_by_tenant",
] as const;
export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];

export function normalizeStatus(value: unknown): SubscriptionState {
  return typeof value === "string" && (SUBSCRIPTION_STATES as readonly string[]).includes(value)
    ? (value as SubscriptionState)
    : "canceled";
}

/** La chiave segreta deve essere di test: qualunque altro formato blocca tutto. */
export function isTestSecretKey(key: string): boolean {
  return /^(sk|rk)_test_[A-Za-z0-9_]+$/.test(key.trim());
}

export function isLiveSecretKey(key: string): boolean {
  return /^(sk|rk)_live_/.test(key.trim());
}

export function isValidPriceId(price: string): boolean {
  return /^price_[A-Za-z0-9_]+$/.test(price.trim());
}

export function seatsForPlanCode(planCode: unknown): number {
  return planFromCode(planCode).limits.seats;
}

export function limitsForPlanCode(planCode: unknown): PlanLimits {
  return planFromCode(planCode).limits;
}

/** Risolve piano e intervallo a partire dal Price ID ricevuto dal provider. */
export function planFromPriceId(
  priceId: unknown,
  map: Record<string, string>,
): { plan: PlanDefinition; price: PlanPrice } | null {
  if (typeof priceId !== "string" || !priceId) return null;
  for (const plan of Object.values(CATALOG)) {
    for (const price of Object.values(plan.prices)) {
      if (map[priceKey(plan.id, price.interval)] === priceId) return { plan, price };
    }
  }
  return null;
}

/**
 * Validazione del prezzo remoto prima di aprire una sessione: qualunque
 * discrepanza blocca il checkout (fail-closed) e un prezzo live lo interrompe.
 */
export function validateRemotePrice(
  remote: Record<string, unknown> | null,
  expected: PlanPrice,
): { ok: boolean; code: string } {
  if (!remote) return { ok: false, code: "PRICE_NOT_FOUND" };
  if (remote["livemode"] === true) return { ok: false, code: "LIVE_MODE_BLOCKED" };
  if (remote["livemode"] !== false) return { ok: false, code: "PRICE_MODE_UNKNOWN" };
  if (remote["active"] !== true) return { ok: false, code: "PRICE_NOT_ACTIVE" };
  if (remote["currency"] !== "eur") return { ok: false, code: "PRICE_CURRENCY_MISMATCH" };
  if (remote["unit_amount"] !== expected.amountCents)
    return { ok: false, code: "PRICE_AMOUNT_MISMATCH" };
  const recurring = remote["recurring"];
  const interval =
    recurring && typeof recurring === "object" && !Array.isArray(recurring)
      ? (recurring as Record<string, unknown>)["interval"]
      : null;
  if (interval !== expected.interval) return { ok: false, code: "PRICE_INTERVAL_MISMATCH" };
  const taxBehavior = remote["tax_behavior"];
  // Prezzi IVA esclusa: il comportamento fiscale deve essere coerente.
  if (taxBehavior !== "exclusive") return { ok: false, code: "PRICE_TAX_BEHAVIOR_MISMATCH" };
  return { ok: true, code: "OK" };
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
  planId: PlanId;
  planCode: string;
  interval: BillingInterval | null;
  seats: number;
  limits: PlanLimits;
  requiresPayment: boolean;
  requiresPortal: boolean;
  reason: string;
};

const DENIED_LIMITS: PlanLimits = {
  seats: 0,
  companies: 0,
  deepVerificationsPerMonth: 0,
  dossiersPerMonth: 0,
  fullSearchIntervalMinutes: Number.MAX_SAFE_INTEGER,
  urgentLaneIntervalMinutes: null,
  sourceTier: "core",
  crossVerification: false,
  changeMonitoring: false,
  apiAccess: false,
  exportsEnabled: false,
  watermarkedDossier: true,
};

function denied(
  state: Entitlement["state"],
  reason: string,
  extra: Partial<Entitlement> = {},
): Entitlement {
  return {
    entitled: false,
    state,
    planId: "trial",
    planCode: TRIAL_PLAN_CODE,
    interval: null,
    seats: 0,
    limits: DENIED_LIMITS,
    requiresPayment: true,
    requiresPortal: false,
    reason,
    ...extra,
  };
}

/**
 * Entitlement fail-closed: senza dati validi l'accesso è negato.
 * La prova gratuita di 7 giorni non richiede carta e vale fino a trial_ends_at.
 */
export function resolveEntitlement(
  row: SubscriptionSnapshot | null | undefined,
  nowIso: string,
): Entitlement {
  if (!row) return denied("NONE", "NO_SUBSCRIPTION_ROW");
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) return denied("NONE", "INVALID_CLOCK");

  const status = normalizeStatus(row.status);
  const planCode = normalizePlanCode(row.plan_code);
  const trialEnd = row.trial_ends_at ? Date.parse(row.trial_ends_at) : Number.NaN;
  const periodEnd = row.current_period_end ? Date.parse(row.current_period_end) : Number.NaN;

  if (status === "trialing") {
    if (!Number.isFinite(trialEnd)) return denied("NONE", "TRIAL_WITHOUT_END");
    if (trialEnd <= now) return denied("TRIAL_EXPIRED", "TRIAL_EXPIRED");
    // La prova è applicativa: livello Business con capienza ridotta.
    return {
      entitled: true,
      state: "TRIAL",
      planId: "trial",
      planCode: TRIAL_PLAN_CODE,
      interval: null,
      seats: CATALOG.trial.limits.seats,
      limits: CATALOG.trial.limits,
      requiresPayment: false,
      requiresPortal: false,
      reason: "TRIAL_ACTIVE",
    };
  }

  if (status === "active") {
    if (!Number.isFinite(periodEnd)) return denied("CANCELED", "ACTIVE_WITHOUT_PERIOD_END");
    if (periodEnd <= now) return denied("CANCELED", "PERIOD_ENDED");
    const plan = planFromCode(planCode);
    if (plan.id === "trial") return denied("CANCELED", "ACTIVE_WITHOUT_PLAN");
    const seats = row.plan_seats > 0 ? row.plan_seats : plan.limits.seats;
    if (seats <= 0 && plan.limits.seats >= 0) return denied("CANCELED", "PLAN_WITHOUT_SEATS");
    return {
      entitled: true,
      state: "ACTIVE",
      planId: plan.id,
      planCode,
      interval: intervalFromCode(planCode),
      seats,
      limits: plan.limits,
      requiresPayment: false,
      requiresPortal: false,
      reason: row.cancel_at_period_end ? "ACTIVE_CANCEL_AT_PERIOD_END" : "ACTIVE",
    };
  }

  if (status === "past_due")
    return denied("PAST_DUE", "PAST_DUE", { requiresPortal: true, requiresPayment: false });
  if (status === "unpaid")
    return denied("UNPAID", "UNPAID", { requiresPortal: true, requiresPayment: false });
  return denied("CANCELED", `STATUS_${status.toUpperCase()}`);
}

/** Gli utenti operativi della stessa impresa non possono superare la capienza. */
export function canAddMember(currentMembers: number, entitlement: Entitlement) {
  if (!entitlement.entitled) return { allowed: false, reason: "NOT_ENTITLED" as const };
  if (entitlement.seats < 0) return { allowed: true, reason: "OK" as const };
  if (currentMembers + 1 > entitlement.seats)
    return { allowed: false, reason: "SEATS_EXCEEDED" as const };
  return { allowed: true, reason: "OK" as const };
}

/** Ruoli dichiarati dal titolare per gli utenti operativi. */
export const MEMBER_ROLES = ["dipendente", "socio", "amministratore"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export function isMemberRole(value: unknown): value is MemberRole {
  return typeof value === "string" && (MEMBER_ROLES as readonly string[]).includes(value);
}

/**
 * Una sola sottoscrizione per utente: se ne esiste già una attiva o in prova
 * presso il provider, non si apre una seconda sessione di pagamento.
 */
export function canStartNewSubscription(
  row:
    | {
        status?: string | null;
        provider_subscription_id?: string | null;
      }
    | null
    | undefined,
): { allowed: boolean; reason: string } {
  const subscriptionId = row?.provider_subscription_id ?? null;
  if (!subscriptionId) return { allowed: true, reason: "NO_PROVIDER_SUBSCRIPTION" };
  const status = normalizeStatus(row?.status);
  if (status === "active" || status === "trialing")
    return { allowed: false, reason: "SUBSCRIPTION_ALREADY_ACTIVE" };
  return { allowed: true, reason: "PREVIOUS_SUBSCRIPTION_INACTIVE" };
}

/**
 * Chiave di idempotenza deterministica: la stessa intenzione non crea
 * risorse duplicate presso il provider anche in caso di retry o doppio clic.
 */
export function idempotencyKey(scope: string, ...parts: (string | number)[]): string {
  const raw = [scope, ...parts]
    .map((p) => String(p).trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, "-"))
    .filter(Boolean)
    .join(":");
  return `ueradar:test:${raw}`.slice(0, 255);
}

/** Metadati minimi dell'evento: mai il payload completo con dati personali. */
export function billingEventMetadata(event: Record<string, unknown>) {
  const data = event["data"];
  const object =
    data && typeof data === "object" && !Array.isArray(data)
      ? ((data as Record<string, unknown>)["object"] as Record<string, unknown> | undefined)
      : undefined;
  const objectId = typeof object?.["id"] === "string" ? (object["id"] as string) : null;
  const customer = typeof object?.["customer"] === "string" ? (object["customer"] as string) : null;
  return {
    event_id: typeof event["id"] === "string" ? (event["id"] as string) : "",
    event_type: typeof event["type"] === "string" ? (event["type"] as string) : "",
    livemode: event["livemode"] === true,
    object_id: objectId,
    provider_customer_id: customer,
  };
}

/** Verifica firma webhook (schema v1, HMAC SHA-256, tolleranza 5 minuti). */
export async function verifyWebhookSignature(
  payload: string,
  header: string,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): Promise<{ ok: boolean; reason: string }> {
  if (!secret.startsWith("whsec_")) return { ok: false, reason: "BAD_WEBHOOK_SECRET" };
  const parts: Record<string, string> = {};
  for (const piece of header.split(",")) {
    const [k, v] = piece.trim().split("=");
    if (k && v) parts[k] = v;
  }
  const timestamp = Number(parts["t"]);
  const provided = parts["v1"];
  if (!Number.isFinite(timestamp) || !provided)
    return { ok: false, reason: "BAD_SIGNATURE_HEADER" };
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
  for (let i = 0; i < expected.length; i += 1)
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0
    ? { ok: true, reason: "SIGNATURE_OK" }
    : { ok: false, reason: "SIGNATURE_MISMATCH" };
}

/** Mappa un abbonamento remoto sulle colonne dell'anagrafica locale. */
export function subscriptionUpdateFromEvent(input: {
  status: unknown;
  currentPeriodEnd: unknown;
  cancelAtPeriodEnd: unknown;
  priceId: unknown;
  subscriptionId: unknown;
  customerId: unknown;
  priceMap: Record<string, string>;
}) {
  const match = planFromPriceId(input.priceId, input.priceMap);
  const seconds = typeof input.currentPeriodEnd === "number" ? input.currentPeriodEnd : 0;
  return {
    status: normalizeStatus(input.status),
    provider: "stripe",
    billing_mode: "test",
    provider_subscription_id:
      typeof input.subscriptionId === "string" ? input.subscriptionId : null,
    provider_customer_id: typeof input.customerId === "string" ? input.customerId : null,
    stripe_price_id: typeof input.priceId === "string" ? input.priceId : null,
    plan_code: match?.price.planCode ?? TRIAL_PLAN_CODE,
    plan_seats: match?.plan.limits.seats ?? 0,
    cancel_at_period_end: input.cancelAtPeriodEnd === true,
    current_period_end: seconds > 0 ? new Date(seconds * 1000).toISOString() : null,
    trial_consumed: true,
  };
}
