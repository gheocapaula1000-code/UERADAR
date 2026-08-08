import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  canAddMember,
  CATALOG,
  canStartNewSubscription,
  idempotencyKey,
  isMemberRole,
  checkoutTarget,
  isValidPriceId,
  MEMBER_ROLES,
  priceKey,
  resolveEntitlement,
  validateRemotePrice,
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
    const { readBillingEnv, billingConfigured } = await import("./billing.server");
    const env = readBillingEnv();
    const mode = billingConfigured(env);

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

/**
 * Sessione di pagamento (solo TEST): allowlist piano+intervallo, Price
 * recuperato e validato dal provider prima di aprire il checkout.
 */
export const createPaymentSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        plan: z.enum(["professional", "business", "executive"]),
        interval: z.enum(["month", "year"]).default("month"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; url?: string; code: string }> => {
    const { readBillingEnv, billingConfigured, providerCall, adminClient, fetchRemotePrice } =
      await import("./billing.server");
    const env = readBillingEnv();
    const mode = billingConfigured(env);
    if (!mode.ok) return { ok: false, code: mode.code };

    const { resolveTenantContext } = await import("./tenant.server");
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    if (!tenant.can_manage_billing) return { ok: false, code: "MEMBER_CANNOT_MANAGE_BILLING" };

    const target = checkoutTarget(data.plan, data.interval);
    if (!target) return { ok: false, code: "INVALID_PLAN" };
    const priceId = env.priceMap[priceKey(data.plan, data.interval)] ?? "";
    if (!isValidPriceId(priceId)) return { ok: false, code: "PRICE_NOT_CONFIGURED" };

    // Il Price remoto deve corrispondere esattamente al catalogo ed essere di test.
    const remote = await fetchRemotePrice(priceId, env.secretKey);
    const priceCheck = validateRemotePrice(remote, target);
    if (!priceCheck.ok) return { ok: false, code: priceCheck.code };

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
        // Prezzi IVA esclusa: l'imposta è calcolata dal provider in modalità test.
        "automatic_tax[enabled]": "true",
        "customer_update[address]": "auto",
        "customer_update[name]": "auto",
        "tax_id_collection[enabled]": "true",
        billing_address_collection: "required",
        "subscription_data[metadata][supabase_user_id]": context.userId,
        "subscription_data[metadata][plan_id]": data.plan,
        "subscription_data[metadata][interval]": data.interval,
        "metadata[supabase_user_id]": context.userId,
        "metadata[plan_id]": data.plan,
        "metadata[interval]": data.interval,
        client_reference_id: context.userId,
        success_url: `${env.appUrl}/abbonamento?esito=ok`,
        cancel_url: `${env.appUrl}/abbonamento?esito=annullato`,
      },
      idempotencyKey("checkout", context.userId, data.plan, data.interval, priceId),
    );
    const url = session.payload?.["url"];
    if (session.status !== 200 || typeof url !== "string")
      return { ok: false, code: "PAYMENT_SESSION_FAILED" };

    const { error: priceError } = await adminClient()
      .from("ueradar_subscriptions")
      .update({ stripe_price_id: priceId, plan_seats: CATALOG[data.plan].limits.seats })
      .eq("user_id", context.userId);
    if (priceError) return { ok: false, code: "SUBSCRIPTION_UPDATE_FAILED" };

    return { ok: true, url, code: "OK" };
  });

