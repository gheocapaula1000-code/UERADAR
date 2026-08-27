import type { HomeView } from "./home-view";

export const RESET_FILTERS_LABEL = "Azzera filtri";
export const SHOW_CATALOG_LABEL = "Vedi tutti i Bandi";
export const RETRY_LABEL = "Riprova";

export type FeedEmptyKind = "fetch-error" | "filters" | "profile" | "catalog";

export type FeedEmptyCopy = {
  kind: FeedEmptyKind;
  title: string;
  body: string;
  actionLabel: string;
};

function lastKnownBody(count: number | null | undefined): string {
  if (typeof count === "number" && Number.isFinite(count) && count >= 0) {
    return `Ultimo dato noto: ${Math.floor(count)} Bandi.`;
  }
  return "";
}

export function fetchErrorCopy(lastKnownCount?: number | null): FeedEmptyCopy {
  const known = lastKnownBody(lastKnownCount);
  return {
    kind: "fetch-error",
    title: "Non siamo riusciti a leggere il catalogo adesso.",
    body: known ? `${known} I Bandi che vedi restano validi.` : "Non inventiamo schede.",
    actionLabel: RETRY_LABEL,
  };
}

export function filtersEmptyCopy(): FeedEmptyCopy {
  return {
    kind: "filters",
    title: "Nessun Bando con i filtri scelti.",
    body: "Togli i filtri per rivedere i Bandi aperti.",
    actionLabel: RESET_FILTERS_LABEL,
  };
}

export function profileEmptyCopy(): FeedEmptyCopy {
  return {
    kind: "profile",
    title: "Nessun Bando per il tuo profilo adesso.",
    body: "Non vuol dire che la tua impresa è esclusa: nel catalogo ci sono altri Bandi aperti.",
    actionLabel: SHOW_CATALOG_LABEL,
  };
}

export function catalogEmptyCopy(): FeedEmptyCopy {
  return {
    kind: "catalog",
    title: "Nessun Bando ufficiale in questo aggiornamento.",
    body: "Non inventiamo schede.",
    actionLabel: RETRY_LABEL,
  };
}

export function flashEmptyCopy(listHasItems: boolean): { title: string; body: string } {
  if (listHasItems) {
    return {
      title: "Nessuna scadenza ravvicinata tra le opportunità caricate.",
      body: "Scorri l'elenco sotto: ci sono gli altri Bandi aperti.",
    };
  }
  return {
    title: "Nessuna scadenza ravvicinata tra le opportunità caricate dal catalogo ufficiale.",
    body: "",
  };
}

/**
 * Elenco principale: un solo motivo, un solo passo successivo.
 * Priorità: errore di rete, filtri, vista impresa, catalogo vuoto.
 */
export function feedListEmpty(input: {
  fetchFailed: boolean;
  lastKnownCount?: number | null;
  filteredCount: number;
  activeFilters: number;
  homeView: HomeView;
}): FeedEmptyCopy | null {
  if (input.fetchFailed) return fetchErrorCopy(input.lastKnownCount);
  if (input.filteredCount > 0) return null;
  if (input.activeFilters > 0) return filtersEmptyCopy();
  if (input.homeView === "profile") return profileEmptyCopy();
  return catalogEmptyCopy();
}
