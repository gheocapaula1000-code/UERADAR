/**
 * Stato del consenso cookie di UEradar.com.
 *
 * Riferimenti normativi applicati (link in pagina, nessuna citazione estesa):
 * - Garante privacy, Linee guida cookie del 10/06/2021, docweb 9677876
 * - Regolamento (UE) 2016/679, artt. 12-13
 *
 * Regole implementate in logica pura e testabile:
 * - prima di una scelta esplicita solo le categorie necessarie sono attive;
 * - chiusura con X o Escape = rifiuto degli opzionali, mai consenso;
 * - scelta versionata con timestamp, riproposta solo se cambia la versione;
 * - oggi non esiste alcun vendor opzionale: i toggle registrano la volonta'
 *   dell'utente ma non caricano nulla.
 */

export const CONSENT_VERSION = "2026-08-07";
export const CONSENT_STORAGE_KEY = "ueradar.cookie-consent";
/** Evento emesso a ogni scelta: consente a script futuri di leggere lo stato. */
export const CONSENT_CHANGE_EVENT = "ueradar:consent-change";
/** Evento che riapre le preferenze (pulsante "Gestisci cookie" nel footer). */
export const CONSENT_OPEN_EVENT = "ueradar:consent-open";

export const OPTIONAL_CATEGORIES = ["preferences", "analytics", "marketing"] as const;
export type OptionalCategory = (typeof OPTIONAL_CATEGORIES)[number];
export type ConsentCategory = "necessary" | OptionalCategory;

export type ConsentChoices = Record<ConsentCategory, boolean>;

export type ConsentMethod = "accept_all" | "reject_optional" | "custom";

export type ConsentRecord = {
  version: string;
  /** ISO 8601 UTC. */
  timestamp: string;
  method: ConsentMethod;
  choices: ConsentChoices;
};

/** Default normativo: solo i necessari, tutto il resto disattivato. */
export const DEFAULT_CHOICES: ConsentChoices = Object.freeze({
  necessary: true,
  preferences: false,
  analytics: false,
  marketing: false,
});

/**
 * Vendor opzionali realmente caricati dal prodotto.
 * Resta vuoto finche' non viene integrato e dichiarato uno strumento reale.
 */
export const OPTIONAL_VENDORS: readonly { id: string; category: OptionalCategory }[] = [];

export function hasOptionalVendors(): boolean {
  return OPTIONAL_VENDORS.length > 0;
}

export const CATEGORY_LABELS: Record<ConsentCategory, { title: string; description: string }> = {
  necessary: {
    title: "Necessari (sempre attivi)",
    description:
      "Autenticazione, sicurezza, memorizzazione della scelta sui cookie, installazione dell'app e consultazione offline dell'ultimo feed. Senza questi strumenti il servizio non funziona.",
  },
  preferences: {
    title: "Preferenze",
    description:
      "Memoria di impostazioni non essenziali dell'interfaccia. Nessuno strumento di questa categoria è oggi in uso.",
  },
  analytics: {
    title: "Statistiche",
    description:
      "Misurazione aggregata dell'uso del servizio. Nessuno strumento di questa categoria è oggi in uso.",
  },
  marketing: {
    title: "Marketing",
    description:
      "Profilazione pubblicitaria o remarketing. Nessuno strumento di questa categoria è oggi in uso.",
  },
};

function isChoices(value: unknown): value is ConsentChoices {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v["necessary"] === true && OPTIONAL_CATEGORIES.every((c) => typeof v[c] === "boolean");
}

/** Normalizza qualunque input: necessari sempre attivi, opzionali booleani espliciti. */
export function normalizeChoices(input: Partial<ConsentChoices> | undefined): ConsentChoices {
  const out: ConsentChoices = { ...DEFAULT_CHOICES };
  for (const c of OPTIONAL_CATEGORIES) out[c] = input?.[c] === true;
  out.necessary = true;
  return out;
}

export function createRecord(
  method: ConsentMethod,
  choices?: Partial<ConsentChoices>,
  now: Date = new Date(),
): ConsentRecord {
  const base =
    method === "accept_all"
      ? { preferences: true, analytics: true, marketing: true }
      : method === "reject_optional"
        ? {}
        : (choices ?? {});
  return {
    version: CONSENT_VERSION,
    timestamp: now.toISOString(),
    method,
    choices: normalizeChoices(base),
  };
}

export function parseRecord(raw: string | null | undefined): ConsentRecord | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const r = parsed as Record<string, unknown>;
    if (typeof r["version"] !== "string" || typeof r["timestamp"] !== "string") return null;
    const method = r["method"];
    if (method !== "accept_all" && method !== "reject_optional" && method !== "custom") return null;
    if (!isChoices(r["choices"])) return null;
    return {
      version: r["version"],
      timestamp: r["timestamp"],
      method,
      choices: normalizeChoices(r["choices"]),
    };
  } catch {
    return null;
  }
}

/** Il banner appare solo senza scelta valida o quando cambia la versione dell'informativa. */
export function needsPrompt(record: ConsentRecord | null): boolean {
  return !record || record.version !== CONSENT_VERSION;
}

/** Stato effettivo: senza scelta valida vale il default (solo necessari). */
export function effectiveChoices(record: ConsentRecord | null): ConsentChoices {
  if (!record || record.version !== CONSENT_VERSION) return { ...DEFAULT_CHOICES };
  return normalizeChoices(record.choices);
}

type MinimalStorage = Pick<Storage, "getItem" | "setItem">;

export function readConsent(storage: MinimalStorage | undefined | null): ConsentRecord | null {
  if (!storage) return null;
  try {
    return parseRecord(storage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeConsent(
  storage: MinimalStorage | undefined | null,
  record: ConsentRecord,
): void {
  if (!storage) return;
  try {
    storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* storage non disponibile: la scelta vale per la sessione corrente */
  }
}