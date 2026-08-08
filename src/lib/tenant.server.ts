import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTenantContext, type MembershipRow, type TenantContext } from "./tenant";

/**
 * Risolve il tenant lato server con il client user-scoped (RLS attiva:
 * un utente vede solo le proprie membership).
 */
export async function resolveTenantContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<TenantContext> {
  const { data, error } = await supabase
    .from("ueradar_company_members")
    .select("owner_user_id, status, accepted_at, created_at")
    .eq("member_user_id", userId)
    .eq("status", "accepted");
  if (error) throw new Error("TENANT_RESOLUTION_FAILED");
  return buildTenantContext(userId, (data as MembershipRow[] | null) ?? []);
}
