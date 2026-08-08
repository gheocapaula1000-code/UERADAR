/**
 * Logica pura di fatturazione UEradar (modalità TEST obbligatoria).
 * Nessun segreto qui: stati abbonamento, entitlement fail-closed, validazione
 * dei prezzi remoti e controllo della capienza utenti. Il catalogo (prezzi,
 * limiti, capienza) vive in `catalog.ts` ed è l'unica fonte di verità.
 */
import {
  PRICE_ENV_NAMES,
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
  "pending",
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
  const rec =
    recurring && typeof recurring === "object" && !Array.isArray(recurring)
      ? (recurring as Record<string, unknown>)
      : null;
  if (!rec) return { ok: false, code: "PRICE_NOT_RECURRING" };
  if (rec["interval"] !== expected.interval)
    return { ok: false, code: "PRICE_INTERVAL_MISMATCH" };
  // Un solo periodo per ricorrenza: "ogni 2 mesi" non è il piano approvato.
  if (rec["interval_count"] !== 1) return { ok: false, code: "PRICE_INTERVAL_COUNT_MISMATCH" };
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
  state:
    | "TRIAL"
    | "ACTIVE"
    | "TRIAL_EXPIRED"
    | "TRIAL_NOT_STARTED"
    | "PAST_DUE"
    | "UNPAID"
    | "CANCELED"
    | "NONE";
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
  objectives: 0,
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
  // Nessun entitlement automatico alla registrazione: la prova va avviata.
  if (status === "pending")
    return denied("TRIAL_NOT_STARTED", "TRIAL_NOT_STARTED", { requiresPayment: false });
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

/**
 * Capienza utenti: il titolare occupa sempre un posto.
 * Posti usati = 1 (titolare) + membri e inviti pendenti.
 */
export function seatUsage(membersAndInvites: number, entitlement: Entitlement) {
  const total = Math.max(0, Math.trunc(membersAndInvites)) + 1;
  const seats = entitlement.seats;
  return {
    used: total,
    seats,
    unlimited: seats < 0,
    /** Collaboratori ancora invitabili oltre al titolare. */
    remaining: seats < 0 ? Number.POSITIVE_INFINITY : Math.max(0, seats - total),
    label: seats < 0 ? `${total} utenti` : `${total} / ${seats} utenti`,
  };
}

/** Gli utenti operativi della stessa impresa non possono superare la capienza. */
export function canAddMember(currentMembers: number, entitlement: Entitlement) {
  if (!entitlement.entitled) return { allowed: false, reason: "NOT_ENTITLED" as const };
  const usage = seatUsage(currentMembers, entitlement);
  if (usage.unlimited) return { allowed: true, reason: "OK" as const };
  if (usage.used + 1 > usage.seats) return { allowed: false, reason: "SEATS_EXCEEDED" as const };
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
  // Solo gli stati terminali consentono di ripartire: tutto il resto va gestito
  // dal portale cliente, altrimenti si creerebbe una seconda sottoscrizione.
  const TERMINAL: readonly SubscriptionState[] = [
    "canceled",
    "expired",
    "incomplete_expired",
    "superseded_by_tenant",
  ];
  if (!TERMINAL.includes(status))
    return { allowed: false, reason: "SUBSCRIPTION_ALREADY_ACTIVE" };
  return { allowed: true, reason: "PREVIOUS_SUBSCRIPTION_INACTIVE" };
}

/**
 * Ordinamento eventi: un evento più vecchio di quello già applicato non deve
 * retrocedere né riattivare lo stato. Senza timestamp valido si rifiuta.
 */
export function eventIsApplicable(
  eventCreated: unknown,
  lastApplied: unknown,
): { ok: boolean; code: string; createdAt: string | null } {
  const created =
    typeof eventCreated === "number" && Number.isFinite(eventCreated) && eventCreated > 0
      ? new Date(eventCreated * 1000).toISOString()
      : null;
  if (!created) return { ok: false, code: "EVENT_WITHOUT_TIMESTAMP", createdAt: null };
  if (typeof lastApplied === "string" && lastApplied) {
    const previous = Date.parse(lastApplied);
    if (Number.isFinite(previous) && Date.parse(created) < previous)
      return { ok: false, code: "EVENT_OUT_OF_ORDER", createdAt: created };
  }
  return { ok: true, code: "OK", createdAt: created };
}

/**
 * Una fattura non cambia lo stato solo perché il customer coincide: la
 * sottoscrizione e il Price devono corrispondere all'allowlist TEST e al record.
 */
export function invoiceUpdateAllowed(input: {
  invoiceSubscriptionId: unknown;
  invoicePriceId: unknown;
  recordSubscriptionId: unknown;
  priceMap: Record<string, string>;
}): { ok: boolean; code: string } {
  const subId = input.invoiceSubscriptionId;
  if (typeof subId !== "string" || !subId)
    return { ok: false, code: "INVOICE_WITHOUT_SUBSCRIPTION" };
  const recordSub = input.recordSubscriptionId;
  if (typeof recordSub !== "string" || !recordSub)
    return { ok: false, code: "SUBSCRIPTION_NOT_LINKED" };
  if (recordSub !== subId) return { ok: false, code: "SUBSCRIPTION_MISMATCH" };
  if (!planFromPriceId(input.invoicePriceId, input.priceMap))
    return { ok: false, code: "PRICE_NOT_ALLOWLISTED" };
  return { ok: true, code: "OK" };
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

/** Segreti webhook accettati: più di uno solo durante una rotazione. */
export function parseWebhookSecrets(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,]+/)
        .map((v) => v.trim())
        .filter((v) => v.startsWith("whsec_")),
    ),
  );
}

