import type { Bando } from "./bandocore-types";
import { isSportello, officialLink } from "./bando-status";
import { realApplicationUrl, realFormsUrl } from "./official-module";

/** Frase unica per i bandi a sportello: nessuna scadenza, si chiede finché ci sono fondi. */
export const SPORTELLO_LEAD =
  "Puoi chiedere adesso. Non c'è una data di chiusura: si può chiedere finché ci sono soldi.";

/** I tre passi sempre visibili: l'utente deve sapere qual è il prossimo click. */
export const SPORTELLO_STEPS = [
  "Apri il bando ufficiale",
  "Controlla se la tua impresa c'entra",
  "Invia la domanda sul sito dell'ente",
] as const;

/**
 * Dove mandare chi vuole partecipare: prima il canale di domanda dichiarato
 * dalla fonte, poi la modulistica, infine la scheda ufficiale. Nessun URL inventato.
 */
export function partecipaHref(bando: Bando): string | null {
  return realApplicationUrl(bando) ?? realFormsUrl(bando) ?? officialLink(bando);
}

export { isSportello };
