import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  canAddMember,
  canStartNewSubscription,
  idempotencyKey,
  isMemberRole,
  isValidPriceId,
  MEMBER_ROLES,
  PLANS,
  planFromInput,
  resolveEntitlement,
  type Entitlement,
  type SubscriptionSnapshot,
} from "./billing";

export type BillingStatus = {
  ok: boolean;
  code: string;
  role: "owner" | "member";
  tenant_owner_id: string;
  can_manage_billing: boolean;
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

    const { resolveTenantContext } = await import("./tenant.server");
    const tenant = await resolveTenantContext(context.supabase, context.userId);

    const { data: row } = await context.supabase
      .from("ueradar_subscriptions")
      .select(SUB_COLUMNS)
      .eq("user_id", tenant.tenant_owner_id)
      .maybeSingle();
    const snapshot = toSnapshot((row as SubRow | null) ?? null);

    const { count } = await context.supabase
      .from("ueradar_company_members")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", tenant.tenant_owner_id);

    return {
      ok: true,
      code: mode.ok ? "OK" : mode.code,
      role: tenant.role,
      tenant_owner_id: tenant.tenant_owner_id,
      can_manage_billing: tenant.can_manage_billing,
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
  const { data, error } = await admin
    .from("ueradar_subscriptions")
    .select("provider_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("CUSTOMER_LOOKUP_FAILED");
  const existing = (data as { provider_customer_id: string | null } | null)?.provider_customer_id;
  if (existing) return existing;

  const created = await providerCall(
    "customers",
    env.secretKey,
    {
      email: email ?? "",
      "metadata[supabase_user_id]": userId,
      "metadata[app]": "ueradar",
    },
    idempotencyKey("customer", userId),
  );
  const id = created.payload?.["id"];
  if (created.status !== 200 || typeof id !== "string") throw new Error("CUSTOMER_CREATE_FAILED");
  const { error: linkError } = await admin
    .from("ueradar_subscriptions")
    .update({ provider: "stripe", provider_customer_id: id, billing_mode: "test" })
    .eq("user_id", userId);
  if (linkError) throw new Error("CUSTOMER_LINK_FAILED");
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

    const { resolveTenantContext } = await import("./tenant.server");
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    if (!tenant.can_manage_billing) return { ok: false, code: "MEMBER_CANNOT_MANAGE_BILLING" };

    const plan = planFromInput(data.plan);
    if (!plan) return { ok: false, code: "INVALID_PLAN" };
    const priceId = env.priceMap[plan.id];
    if (!priceId || !isValidPriceId(priceId)) return { ok: false, code: "PRICE_NOT_CONFIGURED" };

    // Nessuna seconda sottoscrizione se ne esiste già una attiva o in prova presso il provider.
    const { data: current, error: currentError } = await context.supabase
      .from("ueradar_subscriptions")
      .select("status, provider_subscription_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (currentError) return { ok: false, code: "SUBSCRIPTION_LOOKUP_FAILED" };
    const guard = canStartNewSubscription(
      current as { status: string | null; provider_subscription_id: string | null } | null,
    );
    if (!guard.allowed) return { ok: false, code: guard.reason };

    const email = (context.claims as { email?: string } | undefined)?.email;
    const customerId = await ensureCustomer(context.userId, email);

    const session = await providerCall(
      "checkout/sessions",
      env.secretKey,
      {
        mode: "subscription",
        customer: customerId,
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        // Prezzi 299/599 IVA esclusa: l'imposta è calcolata dal provider.
        "automatic_tax[enabled]": "true",
        "customer_update[address]": "auto",
        "customer_update[name]": "auto",
        "tax_id_collection[enabled]": "true",
        billing_address_collection: "required",
        "subscription_data[metadata][supabase_user_id]": context.userId,
        "subscription_data[metadata][plan_id]": plan.id,
        "metadata[supabase_user_id]": context.userId,
        "metadata[plan_id]": plan.id,
        client_reference_id: context.userId,
        success_url: `${env.appUrl}/abbonamento?esito=ok`,
        cancel_url: `${env.appUrl}/abbonamento?esito=annullato`,
      },
      idempotencyKey("checkout", context.userId, plan.id, priceId),
    );
    const url = session.payload?.["url"];
    if (session.status !== 200 || typeof url !== "string")
      return { ok: false, code: "PAYMENT_SESSION_FAILED" };

    const { error: priceError } = await adminClient()
      .from("ueradar_subscriptions")
      .update({ stripe_price_id: priceId, plan_seats: PLANS[plan.id].seats })
      .eq("user_id", context.userId);
    if (priceError) return { ok: false, code: "SUBSCRIPTION_UPDATE_FAILED" };

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

    const { resolveTenantContext } = await import("./tenant.server");
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    if (!tenant.can_manage_billing) return { ok: false, code: "MEMBER_CANNOT_MANAGE_BILLING" };

    const email = (context.claims as { email?: string } | undefined)?.email;
    const customerId = await ensureCustomer(context.userId, email);
    // Finestra oraria: chiave deterministica ma senza riusare un link scaduto.
    const window = Math.floor(Date.now() / 3_600_000);
    const session = await providerCall(
      "billing_portal/sessions",
      env.secretKey,
      {
        customer: customerId,
        return_url: `${env.appUrl}/abbonamento`,
      },
      idempotencyKey("portal", context.userId, window),
    );
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
  first_name: string | null;
  last_name: string | null;
  declared_role: string | null;
  accepted_at: string | null;
};

export const listCompanyMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ members: CompanyMember[] }> => {
    const { resolveTenantContext } = await import("./tenant.server");
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const { data } = await context.supabase
      .from("ueradar_company_members")
      .select("id, email, role, status, created_at, first_name, last_name, declared_role, accepted_at")
      .eq("owner_user_id", tenant.tenant_owner_id)
      .order("created_at", { ascending: true });
    return { members: (data as CompanyMember[] | null) ?? [] };
  });

/**
 * Invito di un utente nominativo: nome, cognome, ruolo dichiarato, email nominativa
 * e attestazione del titolare. L'appartenenza all'impresa è dichiarata dal titolare;
 * non esiste alcuna verifica camerale automatica.
 */
export const inviteCompanyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        first_name: z.string().trim().min(2).max(80),
        last_name: z.string().trim().min(2).max(80),
        declared_role: z.enum(MEMBER_ROLES),
        email: z.string().trim().email().max(255),
        owner_attestation: z.literal(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; code: string }> => {
    if (!isMemberRole(data.declared_role)) return { ok: false, code: "INVALID_ROLE" };
    const { resolveTenantContext } = await import("./tenant.server");
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    // Solo il titolare gestisce i posti: un membro non può creare una seconda impresa.
    if (!tenant.can_manage_company) return { ok: false, code: "MEMBER_CANNOT_MANAGE_MEMBERS" };
    const { data: row, error: subError } = await context.supabase
      .from("ueradar_subscriptions")
      .select(SUB_COLUMNS)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (subError) return { ok: false, code: "SUBSCRIPTION_LOOKUP_FAILED" };
    const entitlement = resolveEntitlement(
      toSnapshot((row as SubRow | null) ?? null),
      new Date().toISOString(),
    );
    const { count, error: countError } = await context.supabase
      .from("ueradar_company_members")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", context.userId);
    if (countError) return { ok: false, code: "MEMBERS_LOOKUP_FAILED" };

    const decision = canAddMember(count ?? 0, entitlement);
    if (!decision.allowed) return { ok: false, code: decision.reason };

    const email = data.email.trim().toLowerCase();
    const ownerEmail = (context.claims as { email?: string } | undefined)?.email
      ?.trim()
      .toLowerCase();
    if (ownerEmail && ownerEmail === email) return { ok: false, code: "OWNER_ALREADY_COUNTED" };

    const { error } = await context.supabase.from("ueradar_company_members").insert({
      owner_user_id: context.userId,
      email,
      first_name: data.first_name.trim(),
      last_name: data.last_name.trim(),
      declared_role: data.declared_role,
      owner_attested_at: new Date().toISOString(),
      role: "member",
      status: "invited",
    });
    if (error) return { ok: false, code: "MEMBER_ALREADY_PRESENT" };
    return { ok: true, code: "OK" };
  });

