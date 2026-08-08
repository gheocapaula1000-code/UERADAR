/**
 * Accesso server-only al provider di pagamento (solo modalità TEST) e
 * all'anagrafica abbonamenti con privilegi di servizio.
 * Nessun segreto di questo modulo è mai esposto al browser.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isTestSecretKey, type PlanId } from "./billing";

export type ProviderResult = { status: number; payload: Record<string, unknown> | null };

export function readBillingEnv() {
  const secretKey = process.env["STRIPE_SECRET_KEY"]?.trim() ?? "";
  return {
    secretKey,
    webhookSecret: process.env["STRIPE_WEBHOOK_SECRET"]?.trim() ?? "",
    priceMap: {
      business: process.env["STRIPE_PRICE_BUSINESS"]?.trim() ?? "",
      team: process.env["STRIPE_PRICE_TEAM"]?.trim() ?? "",
    } as Record<PlanId, string>,
    appUrl: process.env["UERADAR_APP_URL"]?.trim() || "https://www.ueradar.com",
  };
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