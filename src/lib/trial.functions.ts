import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapStartTrialResult, type StartTrialResult } from "./trial";

/**
 * Avvio della prova gratuita: nessuna carta, nessun Customer, nessuna
 * subscription presso il provider. L'attivazione avviene solo dopo un profilo
 * con Partita IVA valida ed è decisa da una singola transazione server-only
 * che verifica i fingerprint P.IVA e dominio (una prova ogni 12 mesi).
 */
export const startTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StartTrialResult> => {
    const { normalizeVatFingerprint, normalizeDomainFingerprint } = await import("./trial");
    const { resolveTenantContext } = await import("./tenant.server");
    const { adminClient } = await import("./billing.server");

    const tenant = await resolveTenantContext(context.supabase, context.userId);
    // Un membro lavora sul piano dell'impresa: non apre una prova personale.
    if (!tenant.can_manage_billing) return { ok: false, code: "MEMBER_USES_TENANT_PLAN" };

    const admin = adminClient();
    const { data: profile, error: profileError } = await admin
      .from("company_profiles")
      .select("partita_iva")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (profileError) return { ok: false, code: "PROFILE_UNAVAILABLE" };

    const vat = normalizeVatFingerprint((profile as { partita_iva?: unknown } | null)?.partita_iva);
    if (!vat) return { ok: false, code: "VAT_REQUIRED" };

    // Il dominio è derivato lato server dall'email autenticata, mai dal client.
    const email = (context.claims as { email?: string } | undefined)?.email;
    const domain = normalizeDomainFingerprint(email);

    const rpc = admin as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    };
    const { data, error } = await rpc.rpc("ueradar_start_trial", {
      _user_id: context.userId,
      _vat: vat,
      _domain: domain,
    });
    return mapStartTrialResult(data, error);
  });
