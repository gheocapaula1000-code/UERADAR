/**
 * Accesso server-only al provider di pagamento con isolamento TEST/LIVE e
 * all'anagrafica abbonamenti con privilegi di servizio.
 * Nessun segreto di questo modulo è mai esposto al browser.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SELF_SERVICE_PLANS } from "./catalog";
import {
  CATALOG,
  expectedLivemode,
  isLiveSecretKey,
  isTestSecretKey,
  isValidPriceId,
  priceKey,
  type BillingMode,
} from "./billing";

export type ProviderResult = { status: number; payload: Record<string, unknown> | null };

export type BillingEnv = {
  mode: BillingMode | null;
  expectedLivemode: boolean | null;
  liveEnabled: boolean;
  publicCheckoutEnabled: boolean;
  secretKey: string;
  webhookSecret: string;
  /** ID configurazione Portal (`bpc_...`), validato prima dell'uso. */
  portalConfiguration: string;
  /** Price ID per `plan:interval` (self-service + eventuali opzionali caricati). */
  priceMap: Record<string, string>;
  missingPriceEnvs: string[];
  appUrl: string;
};

function enabled(name: string): boolean {
  return (process.env[name] ?? "").trim().toLowerCase() === "true";
}

export function parseBillingMode(value: unknown): BillingMode | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "test" || normalized === "live" ? normalized : null;
}

export function priceEnvForMode(testEnv: string, mode: BillingMode): string {
  return mode === "test" ? testEnv : testEnv.replace(/_TEST$/, "_LIVE");
}

/**
 * Il checkout TEST non è aperto al pubblico solo perché i segreti Sandbox
 * esistono: serve un flag QA esplicito e una allowlist di indirizzi.
 */
export type CheckoutQaGate = { enabled: boolean; allowlist: string[] };

export function readCheckoutQa(): CheckoutQaGate {
  return {
    // Default chiuso: qualunque valore diverso da "true" disabilita il checkout.
    enabled: (process.env["UERADAR_CHECKOUT_QA_ENABLED"] ?? "").trim().toLowerCase() === "true",
    allowlist: (process.env["UERADAR_CHECKOUT_QA_EMAILS"] ?? "")
      .split(/[\s,;]+/)
      .map((v) => v.trim().toLowerCase())
      .filter((v) => v.includes("@")),
  };
}

export function checkoutQaAllowed(
  gate: CheckoutQaGate,
  email: unknown,
): { ok: boolean; code: string } {
  if (!gate.enabled) return { ok: false, code: "CHECKOUT_QA_DISABLED" };
  if (gate.allowlist.length === 0) return { ok: false, code: "CHECKOUT_QA_ALLOWLIST_EMPTY" };
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized || !gate.allowlist.includes(normalized))
    return { ok: false, code: "CHECKOUT_QA_NOT_ALLOWED" };
  return { ok: true, code: "OK" };
}

export function checkoutAccessAllowed(
  env: Pick<BillingEnv, "mode" | "liveEnabled" | "publicCheckoutEnabled">,
  email: unknown,
): { ok: boolean; code: string } {
  // In TEST nessun oggetto reale viene creato: basta la configurazione valida
  // (già verificata da `billingConfigured`) e un utente autenticato owner.
  if (env.mode === "test") return { ok: true, code: "OK" };
  if (env.mode !== "live") return { ok: false, code: "BILLING_MODE_INVALID" };
  if (!env.liveEnabled) return { ok: false, code: "LIVE_MODE_DISABLED" };
  if (!env.publicCheckoutEnabled)
    return { ok: false, code: "PUBLIC_CHECKOUT_DISABLED" };
  return { ok: true, code: "OK" };
}

/**
 * Il Portal non crea nulla presso il provider: serve solo a chi ha già un
 * Customer collegato. Resta fail-closed su modalità e flag LIVE, ma non
 * dipende da `UERADAR_CHECKOUT_PUBLIC_ENABLED`, che governa esclusivamente
 * l'apertura del checkout pubblico (creazione di nuovi oggetti Stripe).
 */
export function portalAccessAllowed(
  env: Pick<BillingEnv, "mode" | "liveEnabled">,
  email: unknown,
): { ok: boolean; code: string } {
  if (env.mode === "test") return checkoutQaAllowed(readCheckoutQa(), email);
  if (env.mode !== "live") return { ok: false, code: "BILLING_MODE_INVALID" };
  if (!env.liveEnabled) return { ok: false, code: "LIVE_MODE_DISABLED" };
  return { ok: true, code: "OK" };
}

