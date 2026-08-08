import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  INVITE_RPC,
  mapInviteRpcResult,
  type InviteRpcResult,
} from "./membership";
import {
  CATALOG,
  billingIdempotencyKey,
  canStartNewSubscription,
  isMemberRole,
  checkoutTarget,
  checkoutResumeGate,
  checkoutSessionGate,
  customerCreationGate,
  portalSessionGate,
  isValidPriceId,
  MEMBER_ROLES,
  priceKey,
  resolveEntitlement,
  validateRemotePrice,
  type Entitlement,
  type BillingMode,
  type SubscriptionSnapshot,
  CHECKOUT_TTL_SECONDS,
  checkoutSessionExpiresAt,
} from "./billing";

export type BillingStatus = {
  ok: boolean;
  code: string;
  role: "owner" | "member";
  tenant_owner_id: string;
  can_manage_billing: boolean;
  mode: BillingMode | "disabled";
  entitlement: Entitlement;
  subscription: SubscriptionSnapshot | null;
  members_count: number;
  latest_invoice_url: string | null;
  tax_id: string | null;
  configured: boolean;
  /** Checkout TEST realmente disponibile per questo utente (flag QA + allowlist). */
  checkout_available: boolean;
  /**
   * Portale disponibile solo se esiste già un cliente presso il provider:
   * durante la prova non viene creata alcuna anagrafica di pagamento.
   */
  portal_available: boolean;
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

/** Il portale è utile solo con un'anagrafica cliente già esistente. */
export function portalAvailable(
  row: { provider_customer_id: string | null } | null,
  configured: boolean,
  canManageBilling: boolean,
): boolean {
  const customer = row?.provider_customer_id?.trim() ?? "";
  return configured && canManageBilling && customer.startsWith("cus_");
}

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
    const { readBillingEnv, billingConfigured, checkoutAccessAllowed } = await import(
      "./billing.server"
    );
    const env = readBillingEnv();
    const mode = billingConfigured(env);
    const access = checkoutAccessAllowed(
      env,
      (context.claims as { email?: string } | undefined)?.email,
    );

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
      mode: env.mode ?? "disabled",
      entitlement: resolveEntitlement(snapshot, new Date().toISOString()),
      subscription: snapshot,
      members_count: count ?? 0,
      latest_invoice_url: (row as SubRow | null)?.latest_invoice_url ?? null,
      tax_id: (row as SubRow | null)?.tax_id ?? null,
      configured: mode.ok,
      checkout_available: mode.ok && access.ok,
      portal_available: portalAvailable(
        (row as SubRow | null) ?? null,
        mode.ok && access.ok,
        tenant.can_manage_billing,
      ),
    };
  });

