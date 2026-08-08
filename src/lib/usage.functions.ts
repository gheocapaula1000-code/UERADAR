import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PlanLimits } from "./billing";

export type UsageSummary = {
  ok: boolean;
  code: string;
  period: string;
  limits: PlanLimits;
  deep_verifications_used: number;
  dossiers_used: number;
  watermarked: boolean;
};

/** Riepilogo consumi del mese corrente per l'impresa dell'utente. */
export const getUsageSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsageSummary> => {
    const { entitlementForTenant, readUsage } = await import("./usage.server");
    const { resolveTenantContext } = await import("./tenant.server");
    const { periodKey } = await import("./usage");
    const now = new Date().toISOString();
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const entitlement = await entitlementForTenant(
      context.supabase,
      tenant.tenant_owner_id,
      now,
    );
    const usage = await readUsage(tenant.tenant_owner_id, now);
    return {
      ok: entitlement.entitled,
      code: entitlement.reason,
      period: periodKey(now),
      limits: entitlement.limits,
      deep_verifications_used: Number(usage?.["deep_verifications"] ?? 0),
      dossiers_used: Number(usage?.["dossiers"] ?? 0),
      watermarked: entitlement.limits.watermarkedDossier,
    };
  });

/** Consuma una verifica approfondita: bloccante lato server. */
export const consumeDeepVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ opportunity_id: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ context }) => {
    const { entitlementForTenant, consumeQuota } = await import("./usage.server");
    const { resolveTenantContext } = await import("./tenant.server");
    const now = new Date().toISOString();
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const entitlement = await entitlementForTenant(context.supabase, tenant.tenant_owner_id, now);
    if (!entitlement.entitled) return { allowed: false, code: entitlement.reason, used: 0 };
    return consumeQuota(
      tenant.tenant_owner_id,
      "deep_verifications",
      entitlement.limits.deepVerificationsPerMonth,
      now,
    );
  });

/**
 * Consuma un dossier del mese. Il dossier prepara e precompila per revisione:
 * non invia nulla agli enti e non sostituisce il professionista.
 */
export const consumeDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ opportunity_id: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ context }) => {
    const { entitlementForTenant, consumeQuota } = await import("./usage.server");
    const { resolveTenantContext } = await import("./tenant.server");
    const now = new Date().toISOString();
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const entitlement = await entitlementForTenant(context.supabase, tenant.tenant_owner_id, now);
    if (!entitlement.entitled)
      return { allowed: false, code: entitlement.reason, used: 0, watermarked: true };
    if (!entitlement.limits.exportsEnabled)
      return { allowed: false, code: "EXPORT_NOT_INCLUDED", used: 0, watermarked: true };
    const result = await consumeQuota(
      tenant.tenant_owner_id,
      "dossiers",
      entitlement.limits.dossiersPerMonth,
      now,
    );
    return { ...result, watermarked: entitlement.limits.watermarkedDossier };
  });