export function readBillingEnv(): BillingEnv {
  const declared = parseBillingMode(process.env["UERADAR_BILLING_MODE"]);
  const candidates = [
    process.env["STRIPE_SECRET_KEY_LIVE"]?.trim() ?? "",
    process.env["STRIPE_SECRET_KEY_TEST"]?.trim() ?? "",
    process.env["STRIPE_SECRET_KEY"]?.trim() ?? "",
  ].filter((v) => v.length > 0);
  const firstLive = candidates.find(isLiveSecretKey) ?? "";
  const firstTest = candidates.find(isTestSecretKey) ?? "";
  // La chiave effettivamente disponibile determina il modo: evita il
  // mismatch quando l'env dichiara un modo per cui non esiste la chiave.
  const secretKey =
    declared === "live"
      ? firstLive || firstTest
      : declared === "test"
        ? firstTest || firstLive
        : firstLive || firstTest;
  const mode: BillingMode | null = isLiveSecretKey(secretKey)
    ? "live"
    : isTestSecretKey(secretKey)
      ? "test"
      : declared;
  const priceMap: Record<string, string> = {};
  const missingPriceEnvs: string[] = [];
  if (mode) {
    for (const plan of Object.values(CATALOG)) {
      for (const price of Object.values(plan.prices)) {
        const envName = priceEnvForMode(price.priceEnv, mode);
        const value = process.env[envName]?.trim() ?? "";
        if (isValidPriceId(value)) {
          priceMap[priceKey(plan.id, price.interval)] = value;
        } else if (plan.selfService) {
          // Solo i piani self-service (Istruttoria) bloccano il checkout se manca il Price.
          // Radar ritirato dal listino, Studio/Executive: price env opzionali.
          missingPriceEnvs.push(envName);
        }
      }
    }
  }
  const suffix = mode === "live" ? "LIVE" : mode === "test" ? "TEST" : "INVALID";
  const notFalse = (name: string): boolean =>
    (process.env[name] ?? "").trim().toLowerCase() !== "false";
  return {
    mode,
    expectedLivemode: mode ? expectedLivemode(mode) : null,
    liveEnabled:
      mode === "live" ? notFalse("UERADAR_BILLING_LIVE_ENABLED") : enabled("UERADAR_BILLING_LIVE_ENABLED"),
    publicCheckoutEnabled:
      mode === "live"
        ? notFalse("UERADAR_CHECKOUT_PUBLIC_ENABLED")
        : enabled("UERADAR_CHECKOUT_PUBLIC_ENABLED"),
    secretKey,
    webhookSecret:
      process.env[`STRIPE_WEBHOOK_SECRET_${suffix}`]?.trim() ||
      process.env["STRIPE_WEBHOOK_SECRET"]?.trim() ||
      "",
    portalConfiguration:
      process.env[`STRIPE_PORTAL_CONFIGURATION_${suffix}`]?.trim() ?? "",
    priceMap,
    missingPriceEnvs,
    appUrl: process.env["UERADAR_APP_URL"]?.trim() || "https://www.ueradar.com",
  };
}

/**
 * `configured` è vero con modalità valida, secret coerente col modo e i Price
 * self-service (Istruttoria) validi. Webhook e Portal NON sono richiesti
 * qui: servono solo dove vengono davvero usati.
 */
export function billingConfigured(env: BillingEnv): { ok: boolean; code: string } {
  if (!env.mode || env.expectedLivemode === null)
    return { ok: false, code: "BILLING_MODE_INVALID" };
  if (env.mode === "live" && !env.liveEnabled)
    return { ok: false, code: "LIVE_MODE_DISABLED" };
  if (!env.secretKey) return { ok: false, code: "BILLING_NOT_CONFIGURED" };
  if (env.mode === "test" && !isTestSecretKey(env.secretKey))
    return { ok: false, code: "BILLING_KEY_MODE_MISMATCH" };
  if (env.mode === "live" && !isLiveSecretKey(env.secretKey))
    return { ok: false, code: "BILLING_KEY_MODE_MISMATCH" };
  if (env.missingPriceEnvs.length > 0)
    return { ok: false, code: "PRICES_NOT_CONFIGURED" };
  // Almeno un Price per ogni piano self-service (mese o anno caricati in map).
  for (const planId of SELF_SERVICE_PLANS) {
    const plan = CATALOG[planId];
    for (const interval of Object.keys(plan.prices) as Array<keyof typeof plan.prices>) {
      if (!plan.prices[interval]) continue;
      if (!env.priceMap[priceKey(planId, interval)])
        return { ok: false, code: "PRICES_NOT_CONFIGURED" };
    }
  }
  const configuredPriceIds = Object.values(env.priceMap);
  if (new Set(configuredPriceIds).size !== configuredPriceIds.length)
    return { ok: false, code: "PRICE_IDS_NOT_UNIQUE" };
  return { ok: true, code: "OK" };
}