/** Invito pendente destinato all'utente autenticato (match sull'email dell'account). */
export const getPendingInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ invite: { id: string; first_name: string | null; last_name: string | null; declared_role: string | null } | null }> => {
      const { data } = await context.supabase
        .from("ueradar_company_members")
        .select("id, first_name, last_name, declared_role")
        .eq("status", "invited")
        .is("member_user_id", null)
        .limit(1)
        .maybeSingle();
      return { invite: (data as never) ?? null };
    },
  );

/**
 * Accettazione dell'invito con il proprio account: l'utente resta legato
 * a un solo titolare e non può essere associato a un'altra impresa.
 */
export const acceptCompanyInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ member_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; code: string }> => {
    const { count, error: existingError } = await context.supabase
      .from("ueradar_company_members")
      .select("id", { count: "exact", head: true })
      .eq("member_user_id", context.userId);
    if (existingError) return { ok: false, code: "MEMBERSHIP_LOOKUP_FAILED" };
    if ((count ?? 0) > 0) return { ok: false, code: "ALREADY_MEMBER_OF_ANOTHER_COMPANY" };

    const { data: updated, error } = await context.supabase
      .from("ueradar_company_members")
      .update({
        member_user_id: context.userId,
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", data.member_id)
      .eq("status", "invited")
      .is("member_user_id", null)
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, code: "INVITE_ACCEPT_FAILED" };
    if (!updated) return { ok: false, code: "INVITE_NOT_AVAILABLE" };
    return { ok: true, code: "OK" };
  });

export const removeCompanyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ member_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; code: string }> => {
    const { resolveTenantContext } = await import("./tenant.server");
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    if (!tenant.can_manage_company) return { ok: false, code: "MEMBER_CANNOT_MANAGE_MEMBERS" };
    const { error } = await context.supabase
      .from("ueradar_company_members")
      .delete()
      .eq("owner_user_id", context.userId)
      .eq("id", data.member_id);
    return error ? { ok: false, code: "MEMBER_DELETE_FAILED" } : { ok: true, code: "OK" };
  });