async function ensureCustomer(userId: string, email: string | undefined) {
  const { readBillingEnv, providerCall, adminClient } = await import("./billing.server");
  const env = readBillingEnv();
  const admin = adminClient();
  const { data, error } = await admin
    .from("ueradar_subscriptions")
    .select("provider_customer_id, provider_subscription_id, billing_mode")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("CUSTOMER_LOOKUP_FAILED");
  const row = data as {
    provider_customer_id: string | null;
    provider_subscription_id: string | null;
    billing_mode: string | null;
  } | null;
  const existing = row?.provider_customer_id;
  if (existing) {
    if (row?.billing_mode !== env.mode) throw new Error("BILLING_MODE_CONFLICT");
    return existing;
  }
  if (row?.provider_subscription_id) throw new Error("SUBSCRIPTION_BINDING_CONFLICT");
  if (!env.mode || env.expectedLivemode === null) throw new Error("BILLING_MODE_INVALID");

  let created: Awaited<ReturnType<typeof providerCall>>;
  try {
    created = await providerCall(
      "customers",
      env.secretKey,
      {
        email: email ?? "",
        "metadata[supabase_user_id]": userId,
        "metadata[app]": "ueradar",
      },
      billingIdempotencyKey(env.mode, "customer", userId),
    );
  } catch {
    throw new Error("CUSTOMER_CREATE_FAILED");
  }
  // Post-write fail-closed: nessuna scrittura DB prima del controllo di modo.
  const customerGate = customerCreationGate(created, env.expectedLivemode);
  if (!customerGate.ok) throw new Error(customerGate.code);
  const id = created.payload?.["id"] as string;
  const { error: linkError } = await admin
    .from("ueradar_subscriptions")
    .update({ provider: "stripe", provider_customer_id: id, billing_mode: env.mode })
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
    const {
      readBillingEnv,
      billingConfigured,
      providerCall,
      adminClient,
      fetchRemotePrice,
      checkoutAccessAllowed,
    } = await import("./billing.server");
    const env = readBillingEnv();
    const mode = billingConfigured(env);
    if (!mode.ok) return { ok: false, code: mode.code };

    // La presenza dei segreti Sandbox non apre il checkout: serve il flag QA
    // esplicito e l'indirizzo dell'utente nella allowlist.
    const email = (context.claims as { email?: string } | undefined)?.email;
    const access = checkoutAccessAllowed(env, email);
    if (!access.ok) return { ok: false, code: access.code };

    const { resolveTenantContext } = await import("./tenant.server");
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    if (!tenant.can_manage_billing) return { ok: false, code: "MEMBER_CANNOT_MANAGE_BILLING" };

    const target = checkoutTarget(data.plan, data.interval);
    if (!target) return { ok: false, code: "INVALID_PLAN" };
    const priceId = env.priceMap[priceKey(data.plan, data.interval)] ?? "";
    if (!isValidPriceId(priceId)) return { ok: false, code: "PRICE_NOT_CONFIGURED" };

    // Il Price remoto deve corrispondere esattamente al catalogo ed essere di test.
    const remote = await fetchRemotePrice(priceId, env.secretKey);
    if (!env.mode || env.expectedLivemode === null)
      return { ok: false, code: "BILLING_MODE_INVALID" };
    const priceCheck = validateRemotePrice(remote, target, env.expectedLivemode);
    if (!priceCheck.ok) return { ok: false, code: priceCheck.code };

    // Nessuna seconda sottoscrizione se ne esiste già una attiva o in prova presso il provider.
    const { data: current, error: currentError } = await context.supabase
      .from("ueradar_subscriptions")
      .select("status, provider_customer_id, provider_subscription_id, billing_mode")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (currentError) return { ok: false, code: "SUBSCRIPTION_LOOKUP_FAILED" };
    const binding = current as {
      status: string | null;
      provider_customer_id: string | null;
      provider_subscription_id: string | null;
      billing_mode: string | null;
    } | null;
    if (
      (binding?.provider_customer_id || binding?.provider_subscription_id) &&
      binding.billing_mode !== env.mode
    )
      return { ok: false, code: "BILLING_MODE_CONFLICT" };
    const guard = canStartNewSubscription(
      binding,
    );
    if (!guard.allowed) return { ok: false, code: guard.reason };

    let customerId: string;
    try {
      customerId = await ensureCustomer(context.userId, email);
    } catch (err) {
      return { ok: false, code: (err as Error).message || "CUSTOMER_CREATE_FAILED" };
    }

    // Prenotazione checkout (QA-only): un solo checkout per volta per utente,
    // con TTL, così il primo collegamento nasce coerente con il Price scelto.
    const { data: intent, error: intentError } = await adminClient().rpc(
      "ueradar_claim_checkout_intent",
      {
        _user_id: context.userId,
        _price_id: priceId,
        _plan_code: target.planCode,
        _ttl_seconds: CHECKOUT_TTL_SECONDS,
      },
    );
    if (intentError) return { ok: false, code: "CHECKOUT_INTENT_UNAVAILABLE" };
    const claimed = (intent ?? {}) as {
      ok?: boolean;
      code?: string;
      session_id?: string | null;
      price_id?: string | null;
    };
    if (!claimed.ok) {
      // Ripresa idempotente: una prenotazione viva con sessione gia'
      // registrata riusa quella sessione. Mai crearne una seconda.
      if (claimed.code === "CHECKOUT_ALREADY_IN_PROGRESS" && claimed.session_id) {
        let existing: Awaited<ReturnType<typeof providerCall>> | null = null;
        try {
          existing = await providerCall(
            `checkout/sessions/${encodeURIComponent(claimed.session_id)}`,
            env.secretKey,
          );
        } catch {
          existing = null;
        }
        const resume = checkoutResumeGate(
          existing,
          claimed.session_id,
          env.expectedLivemode,
        );
        if (resume.ok)
          return {
            ok: true,
            url: existing?.payload?.["url"] as string,
            code: "CHECKOUT_RESUMED",
          };
        // Fail-closed: con una prenotazione ancora viva non si crea in
        // silenzio una seconda sessione; si riporta il motivo esatto.
        return { ok: false, code: resume.code };
      }
      return { ok: false, code: claimed.code ?? "CHECKOUT_ALREADY_IN_PROGRESS" };
    }

    /** Rilascio sicuro se la sessione non nasce: la prenotazione non resta appesa. */
    async function releaseIntent() {
      // Un rilascio fallito non deve mascherare l'errore originario: resta
      // fail-closed e il chiamante riporta comunque il proprio codice.
      try {
        await adminClient().rpc("ueradar_release_checkout_intent", {
          _user_id: context.userId,
          _price_id: priceId,
        });
      } catch {
        /* intento lasciato in scadenza naturale */
      }
    }

    let session: Awaited<ReturnType<typeof providerCall>>;
    try {
      session = await providerCall(
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
        // Finestra della sessione allineata al TTL della prenotazione.
        expires_at: String(checkoutSessionExpiresAt(Date.now())),
        "metadata[supabase_user_id]": context.userId,
        "metadata[plan_id]": data.plan,
        "metadata[interval]": data.interval,
        client_reference_id: context.userId,
        success_url: `${env.appUrl}/abbonamento?esito=ok`,
        cancel_url: `${env.appUrl}/abbonamento?esito=annullato`,
      },
      billingIdempotencyKey(
        env.mode,
        "checkout",
        context.userId,
        data.plan,
        data.interval,
        priceId,
      ),
      );
    } catch {
      // Errore di rete/eccezione: prenotazione rilasciata e fail-closed.
      await releaseIntent();
      return { ok: false, code: "PAYMENT_SESSION_FAILED" };
    }
    // Post-write fail-closed: nessun URL restituito o sessione attaccata
    // finché il provider non dichiara esplicitamente livemode false.
    const sessionGate = checkoutSessionGate(session, env.expectedLivemode);
    if (!sessionGate.ok) {
      await releaseIntent();
      return { ok: false, code: sessionGate.code };
    }

    // Sessione registrata sulla prenotazione: senza conferma esplicita non si
    // restituisce alcun URL e non si crea una seconda sessione. L'intento resta
    // in vita per una ripresa idempotente o la scadenza naturale.
    const { data: attached, error: attachError } = await adminClient().rpc(
      "ueradar_attach_checkout_session",
      {
        _user_id: context.userId,
        _price_id: priceId,
        _session_id: session.payload?.["id"] as string,
      },
    );
    if (attachError) return { ok: false, code: "CHECKOUT_SESSION_ATTACH_FAILED" };
    const attachResult = (attached ?? {}) as { ok?: boolean; code?: string };
    if (!attachResult.ok)
      return { ok: false, code: attachResult.code ?? "CHECKOUT_SESSION_ATTACH_FAILED" };

    const { error: priceError } = await adminClient()
      .from("ueradar_subscriptions")
      .update({
        stripe_price_id: priceId,
        plan_seats: CATALOG[data.plan].limits.seats,
        billing_mode: env.mode,
      })
      .eq("user_id", context.userId);
    if (priceError) return { ok: false, code: "SUBSCRIPTION_UPDATE_FAILED" };

    return { ok: true, url: session.payload?.["url"] as string, code: "OK" };
  });

