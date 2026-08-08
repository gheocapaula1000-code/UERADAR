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
  portalConfigured: boolean;
  /** Price ID per `plan:interval`, letti solo da env TEST dedicate. */
  priceMap: Record<string, string>;
  missingPriceEnvs: string[];
  appUrl: string;
};

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
    portalConfigured: (process.env["STRIPE_PORTAL_CONFIGURATION_TEST"]?.trim() ?? "").length > 0,
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
  if (!env.portalConfigured) return { ok: false, code: "PORTAL_NOT_CONFIGURED" };
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