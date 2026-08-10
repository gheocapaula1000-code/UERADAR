/**
 * Copy pubblico condiviso sulla copertura della ricerca UEradar.
 * Fonte unica: home, prezzi e area riservata leggono da qui, così il testo
 * resta coerente e verificabile dai test di copy.
 */

/** I cinque livelli coperti dalla ricerca e dal monitoraggio. */
export const COVERAGE_LEVELS: readonly string[] = [
  "Locale",
  "Provinciale",
  "Regionale",
  "Nazionale",
  "Europeo",
];

export const COVERAGE_HEADLINE =
  "Cinque Livelli di Ricerca: Locale, Provinciale, Regionale, Nazionale ed Europeo.";

/** Messaggio principale, forte ma verificabile. Va mostrato una sola volta per pagina. */
export const VALUE_STATEMENT =
  "Ogni anno, Bandi, Incentivi e Fondi per miliardi di euro restano inutilizzati o non intercettati. UEradar ricerca in profondità e monitora in tempo reale fonti locali, provinciali, regionali, nazionali ed europee, segnala le Opportunità compatibili con la tua Impresa e prepara automaticamente la Bozza della domanda, pronta per verifica e invio.";

/** Come lavora il servizio: ricerca profonda e monitoraggio in tempo reale. */
export const RESEARCH_COPY =
  "UEradar esplora Fonti Ufficiali e Specialistiche, incrocia Profilo Aziendale, Territorio e Requisiti e fa emergere Bandi e Incentivi difficili da trovare con una ricerca superficiale.";

export const MONITORING_COPY =
  "Monitoraggio in tempo reale sui Cinque Livelli, con segnalazioni quando una Misura cambia, apre o si avvicina alla Scadenza.";

/** La preparazione resta una bozza soggetta a verifica dell'utente. */
export const DRAFT_COPY =
  "La preparazione automatizzata produce una Bozza e una Modulistica precompilata, soggetta alla tua verifica prima dell'invio: UEradar non invia domande agli enti.";

/** Prova gratuita: sempre ben evidente. */
export const TRIAL_HIGHLIGHT = "7 giorni gratuiti, senza carta di credito né dati bancari e senza dover dare disdetta";
