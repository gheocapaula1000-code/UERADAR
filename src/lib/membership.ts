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
export function trialNeutralization(
  sub: MemberSubscription | null,
): { neutralize: false; reason: string } | { neutralize: true; patch: Record<string, unknown> } {
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