/** Portale cliente: fatture, dati fiscali e disdetta online senza comunicazione scritta. */
export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; url?: string; code: string }> => {
    const { readBillingEnv, billingConfigured, providerCall } = await import("./billing.server");
    const env = readBillingEnv();
    const mode = billingConfigured(env);
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
 * e attestazione del titolare. Scrittura server-only con client di servizio dopo
 * autenticazione e verifica del ruolo di titolare: owner_user_id non è mai un input.
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
    if (!tenant.can_manage_company || tenant.tenant_owner_id !== context.userId)
      return { ok: false, code: "MEMBER_CANNOT_MANAGE_MEMBERS" };
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

    const { normalizeEmail, isUniqueViolation } = await import("./membership");
    const email = normalizeEmail(data.email);
    const ownerEmail = normalizeEmail((context.claims as { email?: string } | undefined)?.email);
    if (ownerEmail && ownerEmail === email) return { ok: false, code: "OWNER_ALREADY_COUNTED" };

    const { adminClient } = await import("./billing.server");
    const { error } = await adminClient()
      .from("ueradar_company_members")
      .insert({
        owner_user_id: context.userId,
        email,
        first_name: data.first_name.trim(),
        last_name: data.last_name.trim(),
        declared_role: data.declared_role,
        owner_attested_at: new Date().toISOString(),
        role: "member",
        status: "invited",
      });
    if (error)
      return {
        ok: false,
        code: isUniqueViolation(error) ? "MEMBER_ALREADY_PRESENT" : "MEMBER_INVITE_FAILED",
      };
    return { ok: true, code: "OK" };
  });

/** Invito pendente destinato all'utente autenticato (match sull'email del token). */
export const getPendingInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      invite: {
        id: string;
        first_name: string | null;
        last_name: string | null;
        declared_role: string | null;
      } | null;
    }> => {
      const { normalizeEmail } = await import("./membership");
      const email = normalizeEmail((context.claims as { email?: string } | undefined)?.email);
      if (!email) return { invite: null };
      const { adminClient } = await import("./billing.server");
      const { data } = await adminClient()
        .from("ueradar_company_members")
        .select("id, first_name, last_name, declared_role, email, owner_user_id")
        .eq("status", "invited")
        .is("member_user_id", null)
        .eq("email", email)
        .neq("owner_user_id", context.userId)
        .limit(1)
        .maybeSingle();
      if (!data) return { invite: null };
      const row = data as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        declared_role: string | null;
      };
      return {
        invite: {
          id: row.id,
          first_name: row.first_name,
          last_name: row.last_name,
          declared_role: row.declared_role,
        },
      };
    },
  );

/**
 * Accettazione dell'invito: server-only, eseguita in un'unica transazione dalla
 * RPC service-only ueradar_accept_invite. Nella stessa transazione vengono
 * verificati i vincoli (email del token, invito pendente, nessuna seconda
 * impresa, nessun abbonamento personale presso il provider) e neutralizzato il
 * trial locale: se la neutralizzazione fallisce, l'accettazione viene annullata.
 * Nessun errore DB viene ignorato.
 */
export const acceptCompanyInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ member_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; code: string }> => {
    const { normalizeEmail, mapAcceptRpcResult, ACCEPT_RPC } = await import("./membership");
    const email = normalizeEmail((context.claims as { email?: string } | undefined)?.email);
    if (!email) return { ok: false, code: "EMAIL_NOT_VERIFIABLE" };

    const { adminClient } = await import("./billing.server");
    const admin = adminClient();

    const { data: rpcResult, error } = await (
      admin as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { code?: string | null } | null }>;
      }
    ).rpc(ACCEPT_RPC, {
      _member_id: data.member_id,
      _user_id: context.userId,
      _email: email,
    });

    return mapAcceptRpcResult(
      (rpcResult as { ok?: boolean; code?: string; trial_neutralized?: boolean } | null) ?? null,
      error,
    );
  });

/** Rimozione di un posto: server-only, consentita solo al titolare del tenant. */
export const removeCompanyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ member_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: boolean; code: string }> => {
    const { resolveTenantContext } = await import("./tenant.server");
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    if (!tenant.can_manage_company || tenant.tenant_owner_id !== context.userId)
      return { ok: false, code: "MEMBER_CANNOT_MANAGE_MEMBERS" };
    const { adminClient } = await import("./billing.server");
    const { error } = await adminClient()
      .from("ueradar_company_members")
      .delete()
      .eq("owner_user_id", context.userId)
      .eq("id", data.member_id);
    return error ? { ok: false, code: "MEMBER_DELETE_FAILED" } : { ok: true, code: "OK" };
  });