/** Tutte le firme v1 presenti: durante la rotazione ne arrivano più di una. */
export function parseSignatureHeader(header: string): { timestamp: number; v1: string[] } {
  let timestamp = Number.NaN;
  const v1: string[] = [];
  for (const piece of header.split(",")) {
    const idx = piece.indexOf("=");
    if (idx <= 0) continue;
    const k = piece.slice(0, idx).trim();
    const v = piece.slice(idx + 1).trim();
    if (!v) continue;
    if (k === "t") timestamp = Number(v);
    else if (k === "v1") v1.push(v);
  }
  return { timestamp, v1 };
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verifica firma webhook (schema v1, HMAC SHA-256, tolleranza 5 minuti).
 * Accetta più segreti (rotazione) e più firme v1 nello stesso header:
 * basta una corrispondenza valida, il confronto resta a tempo costante.
 */
export async function verifyWebhookSignature(
  payload: string,
  header: string,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): Promise<{ ok: boolean; reason: string }> {
  const secrets = parseWebhookSecrets(secret);
  if (secrets.length === 0) return { ok: false, reason: "BAD_WEBHOOK_SECRET" };
  const { timestamp, v1 } = parseSignatureHeader(header);
  if (!Number.isFinite(timestamp) || v1.length === 0)
    return { ok: false, reason: "BAD_SIGNATURE_HEADER" };
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds)
    return { ok: false, reason: "SIGNATURE_TOO_OLD" };

  const message = `${timestamp}.${payload}`;
  let matched = false;
  for (const candidate of secrets) {
    const expected = await hmacHex(candidate, message);
    for (const provided of v1) if (timingSafeEqualHex(expected, provided)) matched = true;
  }
  return matched
    ? { ok: true, reason: "SIGNATURE_OK" }
    : { ok: false, reason: "SIGNATURE_MISMATCH" };
}

/** Mappa un abbonamento remoto sulle colonne dell'anagrafica locale. */
export type SubscriptionUpdate = {
  ok: boolean;
  code: string;
  patch: Record<string, unknown> | null;
};

/**
 * Nessun fallback: se il Price non è nella configurazione TEST completa,
 * l'evento non viene mappato (mai piano prova o zero posti per ripiego).
 */
export function subscriptionUpdateFromEvent(input: {
  status: unknown;
  currentPeriodEnd: unknown;
  cancelAtPeriodEnd: unknown;
  priceId: unknown;
  subscriptionId: unknown;
  customerId: unknown;
  priceMap: Record<string, string>;
}): SubscriptionUpdate {
  if (Object.keys(input.priceMap).length < PRICE_ENV_NAMES.length)
    return { ok: false, code: "PRICES_NOT_CONFIGURED", patch: null };
  const match = planFromPriceId(input.priceId, input.priceMap);
  if (!match) return { ok: false, code: "PRICE_NOT_ALLOWLISTED", patch: null };
  const seconds = typeof input.currentPeriodEnd === "number" ? input.currentPeriodEnd : 0;
  const patch = {
    status: normalizeStatus(input.status),
    provider: "stripe",
    billing_mode: "test",
    provider_subscription_id:
      typeof input.subscriptionId === "string" ? input.subscriptionId : null,
    provider_customer_id: typeof input.customerId === "string" ? input.customerId : null,
    stripe_price_id: typeof input.priceId === "string" ? input.priceId : null,
    plan_code: match.price.planCode,
    plan_seats: match.plan.limits.seats,
    cancel_at_period_end: input.cancelAtPeriodEnd === true,
    current_period_end: seconds > 0 ? new Date(seconds * 1000).toISOString() : null,
    trial_consumed: true,
  };
  return { ok: true, code: "OK", patch };
}

