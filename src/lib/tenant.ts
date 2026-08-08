/**
 * Risoluzione autoritativa del tenant (impresa) UEradar.
 * Regola unica: il titolare appartiene alla propria impresa; il membro accettato
 * appartiene esclusivamente all'impresa del titolare che lo ha invitato.
 * Nessun utente può appartenere a più di una impresa.
 */
export type MembershipRow = {
  owner_user_id: string;
  status: string | null;
  accepted_at?: string | null;
  created_at?: string | null;
};

export type TenantRole = "owner" | "member";

export type TenantContext = {
  user_id: string;
  tenant_owner_id: string;
  role: TenantRole;
  /** Solo il titolare può modificare impresa, P.IVA, piano e fatturazione. */
  can_manage_company: boolean;
  can_manage_billing: boolean;
};

function timeKey(row: MembershipRow): number {
  const raw = row.accepted_at ?? row.created_at ?? null;
  const t = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

/** Un solo tenant: la membership accettata più antica vince, altrimenti self. */
export function resolveTenantOwnerId(userId: string, memberships: MembershipRow[] | null): string {
  if (!userId) throw new Error("TENANT_RESOLUTION_FAILED");
  const accepted = (memberships ?? []).filter(
    (m) => m.status === "accepted" && typeof m.owner_user_id === "string" && m.owner_user_id,
  );
  if (accepted.length === 0) return userId;
  const [first] = [...accepted].sort((a, b) => timeKey(a) - timeKey(b));
  return first!.owner_user_id;
}

export function buildTenantContext(
  userId: string,
  memberships: MembershipRow[] | null,
): TenantContext {
  const tenant = resolveTenantOwnerId(userId, memberships);
  const role: TenantRole = tenant === userId ? "owner" : "member";
  return {
    user_id: userId,
    tenant_owner_id: tenant,
    role,
    can_manage_company: role === "owner",
    can_manage_billing: role === "owner",
  };
}

/** Fail-closed: qualunque riga non appartenente al tenant risolto è rifiutata. */
export function assertTenantScope(tenant: TenantContext, rowUserId: string | null | undefined) {
  if (!rowUserId || rowUserId !== tenant.tenant_owner_id) throw new Error("TENANT_SCOPE_VIOLATION");
}
