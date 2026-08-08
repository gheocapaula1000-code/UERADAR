import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  canAddMember,
  isValidPriceId,
  PLANS,
  planFromInput,
  resolveEntitlement,
  type Entitlement,
  type SubscriptionSnapshot,
} from "./billing";

export type BillingStatus = {
  ok: boolean;
  code: string;
  mode: "test";
  entitlement: Entitlement;
  subscription: SubscriptionSnapshot | null;
  members_count: number;
  latest_invoice_url: string | null;
  tax_id: string | null;
  configured: boolean;
};

const SUB_COLUMNS =
  "user_id, status, plan_code, plan_seats, trial_ends_at, current_period_end, cancel_at_period_end, provider_customer_id, provider_subscription_id, stripe_price_id, latest_invoice_url, tax_id, billing_mode";

type SubRow = {
  status: string | null;
  plan_code: string | null;
  plan_seats: number | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  provider_customer_id: string | null;
  latest_invoice_url: string | null;
  tax_id: string | null;
};

function toSnapshot(row: SubRow | null): SubscriptionSnapshot | null {
  if (!row) return null;
  return {
    status: row.status ?? "",
    trial_ends_at: row.trial_ends_at,
    current_period_end: row.current_period_end,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    plan_code: row.plan_code,
    plan_seats: Number(row.plan_seats ?? 0),
  };
}

/** Stato abbonamento dell'utente autenticato: fail-closed su qualunque errore. */
export const getBillingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BillingStatus> => {
    const { readBillingEnv, assertTestMode } = await import("./billing.server");
    const env = readBillingEnv();
    const mode = assertTestMode(env.secretKey);

    const { data: row } = await context.supabase
      .from("ueradar_subscriptions")
      .select(SUB_COLUMNS)
      .eq("user_id", context.userId)
      .maybeSingle();
    const snapshot = toSnapshot((row as SubRow | null) ?? null);

    const { count } = await context.supabase
      .from("ueradar_company_members")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", context.userId);

    return {
      ok: true,
      code: mode.ok ? "OK" : mode.code,
      mode: "test",
      entitlement: resolveEntitlement(snapshot, new Date().toISOString()),
      subscription: snapshot,
      members_count: count ?? 0,
      latest_invoice_url: (row as SubRow | null)?.latest_invoice_url ?? null,
      tax_id: (row as SubRow | null)?.tax_id ?? null,
      configured: mode.ok,
    };
  });

async function ensureCustomer(userId: string, email: string | undefined) {
  const { readBillingEnv, providerCall, adminClient } = await import("./billing.server");
  const env = readBillingEnv();
  const admin = adminClient();
  const { data } = await admin
    .from("ueradar_subscriptions")
    .select("provider_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  const existing = (data as { provider_customer_id: string | null } | null)?.provider_customer_id;
  if (existing) return existing;

  const created = await providerCall("customers", env.secretKey, {
    email: email ?? "",
    "metadata[supabase_user_id]": userId,
    "metadata[app]": "ueradar",
  });
  const id = created.payload?.["id"];
  if (created.status !== 200 || typeof id !== "string") throw new Error("CUSTOMER_CREATE_FAILED");
  await admin
    .from("ueradar_subscriptions")
    .update({ provider: "stripe", provider_customer_id: id, billing_mode: "test" })
    .eq("user_id", userId);
  return id;
}

/** Sessione di pagamento ricorrente mensile (solo test): mai chiavi lato browser. */
export const createPaymentSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ plan: z.enum(["business", "team"]) }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; url?: string; code: string }> => {
    const { readBillingEnv, assertTestMode, providerCall, adminClient } = await import(
      "./billing.server"
    );
    const env = readBillingEnv();
    const mode = assertTestMode(env.secretKey);
    if (!mode.ok) return { ok: false, code: mode.code };

    const plan = planFromInput(data.plan);
    if (!plan) return { ok: false, code: "INVALID_PLAN" };
    const priceId = env.priceMap[plan.id];
    if (!priceId || !isValidPriceId(priceId)) return { ok: false, code: "PRICE_NOT_CONFIGURED" };

    const email = (context.claims as { email?: string } | undefined)?.email;
    const customerId = await ensureCustomer(context.userId, email);

    const session = await providerCall("checkout/sessions", env.secretKey, {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      // Prezzi 299/599 IVA esclusa: l'imposta è calcolata dal provider.
      "automatic_tax[enabled]": "true",
      "customer_update[address]": "auto",
      "customer_update[name]": "auto",
      tax_id_collection: "true",
      billing_address_collection: "required",
      "subscription_data[metadata][supabase_user_id]": context.userId,
      "subscription_data[metadata][plan_id]": plan.id,
      "metadata[supabase_user_id]": context.userId,
      "metadata[plan_id]": plan.id,
      client_reference_id: context.userId,
      success_url: `${env.appUrl}/abbonamento?esito=ok`,
      cancel_url: `${env.appUrl}/abbonamento?esito=annullato`,
    });
    const url = session.payload?.["url"];
    if (session.status !== 200 || typeof url !== "string")
      return { ok: false, code: "PAYMENT_SESSION_FAILED" };

    await adminClient()
      .from("ueradar_subscriptions")
      .update({ stripe_price_id: priceId, plan_seats: PLANS[plan.id].seats })
      .eq("user_id", context.userId);

    return { ok: true, url, code: "OK" };
  });

