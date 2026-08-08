/**
 * Accesso server-only al provider di pagamento (solo modalità TEST) e
 * all'anagrafica abbonamenti con privilegi di servizio.
 * Nessun segreto di questo modulo è mai esposto al browser.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  CATALOG,
  isLiveSecretKey,
  isTestSecretKey,
  isValidPriceId,
  priceKey,
} from "./billing";

export type ProviderResult = { status: number; payload: Record<string, unknown> | null };

export type BillingEnv = {
  secretKey: string;
  webhookSecret: string;
  /** ID configurazione Portal TEST (`bpc_...`), validato prima dell'uso. */
  portalConfiguration: string;
  /** Price ID per `plan:interval`, letti solo da env TEST dedicate. */
  priceMap: Record<string, string>;
  missingPriceEnvs: string[];
  appUrl: string;
};

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

export function readBillingEnv(): BillingEnv {
  const priceMap: Record<string, string> = {};
  const missingPriceEnvs: string[] = [];
  for (const plan of Object.values(CATALOG)) {
    for (const price of Object.values(plan.prices)) {
      const value = process.env[price.priceEnv]?.trim() ?? "";
      if (isValidPriceId(value)) priceMap[priceKey(plan.id, price.interval)] = value;
      else missingPriceEnvs.push(price.priceEnv);
    }
  }
  return {
    secretKey: process.env["STRIPE_SECRET_KEY"]?.trim() ?? "",
    webhookSecret: process.env["STRIPE_WEBHOOK_SECRET"]?.trim() ?? "",
    portalConfiguration: process.env["STRIPE_PORTAL_CONFIGURATION_TEST"]?.trim() ?? "",
    priceMap,
    missingPriceEnvs,
    appUrl: process.env["UERADAR_APP_URL"]?.trim() || "https://www.ueradar.com",
  };
}

/**
 * `configured` è vero solo con secret di test, tutti e sei i Price validi,
 * webhook di test e Portal di test presenti. Fino ad allora checkout e
 * fatturazione pubblica restano disabilitati.
 */
export function billingConfigured(env: BillingEnv): { ok: boolean; code: string } {
  if (!env.secretKey) return { ok: false, code: "BILLING_NOT_CONFIGURED" };
  if (isLiveSecretKey(env.secretKey)) return { ok: false, code: "LIVE_MODE_BLOCKED" };
  if (!isTestSecretKey(env.secretKey)) return { ok: false, code: "BILLING_KEY_INVALID" };
  if (env.missingPriceEnvs.length > 0) return { ok: false, code: "PRICES_NOT_CONFIGURED" };
  if (!env.webhookSecret.startsWith("whsec_")) return { ok: false, code: "WEBHOOK_NOT_CONFIGURED" };
  if (!isPortalConfigurationId(env.portalConfiguration))
    return { ok: false, code: "PORTAL_NOT_CONFIGURED" };
  return { ok: true, code: "OK" };
}

/** L'ID di configurazione del Portal deve essere un vero `bpc_`. */
export function isPortalConfigurationId(value: string): boolean {
  return /^bpc_[A-Za-z0-9_]+$/.test(value.trim());
}

/**
 * Verifica presso il provider che la configurazione Portal esista, sia di test
 * e sia attiva: una stringa qualsiasi non abilita il portale.
 */
export async function fetchPortalConfiguration(
  configurationId: string,
  secretKey: string,
): Promise<{ ok: boolean; code: string }> {
  if (!isPortalConfigurationId(configurationId))
    return { ok: false, code: "PORTAL_NOT_CONFIGURED" };
  const res = await providerCall(
    `billing_portal/configurations/${encodeURIComponent(configurationId)}`,
    secretKey,
  );
  if (res.status !== 200 || !res.payload) return { ok: false, code: "PORTAL_CONFIG_NOT_FOUND" };
  if (res.payload["livemode"] === true) return { ok: false, code: "LIVE_MODE_BLOCKED" };
  if (res.payload["livemode"] !== false) return { ok: false, code: "PORTAL_MODE_UNKNOWN" };
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

/** Fail-closed: nessuna chiave, o chiave non di test, nessuna operazione. */
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