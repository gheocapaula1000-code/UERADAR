import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PlanLimits } from "./billing";

export type UsageSummary = {
  ok: boolean;
  code: string;
  period: string;
  limits: PlanLimits;
  dossiers_used: number;
  watermarked: boolean;
};

/** Riepilogo consumi del periodo corrente per l'impresa dell'utente. */
export const getUsageSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsageSummary> => {
    const { tenantUsageContext, readUsage } = await import("./usage.server");
    const { resolveTenantContext } = await import("./tenant.server");
    const now = new Date().toISOString();
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const { entitlement, period } = await tenantUsageContext(
      context.supabase,
      tenant.tenant_owner_id,
      now,
    );
    const usage = await readUsage(tenant.tenant_owner_id, now, period);
    return {
      ok: entitlement.entitled,
      code: entitlement.reason,
      period,
      limits: entitlement.limits,
      dossiers_used: Number(usage?.["dossiers"] ?? 0),
      watermarked: entitlement.limits.watermarkedDossier,
    };
  });

export type DossierClaim = {
  allowed: boolean;
  code: string;
  used: number;
  watermarked: boolean;
};

/**
 * Rivendica un dossier per una specifica opportunità.
 * Il claim è idempotente nel periodo: riaprire lo stesso dossier non consuma
 * una seconda volta. Il dossier prepara e precompila per revisione: non invia
 * nulla agli enti e non sostituisce il professionista.
 */
export const consumeDossier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ opportunity_id: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<DossierClaim> => {
    const { tenantUsageContext, consumeQuotaOnce } = await import("./usage.server");
    const { resolveTenantContext } = await import("./tenant.server");
    const now = new Date().toISOString();
    const tenant = await resolveTenantContext(context.supabase, context.userId);
    const { entitlement, period } = await tenantUsageContext(
      context.supabase,
      tenant.tenant_owner_id,
      now,
    );
    if (!entitlement.entitled)
      return { allowed: false, code: entitlement.reason, used: 0, watermarked: true };
    if (!entitlement.limits.exportsEnabled)
      return { allowed: false, code: "EXPORT_NOT_INCLUDED", used: 0, watermarked: true };
    const result = await consumeQuotaOnce({
      tenantId: tenant.tenant_owner_id,
      kind: "dossiers",
      opportunityId: data.opportunity_id,
      limit: entitlement.limits.dossiersPerMonth,
      period,
    });
    return {
      allowed: result.allowed,
      code: result.code,
      used: result.used,
      watermarked: entitlement.limits.watermarkedDossier,
    };
  });
