import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TenantContext } from "./tenant";

/** Contesto impresa dell'utente autenticato: titolare o membro accettato. */
export const getTenantContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TenantContext> => {
    const { resolveTenantContext } = await import("./tenant.server");
    return resolveTenantContext(context.supabase, context.userId);
  });
