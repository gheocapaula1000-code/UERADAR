import type { Bando } from "./bandocore-types";
import type { HomeView } from "./home-view";
import { officialLink } from "./bando-status";

export const CATALOG_SWITCH_LABEL = "Catalogo";
export const PROFILE_SWITCH_LABEL = "Per la mia impresa";

/** Catalogo = tutti i bandi ufficiali aperti. */
export const CATALOG_SWITCH_HINT = "Tutti i bandi ufficiali aperti.";

/** Impresa = solo quelli che il profilo può usare (ATECO ufficiale). */
export const PROFILE_SWITCH_HINT =
  "Solo i bandi che la tua impresa può usare, se il testo ufficiale cita il tuo codice ATECO.";

export const CATALOG_SWITCH_ARIA = "Catalogo: mostra tutti i bandi ufficiali aperti";
export const PROFILE_SWITCH_ARIA =
  "Per la mia impresa: mostra solo i bandi che il profilo può usare, se il testo ufficiale cita il codice ATECO";

export const VERIFY_OK_LABEL = "Verificato";
export const VERIFY_PARTIAL_LABEL = "Da verificare";
export const VERIFY_PARTIAL_MEANING = "Mancano ancora data o importo sul testo ufficiale.";
export const VERIFY_PARTIAL_NOT_INELIGIBLE = "Non vuol dire che la tua impresa è esclusa.";
export const OPEN_OFFICIAL_LABEL = "Apri il bando ufficiale";
export const OPEN_CARD_LABEL = "Apri la scheda";
export const RETRY_LABEL = "Riprova";
export const RESET_FILTERS_LABEL = "Azzera filtri";
export const SHOW_CATALOG_LABEL = "Vedi tutti i bandi";
export const BACK_TO_LIST_LABEL = "Torna ai bandi";

export const LAST_FEED_COUNT_KEY = "ueradar:last-feed-count:v1";

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type LastFeedCounts = {
  catalog?: number;
  profile?: number;
};

export type PublicVerifyStatus = "VERIFICATO" | "DA_VERIFICARE";

export type EmptyActionKind =
  "retry" | "reset-filters" | "show-catalog" | "open-official" | "back-to-list";