/** Richiesto solo dall'handler webhook. */
export function webhookConfigured(env: BillingEnv): { ok: boolean; code: string } {
  return env.webhookSecret.startsWith("whsec_")
    ? { ok: true, code: "OK" }
    : { ok: false, code: "WEBHOOK_NOT_CONFIGURED" };
}

/** Richiesto solo da `createPortalSession`. */
export function portalConfigured(env: BillingEnv): { ok: boolean; code: string } {
  return isPortalConfigurationId(env.portalConfiguration)
    ? { ok: true, code: "OK" }
    : { ok: false, code: "PORTAL_NOT_CONFIGURED" };
}

/** L'ID di configurazione del Portal deve essere un vero `bpc_`. */
export function isPortalConfigurationId(value: string): boolean {
  return /^bpc_[A-Za-z0-9_]+$/.test(value.trim());
}

/**
 * Verifica presso il provider che la configurazione Portal esista, sia del
 * modo atteso e sia attiva: una stringa qualsiasi non abilita il portale.
 */
export async function fetchPortalConfiguration(
  configurationId: string,
  secretKey: string,
  expectedMode = false,
): Promise<{ ok: boolean; code: string }> {
  if (!isPortalConfigurationId(configurationId))
    return { ok: false, code: "PORTAL_NOT_CONFIGURED" };
  const res = await providerCall(
    `billing_portal/configurations/${encodeURIComponent(configurationId)}`,
    secretKey,
  );
  if (res.status !== 200 || !res.payload) return { ok: false, code: "PORTAL_CONFIG_NOT_FOUND" };
  if (res.payload["livemode"] !== true && res.payload["livemode"] !== false)
    return { ok: false, code: "PORTAL_MODE_UNKNOWN" };
  if (res.payload["livemode"] !== expectedMode)
    return { ok: false, code: expectedMode ? "TEST_MODE_BLOCKED" : "LIVE_MODE_BLOCKED" };
  if (res.payload["active"] !== true) return { ok: false, code: "PORTAL_CONFIG_INACTIVE" };
  return { ok: true, code: "OK" };
}

/** Recupera il Price dal provider per validarlo prima del checkout. */
export async function fetchRemotePrice(
  priceId: string,
  secretKey: string,
): Promise<Record<string, unknown> | null> {
  const res = await providerCall(`prices/${encodeURIComponent(priceId)}`, secretKey);
  return res.status === 200 ? res.payload : null;
}

/** Fail-closed: la chiave deve corrispondere esattamente al modo selezionato. */
export function assertBillingMode(
  env: BillingEnv,
): { ok: true } | { ok: false; code: string } {
  const configured = billingConfigured(env);
  return configured.ok ? { ok: true } : { ok: false, code: configured.code };
}

/** Compatibilità dei test storici; nessun uso nel percorso runtime. */
export function assertTestMode(secretKey: string): { ok: true } | { ok: false; code: string } {
  if (!secretKey) return { ok: false, code: "BILLING_NOT_CONFIGURED" };
  if (!isTestSecretKey(secretKey)) return { ok: false, code: "LIVE_MODE_BLOCKED" };
  return { ok: true };
}

export async function providerCall(
  path: string,
  secretKey: string,
  data?: Record<string, string>,
  idempotencyKey?: string,
): Promise<ProviderResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "Stripe-Version": "2024-06-20",
  };
  // Le creazioni sono idempotenti: retry o doppio invio non duplicano risorse.
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: data ? "POST" : "GET",
    headers,
    body: data ? new URLSearchParams(data) : undefined,
  });
  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, payload };
}

export function adminClient() {
  return createClient<Database>(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