/**
 * Validazione della Subscription canonica recuperata dal provider.
 * Lo stato dell'abbonamento locale deriva SOLO da questo oggetto: nessun
 * evento (fattura compresa) può impostare direttamente attivo o insoluto.
 */
export function canonicalSubscriptionGuard(input: {
  subscription: Record<string, unknown> | null;
  expectedSubscriptionId: unknown;
  expectedCustomerId: unknown;
  linkedCustomerId: unknown;
  priceMap: Record<string, string>;
}): { ok: boolean; code: string } {
  const sub = input.subscription;
  if (!sub) return { ok: false, code: "SUBSCRIPTION_FETCH_FAILED" };
  // Nessuna tolleranza sulla modalità: solo oggetti esplicitamente di test.
  if (sub["livemode"] === true) return { ok: false, code: "LIVE_MODE_BLOCKED" };
  if (sub["livemode"] !== false) return { ok: false, code: "SUBSCRIPTION_MODE_UNKNOWN" };

  const id = typeof sub["id"] === "string" ? sub["id"] : "";
  if (!id) return { ok: false, code: "SUBSCRIPTION_WITHOUT_ID" };
  if (typeof input.expectedSubscriptionId === "string" && input.expectedSubscriptionId && input.expectedSubscriptionId !== id)
    return { ok: false, code: "SUBSCRIPTION_MISMATCH" };

  const customer = typeof sub["customer"] === "string" ? sub["customer"] : "";
  if (!customer) return { ok: false, code: "CUSTOMER_MISSING" };
  if (typeof input.expectedCustomerId === "string" && input.expectedCustomerId && input.expectedCustomerId !== customer)
    return { ok: false, code: "CUSTOMER_MISMATCH" };
  // Legame con l'utente/tenant: il customer già collegato non può cambiare.
  if (typeof input.linkedCustomerId === "string" && input.linkedCustomerId && input.linkedCustomerId !== customer)
    return { ok: false, code: "CUSTOMER_NOT_LINKED_TO_USER" };

  if (!planFromPriceId(canonicalPriceId(sub), input.priceMap))
    return { ok: false, code: "PRICE_NOT_ALLOWLISTED" };
  return { ok: true, code: "OK" };
}

/** Price della prima riga della Subscription canonica. */
export function canonicalPriceId(sub: Record<string, unknown>): string | null {
  const items = sub["items"];
  const data =
    items && typeof items === "object" && Array.isArray((items as Record<string, unknown>)["data"])
      ? ((items as Record<string, unknown>)["data"] as unknown[])
      : [];
  const first = data[0];
  const price =
    first && typeof first === "object" ? (first as Record<string, unknown>)["price"] : null;
  const id = price && typeof price === "object" ? (price as Record<string, unknown>)["id"] : null;
  return typeof id === "string" ? id : null;
}

/**
 * Ordine applicabile lato client del webhook (la decisione definitiva resta
 * nella RPC atomica): un evento più vecchio non scrive e, a parità di
 * istante, un abbonamento annullato non torna attivo.
 */
export function orderingDecision(input: {
  eventCreatedAt: string;
  lastAppliedAt: string | null;
  currentStatus: string | null;
  nextStatus: string;
}): { ok: boolean; code: string } {
  if (!input.lastAppliedAt) return { ok: true, code: "OK" };
  const prev = Date.parse(input.lastAppliedAt);
  const now = Date.parse(input.eventCreatedAt);
  if (!Number.isFinite(prev) || !Number.isFinite(now)) return { ok: true, code: "OK" };
  if (now < prev) return { ok: false, code: "EVENT_OUT_OF_ORDER" };
  if (now === prev && normalizeStatus(input.currentStatus) === "canceled" && input.nextStatus !== "canceled")
    return { ok: false, code: "CANCELED_NOT_REACTIVATED" };
  return { ok: true, code: "OK" };
}
