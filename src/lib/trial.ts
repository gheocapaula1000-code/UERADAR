/**
 * Prova gratuita UEradar: è applicativa, non una subscription del provider.
 * Nessun Checkout, nessun Customer, nessun metodo di pagamento all'avvio.
 * Scade da sola, senza conversione e senza addebito.
 */
export const TRIAL_DAYS = 7;

/** Testi obbligatori: hero, sezione prezzi, card piani e sticky bar mobile. */
export const TRIAL_COPY = {
  headline: "7 GIORNI COMPLETAMENTE GRATUITI",
  noCard: "NESSUNA CARTA DI CREDITO · NESSUN DATO BANCARIO",
  noCharge: "Al termine non partirà alcun addebito. Sarai tu a decidere se abbonarti.",
  cta: "INIZIA I 7 GIORNI GRATIS",
  ctaNote: "Non ti chiederemo alcun metodo di pagamento.",
} as const;

/** Cosa offre temporaneamente la prova: livello Business, capienza minima. */
export const TRIAL_SCOPE: readonly string[] = [
  "Livello Business per 7 giorni",
  "1 impresa e 1 utente",
  "2 obiettivi",
  "5 verifiche approfondite",
  "1 anteprima dossier filigranata",
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
