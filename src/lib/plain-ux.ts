/**
 * Regole UX in chiaro ("plain UX"): un solo passo successivo per ogni stato
 * vuoto o di errore, una sola CTA primaria per scheda. Mai vicoli ciechi,
 * mai più azioni in competizione, microcopy solo in italiano.
 *
 * La copia degli stati vuoti vive in feed-empty.ts; qui è riesportata così
 * la dashboard ha un unico punto di ingresso per le decisioni UX.
 */

export {
  RESET_FILTERS_LABEL,
  RETRY_LABEL,
  SHOW_CATALOG_LABEL,
  catalogEmptyCopy,
  feedListEmpty,
  fetchErrorCopy,
  filtersEmptyCopy,
  flashEmptyCopy,
  profileEmptyCopy,
} from "./feed-empty";
export type { FeedEmptyCopy, FeedEmptyKind } from "./feed-empty";
import type { FeedEmptyCopy } from "./feed-empty";

/** Etichette CTA uniche: mai varianti estemporanee nelle card. */
export const OFFICIAL_CTA_LABEL = "Apri il bando ufficiale";
export const DOSSIER_CTA_LABEL = "Genera dossier candidatura";
export const PROFILE_CTA_LABEL = "Completa il profilo impresa";

/** Stato "profilo mancante": il passo successivo è sempre il profilo. */
export function profileMissingCopy(): FeedEmptyCopy {
  return {
    kind: "profile",
    title: "Prima completiamo il profilo della tua impresa.",
    body: "Bastano pochi dati: forma giuridica, codice ATECO e regione.",
    actionLabel: PROFILE_CTA_LABEL,
  };
}

export type CardCtaKind = "sportello" | "official" | "dossier" | "none";

export interface CardCta {
  kind: CardCtaKind;
  label: string;
  /** URL esterno quando la primaria è "Apri il bando ufficiale". */
  href: string | null;
}

/**
 * Una sola CTA primaria per scheda:
 * - sportello → la guida passo-passo è l'unica azione evidenziata;
 * - graduatoria/esito → mai dossier: solo il bando ufficiale (o niente);
 * - scheda parziale, non compatibile o accesso non attivo → "Apri il bando
 *   ufficiale"; se il link ufficiale manca, si ripiega sul dossier (mai
 *   vicolo cieco);
 * - compatibile (o compatibilità ignota in catalogo) → dossier, che sul
 *   dettaglio applica il gate di quota.
 */
export function cardPrimaryCta(input: {
  sportello: boolean;
  esito: boolean;
  parziale: boolean;
  /** true = Compatibile, false = Non compatibile, null = non valutato. */
  compatibile: boolean | null;
  officialHref: string | null;
  entitled: boolean;
}): CardCta {
  if (input.sportello) {
    return { kind: "sportello", label: "Segui la guida passo-passo", href: null };
  }
  if (input.esito) {
    return input.officialHref
      ? { kind: "official", label: OFFICIAL_CTA_LABEL, href: input.officialHref }
      : { kind: "none", label: OFFICIAL_CTA_LABEL, href: null };
  }
  const prefersOfficial = input.parziale || input.compatibile === false || !input.entitled;
  if (prefersOfficial && input.officialHref) {
    return { kind: "official", label: OFFICIAL_CTA_LABEL, href: input.officialHref };
  }
  return { kind: "dossier", label: DOSSIER_CTA_LABEL, href: null };
}
