/**
 * Testi e regole del profilo guidato. Vive fuori dal componente per restare
 * verificabile: la UI non duplica etichette né condizioni di completamento.
 */
import type { CompanyProfile } from "./bandocore-types";

/** Spiegazioni brevi in linguaggio comune per i campi tecnici. */
export const FIELD_HELP = {
  partita_iva: "11 cifre, come sulla fattura. Puoi scriverla con o senza IT davanti.",
  codice_ateco:
    "È il codice della tua attività: lo trovi sulla visura camerale o nel cassetto fiscale.",
  ateco_secondari:
    "Molte imprese hanno più codici in visura. Aggiungili per migliorare il matching.",
  forma_giuridica: "Come è costituita l'impresa. Se hai dubbi, guarda la visura camerale.",
  regione: "Serve per i bandi della tua Regione: sono spesso i più accessibili.",
  provincia: "Sigla di 2 lettere, es. MI per Milano.",
  codice_istat:
    "Facoltativo. Serve solo per trovare i bandi del tuo Comune. Se non lo conosci, lascia vuoto.",
  numero_dipendenti: "Persone assunte oggi. Se lavori da solo, scrivi 0.",
  fatturato_annuo: "Ricavi dell'ultimo anno chiuso. Un valore approssimativo va bene.",
  anno_costituzione: "Anno di apertura dell'impresa.",
  investimenti_previsti: "Su cosa vuoi investire: usiamo questo per ordinare i bandi utili.",
  spesa_prevista: "Quanto pensi di spendere nel progetto. Facoltativo.",
  de_minimis: "Contributi pubblici già ricevuti negli ultimi 3 anni. Se nessuno, lascia vuoto.",
  impresa_in_difficolta:
    "Situazione di perdite rilevanti o procedure in corso: molti bandi la escludono.",
} as const;

export type OnboardingStepKey = "identita" | "sede" | "obiettivi";

/**
 * Avvio rapido: i soli dati indispensabili per ricevere Bandi compatibili.
 * Tutto il resto è rimandabile e non blocca l'accesso al feed.
 */
export const FAST_START_FIELDS: (keyof CompanyProfile)[] = [
  "forma_giuridica",
  "codice_ateco",
  "regione",
];

export const FAST_START_MESSAGE =
  "Bastano questi tre dati per iniziare a ricevere i Bandi compatibili. Potrai completare gli altri in seguito.";

export const ONBOARDING_STEPS: {
  key: OnboardingStepKey;
  title: string;
  hint: string;
}[] = [
  { key: "identita", title: "Chi sei", hint: "Forma giuridica e Codice ATECO principale." },
  { key: "sede", title: "Dove sei", hint: "Basta la Regione: il resto è facoltativo." },
];

/** Campi davvero necessari per attivare la prova: tutto il resto è facoltativo. */
export const REQUIRED_BY_STEP: Record<OnboardingStepKey, (keyof CompanyProfile)[]> = {
  identita: ["ragione_sociale", "partita_iva", "forma_giuridica", "codice_ateco"],
  sede: ["regione"],
  obiettivi: [],
};

function filled(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return value != null;
}

/** Elenco dei campi mancanti di un passo: vuoto = passo completo. */
export function missingFields(
  profile: CompanyProfile,
  step: OnboardingStepKey,
): (keyof CompanyProfile)[] {
  return REQUIRED_BY_STEP[step].filter((key) => !filled(profile[key]));
}

export function stepComplete(profile: CompanyProfile, step: OnboardingStepKey): boolean {
  return missingFields(profile, step).length === 0;
}

export const STEP_INCOMPLETE_MESSAGE = "Completa i campi contrassegnati prima di continuare.";

/** Numero massimo di codici ATECO secondari accettati nel profilo. */
export const ATECO_SECONDARI_MAX = 5;

export const ATECO_SECONDARI_LABEL = "Codici ATECO secondari (facoltativi)";

/**
 * Normalizza la lista dei secondari: trim, niente vuoti, niente duplicati
 * tra loro né rispetto al principale, massimo ATECO_SECONDARI_MAX.
 */
export function normalizeAtecoSecondari(list: readonly string[], principale: string): string[] {
  const main = principale.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const value = raw.trim();
    if (!value || value === main || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length === ATECO_SECONDARI_MAX) break;
  }
  return out;
}
