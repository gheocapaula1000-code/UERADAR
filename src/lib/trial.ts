/**
 * Prova gratuita UEradar: è applicativa, non una subscription del provider.
 * Nessun Checkout, nessun Customer, nessun metodo di pagamento all'avvio.
 * Scade da sola, senza conversione e senza addebito.
 */
export const TRIAL_DAYS = 7;

/** Testi obbligatori: hero, sezione prezzi, card piani e sticky bar mobile. */
export const TRIAL_COPY = {
  headline: "7 GIORNI COMPLETAMENTE GRATUITI",
  noCard: "SENZA CARTA DI CREDITO, NÉ DATI BANCARI E NÉ DISDETTA",
  noCharge: "Al termine non partirà alcun addebito. Sarai tu a decidere se abbonarti.",
  cta: "INIZIA I 7 GIORNI GRATIS",
  ctaNote: "Nessun metodo di pagamento né disdetta richiesti.",
} as const;

/**
 * Perimetro reale della prova, descritto senza riferimenti a un piano a
 * pagamento: sono i limiti effettivamente applicati lato server.
 */
export const TRIAL_SCOPE: readonly string[] = [
  "7 giorni gratuiti, senza carta di credito né dati bancari e senza dover dare disdetta",
  "1 impresa e 1 titolare",
  "Massimo 2 obiettivi di investimento",
  "1 dossier, in versione filigranata",
];

/** Una prova ogni 12 mesi per Partita IVA e per dominio aziendale. */
export const TRIAL_COOLDOWN_MONTHS = 12;

export function normalizeVatFingerprint(vat: unknown): string | null {
  if (typeof vat !== "string") return null;
  const clean = vat.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return clean.length >= 8 ? clean : null;
}

export function normalizeDomainFingerprint(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain || !domain.includes(".")) return null;
  const FREE = new Set([
    "gmail.com",
    "hotmail.com",
    "outlook.com",
    "libero.it",
    "yahoo.com",
    "yahoo.it",
    "icloud.com",
    "tiscali.it",
    "virgilio.it",
    "alice.it",
    "pec.it",
  ]);
  return FREE.has(domain) ? null : domain;
}

export type TrialFingerprint = { type: "vat" | "domain"; value: string };

export function trialFingerprints(input: {
  vat?: unknown;
  email?: unknown;
}): TrialFingerprint[] {
  const out: TrialFingerprint[] = [];
  const vat = normalizeVatFingerprint(input.vat);
  if (vat) out.push({ type: "vat", value: vat });
  const domain = normalizeDomainFingerprint(input.email);
  if (domain) out.push({ type: "domain", value: domain });
  return out;
}

/** Fail-closed: senza data valida la prova non si riapre. */
export function trialCooldownActive(lastStartedAt: unknown, nowIso: string): boolean {
  if (typeof lastStartedAt !== "string" || !lastStartedAt) return false;
  const last = Date.parse(lastStartedAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(last)) return true;
  if (!Number.isFinite(now)) return true;
  const months = (now - last) / (1000 * 60 * 60 * 24 * 30.44);
  return months < TRIAL_COOLDOWN_MONTHS;
}


export type StartTrialResult = { ok: boolean; code: string; trial_ends_at?: string };

/** Fail-closed: senza esito esplicito la prova non risulta mai avviata. */
export function mapStartTrialResult(data: unknown, error: unknown): StartTrialResult {
  if (error) return { ok: false, code: "TRIAL_START_FAILED" };
  if (!data || typeof data !== "object" || Array.isArray(data))
    return { ok: false, code: "TRIAL_START_FAILED" };
  const row = data as Record<string, unknown>;
  const code = typeof row["code"] === "string" ? (row["code"] as string) : "TRIAL_START_FAILED";
  if (row["ok"] !== true) return { ok: false, code };
  const ends = row["trial_ends_at"];
  return typeof ends === "string" ? { ok: true, code, trial_ends_at: ends } : { ok: true, code };
}

/** Messaggi utente per gli esiti dell'avvio prova. */
export const TRIAL_START_MESSAGES: Record<string, string> = {
  TRIAL_STARTED: "Prova gratuita di 7 giorni attivata. Nessuna carta, nessun addebito, nessuna disdetta.",
  TRIAL_ALREADY_ACTIVE: "La tua prova gratuita è già in corso.",
  VAT_REQUIRED: "Inserisci una Partita IVA valida per attivare la prova gratuita.",
  TRIAL_COOLDOWN_ACTIVE:
    "È già stata usata una prova gratuita per questa Partita IVA o per questo dominio negli ultimi 12 mesi.",
  TRIAL_ALREADY_USED: "La prova gratuita è già stata utilizzata.",
  SUBSCRIPTION_PRESENT: "Esiste già un abbonamento collegato a questo account.",
  MEMBER_USES_TENANT_PLAN: "Il tuo accesso segue il piano dell'impresa a cui appartieni.",
  TRIAL_START_FAILED: "Attivazione non riuscita. Riprova tra poco.",
};

export function trialStartMessage(code: string): string {
  return TRIAL_START_MESSAGES[code] ?? TRIAL_START_MESSAGES["TRIAL_START_FAILED"]!;
}