/** Portale cliente: fatture, dati fiscali e disdetta online senza comunicazione scritta. */
export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; url?: string; code: string }> => {
    const {
      readBillingEnv,
      billingConfigured,
      providerCall,
      fetchPortalConfiguration,
      checkoutAccessAllowed,
    } = await import("./billing.server");
    const env = readBillingEnv();
    const mode = billingConfigured(env);
    if (!mode.ok) return { ok: false, code: mode.code };

    // Stesso gate QA del checkout: in TEST il portale non è aperto al pubblico.
    const email = (context.claims as { email?: string } | undefined)?.email;
    const access = checkoutAccessAllowed(env, email);
    if (!access.ok) return { ok: false, code: access.code };
    if (!env.mode || env.expectedLivemode === null)
      return { ok: false, code: "BILLING_MODE_INVALID" };

    // La configurazione Portal viene verificata presso il provider, non assunta.
    const portal = await fetchPortalConfiguration(
      env.portalConfiguration,
      env.secretKey,
      env.expectedLivemode,
    );
    if (!portal.ok) return { ok: false, code: portal.code };

    const { resolveTenantContext } = await import("./tenant.server");
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    if (!tenant.can_manage_billing) return { ok: false, code: "MEMBER_CANNOT_MANAGE_BILLING" };

    // Nessuna creazione di anagrafica cliente qui: il portale serve solo a chi
    // ha già un rapporto di pagamento attivo presso il provider.
    const { data: subRow, error: subError } = await context.supabase
      .from("ueradar_subscriptions")
      .select("provider_customer_id, billing_mode")
      .eq("user_id", tenant.tenant_owner_id)
      .maybeSingle();
    if (subError) return { ok: false, code: "SUBSCRIPTION_LOOKUP_FAILED" };
    const portalRow = subRow as {
      provider_customer_id: string | null;
      billing_mode: string | null;
    } | null;
    if (portalRow?.billing_mode !== env.mode)
      return { ok: false, code: "BILLING_MODE_CONFLICT" };
    const customerId = portalRow?.provider_customer_id?.trim() ?? "";
    if (!customerId.startsWith("cus_")) return { ok: false, code: "PORTAL_NOT_AVAILABLE" };

    // Finestra oraria: chiave deterministica ma senza riusare un link scaduto.
    const window = Math.floor(Date.now() / 3_600_000);
    let session: Awaited<ReturnType<typeof providerCall>>;
    try {
      session = await providerCall(
        "billing_portal/sessions",
        env.secretKey,
        {
          customer: customerId,
          configuration: env.portalConfiguration,
          return_url: `${env.appUrl}/abbonamento`,
        },
        billingIdempotencyKey(env.mode, "portal", context.userId, window),
      );
    } catch {
      return { ok: false, code: "PORTAL_FAILED" };
    }
    // Post-write fail-closed: nessun link restituito senza livemode false.
    const portalGate = portalSessionGate(session, env.expectedLivemode);
    if (!portalGate.ok) return { ok: false, code: portalGate.code };
    return { ok: true, url: session.payload?.["url"] as string, code: "OK" };
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
    const { normalizeEmail } = await import("./membership");
    const email = normalizeEmail(data.email);
    const ownerEmail = normalizeEmail((context.claims as { email?: string } | undefined)?.email);
    if (ownerEmail && ownerEmail === email) return { ok: false, code: "OWNER_ALREADY_COUNTED" };
    if (!entitlement.entitled) return { ok: false, code: "NOT_ENTITLED" };

    // Conteggio e inserimento nella stessa transazione: due inviti simultanei
    // non possono superare la capienza, titolare incluso.
    const { adminClient } = await import("./billing.server");
    const rpc = adminClient() as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { code?: string | null } | null }>;
    };
    const { data: result, error } = await rpc.rpc(INVITE_RPC, {
      _owner: context.userId,
      _email: email,
      _first_name: data.first_name.trim(),
      _last_name: data.last_name.trim(),
      _declared_role: data.declared_role,
      _seats: entitlement.seats,
    });
    return mapInviteRpcResult(result as InviteRpcResult, error);
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