/** Portale cliente: fatture, dati fiscali e disdetta online senza comunicazione scritta. */
export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; url?: string; code: string }> => {
    const { readBillingEnv, assertTestMode, providerCall } = await import("./billing.server");
    const env = readBillingEnv();
    const mode = assertTestMode(env.secretKey);
    if (!mode.ok) return { ok: false, code: mode.code };

    const email = (context.claims as { email?: string } | undefined)?.email;
    const customerId = await ensureCustomer(context.userId, email);
    const session = await providerCall("billing_portal/sessions", env.secretKey, {
      customer: customerId,
      return_url: `${env.appUrl}/abbonamento`,
    });
    const url = session.payload?.["url"];
    if (session.status !== 200 || typeof url !== "string")
      return { ok: false, code: "PORTAL_FAILED" };
    return { ok: true, url, code: "OK" };
  });

export type CompanyMember = {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

export const listCompanyMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ members: CompanyMember[] }> => {
    const { data } = await context.supabase
      .from("ueradar_company_members")
      .select("id, email, role, status, created_at")
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: true });
    return { members: (data as CompanyMember[] | null) ?? [] };
  });

/** Aggiunta utente nominativo: limitata dai posti reali del piano attivo. */
export const inviteCompanyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ email: z.string().email() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; code: string }> => {
    const { data: row } = await context.supabase
      .from("ueradar_subscriptions")
      .select(SUB_COLUMNS)
      .eq("user_id", context.userId)
      .maybeSingle();
    const entitlement = resolveEntitlement(
      toSnapshot((row as SubRow | null) ?? null),
      new Date().toISOString(),
    );
    const { count } = await context.supabase
      .from("ueradar_company_members")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", context.userId);

    const decision = canAddMember(count ?? 0, entitlement);
    if (!decision.allowed) return { ok: false, code: decision.reason };

    const { error } = await context.supabase.from("ueradar_company_members").insert({
      owner_user_id: context.userId,
      email: data.email.trim().toLowerCase(),
      role: "member",
      status: "invited",
    });
    if (error) return { ok: false, code: "MEMBER_ALREADY_PRESENT" };
    return { ok: true, code: "OK" };
  });

export const removeCompanyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ member_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; code: string }> => {
    const { error } = await context.supabase
      .from("ueradar_company_members")
      .delete()
      .eq("owner_user_id", context.userId)
      .eq("id", data.member_id);
    return error ? { ok: false, code: "MEMBER_DELETE_FAILED" } : { ok: true, code: "OK" };
  });