export interface NextStepCopy {
  title: string;
  body: string;
  actionLabel: string;
  actionKind: EmptyActionKind;
  lastKnownCount?: number | null;
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

/** Stato pubblico della card: solo data e importo massimo ufficiali. Non è un giudizio sull'impresa. */
export function publicVerifyStatus(
  bando: Pick<Bando, "scadenza" | "importo_max">,
): PublicVerifyStatus {
  const hasDeadline = nonEmpty(bando.scadenza);
  const hasMaxGrant = typeof bando.importo_max === "number" && bando.importo_max > 0;
  return hasDeadline && hasMaxGrant ? "VERIFICATO" : "DA_VERIFICARE";
}

export function isPublicPartial(bando: Pick<Bando, "scadenza" | "importo_max">): boolean {
  return publicVerifyStatus(bando) === "DA_VERIFICARE";
}

/** Compatibile solo se il feed lo ha già detto. Mai inventato. */
export function mayShowOfficialCompatible(match: Bando["match"] | null | undefined): boolean {
  return match?.status === "COMPATIBILE";
}

export function lastKnownCountMessage(count: number | null | undefined): string {
  const n = finiteCount(count);
  if (n === null) return "Non abbiamo un elenco salvato.";
  if (n === 1) return "L'ultima volta c'era 1 bando.";
  return `L'ultima volta c'erano ${n} bandi.`;
}

export function saveLastFeedCount(
  view: HomeView,
  count: number,
  storage: StorageLike | null | undefined,
): void {
  const n = finiteCount(count);
  if (!storage || n === null) return;
  try {
    const current = readLastFeedCounts(storage);
    current[view] = n;
    storage.setItem(LAST_FEED_COUNT_KEY, JSON.stringify(current));
  } catch {
    // Storage privato o quota: la sessione continua senza il conteggio.
  }
}

export function readLastFeedCounts(storage: StorageLike | null | undefined): LastFeedCounts {
  if (!storage) return {};
  try {
    const raw = storage.getItem(LAST_FEED_COUNT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LastFeedCounts;
    return {
      catalog: finiteCount(parsed.catalog) ?? undefined,
      profile: finiteCount(parsed.profile) ?? undefined,
    };
  } catch {
    return {};
  }
}

export function readLastFeedCount(
  view: HomeView,
  storage: StorageLike | null | undefined,
): number | null {
  return finiteCount(readLastFeedCounts(storage)[view]);
}

export function browserLastFeedCountStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function fetchErrorCopy(lastKnownCount: number | null | undefined): NextStepCopy {
  return {
    title: "Non riusciamo a caricare i bandi ora.",
    body: `${lastKnownCountMessage(lastKnownCount)} Riprova: non perdi nulla.`,
    actionLabel: RETRY_LABEL,
    actionKind: "retry",
    lastKnownCount: finiteCount(lastKnownCount),
  };
}

export function filtersEmptyCopy(): NextStepCopy {
  return {
    title: "Nessun bando con questi filtri.",
    body: "Hai ristretto troppo l'elenco. Togli i filtri per rivedere i bandi aperti.",
    actionLabel: RESET_FILTERS_LABEL,
    actionKind: "reset-filters",
  };
}

export function profileEmptyCopy(): NextStepCopy {
  return {
    title: "Nessun bando per la tua impresa in questo elenco.",
    body: "Mostriamo solo i bandi che citano il tuo codice ATECO nel testo ufficiale. Apri il Catalogo per vedere tutti i bandi aperti.",
    actionLabel: SHOW_CATALOG_LABEL,
    actionKind: "show-catalog",
  };
}

export function catalogEmptyCopy(): NextStepCopy {
  return {
    title: "Nessun bando ufficiale aperto in questo aggiornamento.",
    body: "Non inventiamo schede. Riprova tra poco.",
    actionLabel: RETRY_LABEL,
    actionKind: "retry",
  };
}

export function flashEmptyCopy(): NextStepCopy {
  return {
    title: "Nessuna scadenza ravvicinata.",
    body: "Scorri l'elenco sotto: ci sono gli altri bandi aperti.",
    actionLabel: SHOW_CATALOG_LABEL,
    actionKind: "show-catalog",
  };
}

export function highTierEmptyCopy(): NextStepCopy {
  return {
    title: "Nessuna scheda con data e importo completi.",
    body: "Scorri i bandi da verificare: manca ancora la data o l'importo sul testo ufficiale.",
    actionLabel: OPEN_OFFICIAL_LABEL,
    actionKind: "open-official",
  };
}

export function reviewTierEmptyCopy(): NextStepCopy {
  return {
    title: "Nessun bando da verificare in questo elenco.",
    body: "Le schede sopra hanno già data e importo sul testo ufficiale.",
    actionLabel: SHOW_CATALOG_LABEL,
    actionKind: "show-catalog",
  };
}

export function detailMissingCopy(): NextStepCopy {
  return {
    title: "Questa scheda non è più in elenco.",
    body: "Il bando può essere scaduto o non è in cache. Torna all'elenco e aprine un altro.",
    actionLabel: BACK_TO_LIST_LABEL,
    actionKind: "back-to-list",
  };
}

export function partialCardCopy(hasOfficialUrl: boolean): NextStepCopy {
  return {
    title: VERIFY_PARTIAL_LABEL,
    body: hasOfficialUrl
      ? `${VERIFY_PARTIAL_MEANING} ${VERIFY_PARTIAL_NOT_INELIGIBLE}`
      : `${VERIFY_PARTIAL_MEANING} ${VERIFY_PARTIAL_NOT_INELIGIBLE} Apri la scheda per il prossimo passo.`,
    actionLabel: hasOfficialUrl ? OPEN_OFFICIAL_LABEL : OPEN_CARD_LABEL,
    actionKind: hasOfficialUrl ? "open-official" : "back-to-list",
  };
}

/**
 * Elenco principale Home: un solo motivo, un solo tap.
 * Priorità: errore di rete, filtri, vista impresa, catalogo vuoto.
 */
export function homeListEmpty(input: {
  fetchFailed: boolean;
  lastKnownCount?: number | null;
  bandiCount: number;
  filteredCount: number;
  activeFilters: number;
  homeView: HomeView;
}): NextStepCopy | null {
  if (input.filteredCount > 0) return null;
  if (input.fetchFailed) return fetchErrorCopy(input.lastKnownCount);
  if (input.activeFilters > 0) return filtersEmptyCopy();
  if (input.homeView === "profile") return profileEmptyCopy();
  if (input.bandiCount === 0) return catalogEmptyCopy();
  return filtersEmptyCopy();
}

export function homeFlashEmpty(input: {
  fetchFailed: boolean;
  lastKnownCount?: number | null;
  flashCount: number;
  listHasItems: boolean;
}): NextStepCopy | null {
  if (input.flashCount > 0) return null;
  if (input.fetchFailed) return fetchErrorCopy(input.lastKnownCount);
  if (input.listHasItems) return flashEmptyCopy();
  return null;
}

export function cardPrimaryAction(bando: Bando): {
  kind: "official" | "detail";
  label: string;
  href: string | null;
} {
  const official = officialLink(bando);
  if (isPublicPartial(bando) && official) {
    return { kind: "official", label: OPEN_OFFICIAL_LABEL, href: official };
  }
  return { kind: "detail", label: OPEN_CARD_LABEL, href: null };
}

/** Solo https: il tap "Apri il bando ufficiale" non apre javascript: o path relativi. */
export function safePublicHref(raw?: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  if (!trimmed.includes("://") && (trimmed.startsWith("/") || trimmed.startsWith("."))) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
