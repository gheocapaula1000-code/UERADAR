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
  "Cinque livelli di ricerca: locale, provinciale, regionale, nazionale ed europeo.";

/** Messaggio principale, forte ma verificabile. Va mostrato una sola volta per pagina. */
export const VALUE_STATEMENT =
  "Ogni anno, opportunità e fondi per miliardi di euro restano inutilizzati o non intercettati. UEradar ricerca in profondità e monitora in tempo reale fonti locali, provinciali, regionali, nazionali ed europee, segnala le opportunità compatibili e prepara automaticamente la bozza della domanda, pronta per verifica e invio.";

/** Come lavora il servizio: ricerca profonda e monitoraggio in tempo reale. */
export const RESEARCH_COPY =
  "UEradar esplora fonti ufficiali e specialistiche, incrocia profilo aziendale, territorio e requisiti e fa emergere opportunità difficili da trovare con una ricerca superficiale.";

export const MONITORING_COPY =
  "Monitoraggio in tempo reale sui cinque livelli, con segnalazioni quando una misura cambia, apre o si avvicina alla scadenza.";

/** La preparazione resta una bozza soggetta a verifica dell'utente. */
export const DRAFT_COPY =
  "La preparazione automatizzata produce una bozza e una modulistica precompilata, soggetta alla tua verifica prima dell'invio: UEradar non invia domande agli enti.";

/** Prova gratuita: sempre ben evidente. */
export const TRIAL_HIGHLIGHT = "7 giorni gratuiti, senza carta";
