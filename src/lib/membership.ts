/**
 * Regole pure per l'appartenenza all'impresa (posti Team) UEradar.
 * Nessun client può scrivere direttamente sulla tabella dei membri:
 * queste regole sono applicate esclusivamente lato server.
 */

/** Email normalizzata: confronto case-insensitive e senza spazi. */
export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Campi consentiti in accettazione: owner, email, nomi e ruolo restano immutabili. */
export const ACCEPT_MUTABLE_FIELDS = ["member_user_id", "status", "accepted_at"] as const;

export type AcceptUpdate = {
  member_user_id: string;
  status: "accepted";
  accepted_at: string;
};

export function buildAcceptUpdate(userId: string, now: string): AcceptUpdate {
  if (!userId) throw new Error("ACCEPT_INVALID_USER");
  return { member_user_id: userId, status: "accepted", accepted_at: now };
}

export type InviteRow = {
  id: string;
  owner_user_id: string;
  email: string;
  status: string | null;
  member_user_id: string | null;
};

export type AcceptDecision = { ok: true } | { ok: false; code: string };

/**
 * Fail-closed: l'invito è accettabile solo se è ancora pendente, non ha già
 * un utente collegato, l'email coincide con quella del token e l'utente non
 * è il titolare stesso.
 */
export function canAcceptInvite(
  row: InviteRow | null,
  userId: string,
  jwtEmail: string | null | undefined,
): AcceptDecision {
  if (!row) return { ok: false, code: "INVITE_NOT_AVAILABLE" };
  if (row.status !== "invited" || row.member_user_id !== null)
    return { ok: false, code: "INVITE_NOT_AVAILABLE" };
  const email = normalizeEmail(jwtEmail);
  if (!email) return { ok: false, code: "EMAIL_NOT_VERIFIABLE" };
  if (normalizeEmail(row.email) !== email) return { ok: false, code: "INVITE_EMAIL_MISMATCH" };
  if (row.owner_user_id === userId) return { ok: false, code: "OWNER_CANNOT_JOIN_SELF" };
  return { ok: true };
}

/** Violazione di unicità (utente già membro): esito deterministico ALREADY_MEMBER. */
export function isUniqueViolation(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === "23505";
}

export type MemberSubscription = {
  status: string | null;
  provider_subscription_id: string | null;
  trial_consumed?: boolean | null;
};

/**
 * Alla transizione ad "accepted" il trial personale del nuovo membro va
 * neutralizzato in modo tracciato: non deve diventare una seconda impresa.
 * Si tocca solo un trial senza abbonamento presso il provider.
 */
export type TrialNeutralizationPatch = {
  status: string;
  trial_consumed: boolean;
  trial_ends_at: string;
};

export function trialNeutralization(
  sub: MemberSubscription | null,
): { neutralize: false; reason: string } | { neutralize: true; patch: TrialNeutralizationPatch } {
  if (!sub) return { neutralize: false, reason: "NO_SUBSCRIPTION" };
  if (sub.provider_subscription_id) return { neutralize: false, reason: "PROVIDER_SUBSCRIPTION" };
  if (sub.status !== "trialing") return { neutralize: false, reason: "NOT_TRIALING" };
  return {
    neutralize: true,
    patch: {
      status: "superseded_by_tenant",
      trial_consumed: true,
      trial_ends_at: new Date().toISOString(),
    },
  };
}

/**
 * Fail-closed: un abbonamento personale presso il provider (o comunque con
 * subscription id) non può restare attivo mentre l'utente entra come membro,
 * perché il portale di gestione viene disattivato per i membri. In quel caso
 * l'accettazione è rifiutata e l'utente deve prima gestirlo o disdirlo.
 */
export const PERSONAL_SUBSCRIPTION_BLOCK_CODE = "PERSONAL_SUBSCRIPTION_MUST_BE_MANAGED";

export function personalSubscriptionBlocksAccept(
  sub: (MemberSubscription & { provider?: string | null }) | null,
): boolean {
  if (!sub) return false;
  if (sub.provider_subscription_id) return true;
  const providerStatuses = ["active", "trialing", "past_due", "unpaid"];
  return Boolean(sub.provider) && providerStatuses.includes(sub.status ?? "");
}

/** Esiti della RPC atomica di accettazione (service-only). */
export const ACCEPT_RPC = "ueradar_accept_invite";

export type AcceptRpcResult = { ok?: boolean; code?: string; trial_neutralized?: boolean } | null;

/** Nessun errore DB ignorato: qualsiasi anomalia diventa un codice fail-closed. */
export function mapAcceptRpcResult(
  result: AcceptRpcResult,
  error: { code?: string | null } | null | undefined,
): { ok: boolean; code: string } {
  if (error) {
    if (isUniqueViolation(error)) return { ok: false, code: "ALREADY_MEMBER" };
    return { ok: false, code: "INVITE_ACCEPT_FAILED" };
  }
  if (!result || typeof result.ok !== "boolean" || !result.code)
    return { ok: false, code: "INVITE_ACCEPT_FAILED" };
  return { ok: result.ok, code: result.code };
}

/** RPC atomica di invito (service-only): conteggio posti e insert in transazione. */
export const INVITE_RPC = "ueradar_invite_member";

export type InviteRpcResult = {
  ok?: boolean;
  code?: string;
  invite_id?: string;
  invite_token?: string;
} | null;

/** Solo inviti vivi e accettati occupano un posto; i revocati no. */
export function inviteOccupiesSeat(status: string | null | undefined): boolean {
  return status === "invited" || status === "accepted";
}

/** Dopo rimozione (revoca) la stessa email può essere invitata di nuovo. */
export function canReinviteAfterRemoval(status: string | null | undefined): boolean {
  return status === "revoked";
}

export function mapInviteRpcResult(
  result: InviteRpcResult,
  error: { code?: string | null } | null | undefined,
): { ok: boolean; code: string } {
  if (error) {
    if (isUniqueViolation(error)) return { ok: false, code: "ALREADY_INVITED" };
    return { ok: false, code: "INVITE_FAILED" };
  }
  if (!result || typeof result.ok !== "boolean" || !result.code)
    return { ok: false, code: "INVITE_FAILED" };
  if (result.code === "MEMBER_ALREADY_PRESENT") return { ok: false, code: "ALREADY_INVITED" };
  return { ok: result.ok, code: result.code };
}
