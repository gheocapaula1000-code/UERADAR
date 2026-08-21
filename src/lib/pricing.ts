/**
 * Presentazione pubblica dei piani UEradar.
 * Prezzi, capienza e limiti NON sono definiti qui: derivano dal catalogo
 * server-side (`catalog.ts`), fonte unica di verità. Questo modulo si limita a
 * formattare per la UI.
 * `BILLING_ENABLED` è solo un flag di PRESENTAZIONE (mostra i pulsanti di
 * acquisto in UI). Non apre nulla in LIVE: l'accesso reale al checkout resta
 * deciso lato server da `UERADAR_BILLING_MODE=test` +
 * `UERADAR_CHECKOUT_QA_ENABLED` + allowlist email (`billing.server.ts`).
 */
import {
  CATALOG,
  ENTERPRISE_FROM_CENTS,
  formatEuro,
  PLAN_IDS,
  type PlanDefinition,
  type PlanId,
} from "./catalog";
import { TRIAL_COPY, TRIAL_DAYS, TRIAL_SCOPE } from "./trial";
import { LAUNCH_OFFER, launchOfferActive } from "./launch-offer";

export const BILLING_ENABLED = true;

export { TRIAL_COPY, TRIAL_DAYS, TRIAL_SCOPE };

export type PublicPlan = {
  id: PlanId;
  name: string;
  audience: string;
  monthly: string | null;
  annual: string | null;
  annualNote: string | null;
  vatNote: string;
  seats: number;
  seatsLabel: string;
  highlighted: boolean;
  selfService: boolean;
  features: readonly string[];
};

function toPublic(plan: PlanDefinition): PublicPlan {
  const monthly = plan.prices.month?.amountCents ?? null;
  const annual = plan.prices.year?.amountCents ?? null;
  return {
    id: plan.id,
    name: plan.name,
    audience: plan.audience,
    monthly: monthly === null ? null : formatEuro(monthly),
    annual: annual === null ? null : formatEuro(annual),
    annualNote: annual === null ? null : "/ anno + IVA — 2 mesi inclusi",
    vatNote: "/ mese + IVA (IVA esclusa)",
    seats: plan.limits.seats,
    seatsLabel: `${plan.limits.seats} utenti operativi (capienza tecnica)`,
    highlighted: plan.highlighted,
    selfService: plan.selfService,
    features: plan.highlights,
  };
}

/** Piani acquistabili online, nell'ordine di presentazione approvato. */
export const PUBLIC_PLANS: readonly PublicPlan[] = PLAN_IDS.filter(
  (id) => CATALOG[id].selfService,
).map((id) => toPublic(CATALOG[id]));

export const ENTERPRISE_PLAN = {
  name: CATALOG.enterprise.name,
  headline: "su richiesta",
  price: `da ${formatEuro(ENTERPRISE_FROM_CENTS)}`,
  vatNote: "/ mese + IVA — nessun acquisto online",
  cta: "Contattaci",
  contact: "info@pigiservice.com",
  description:
    "Più imprese sullo stesso contratto, fonti e integrazioni definite in accordo, workflow e limiti da contratto. Nessun checkout pubblico: si procede su preventivo.",
  features: CATALOG.enterprise.highlights,
} as const;

/** Compatibilità con la pagina abbonamento: stessa fonte, stesso testo. */
export const CUSTOM_PLAN = ENTERPRISE_PLAN;

export type PlanCompareRow = {
  label: string;
  radar: string;
  istruttoria: string;
  studio: string;
};

/**
 * Confronto Radar / Istruttoria / Studio: numeri dal catalogo, IVA esclusa.
 * L'offerta lancio RADAR (99 € poi 249 €) è visibile solo finché è attiva.
 */
export function planCompareRows(now: Date = new Date()): readonly PlanCompareRow[] {
  const radarMonth = CATALOG.professional.prices.month?.amountCents ?? 24900;
  const istruttoriaMonth = CATALOG.business.prices.month?.amountCents ?? 44900;
  const radarAnnual = CATALOG.professional.prices.year?.amountCents ?? 249000;
  const istruttoriaAnnual = CATALOG.business.prices.year?.amountCents ?? 449000;
  return [
    {
      label: "Prezzo mensile (IVA esclusa)",
      radar: launchOfferActive(now)
        ? `${LAUNCH_OFFER.priceLabel} in offerta lancio, poi ${LAUNCH_OFFER.listLabel} / mese`
        : `${formatEuro(radarMonth)} / mese`,
      istruttoria: `${formatEuro(istruttoriaMonth)} / mese`,
      studio: `da ${formatEuro(ENTERPRISE_FROM_CENTS)} / mese`,
    },
    {
      label: "Prezzo annuale (2 mesi inclusi, IVA esclusa)",
      radar: `${formatEuro(radarAnnual)} / anno`,
      istruttoria: `${formatEuro(istruttoriaAnnual)} / anno`,
      studio: "su preventivo",
    },
    {
      label: "Utenti operativi (capienza tecnica)",
      radar: String(CATALOG.professional.limits.seats),
      istruttoria: String(CATALOG.business.limits.seats),
      studio: "da contratto",
    },
    {
      label: "Imprese",
      radar: String(CATALOG.professional.limits.companies),
      istruttoria: String(CATALOG.business.limits.companies),
      studio: "anche multi-impresa",
    },
    {
      label: "Dossier / bozze al mese",
      radar: String(CATALOG.professional.limits.dossiersPerMonth),
      istruttoria: String(CATALOG.business.limits.dossiersPerMonth),
      studio: "da contratto",
    },
    {
      label: "Acquisto online",
      radar: "self-service",
      istruttoria: "self-service",
      studio: "nessun acquisto online",
    },
  ];
}

/**
 * Campi obbligatori dell'etichetta "Verificato": se anche uno manca, la
 * label non viene mostrata (fail-closed). Non è una garanzia di ammissibilità.
 */
export const VERIFIED_DEFINITION: readonly string[] = [
  "Fonte ufficiale raggiungibile",
  "Data e versione del documento",
  "Stato della misura e scadenza",
  "Beneficiari ammessi e territorio",
  "Intensità del contributo",
  "Spese ammissibili e documenti richiesti",
];

/** Limiti di prodotto dichiarati senza ambiguità. */
export const PRODUCT_BOUNDARIES: readonly string[] = [
  "Il numero di opportunità pertinenti mostrate non è mai limitato.",
  "Il dossier prepara e precompila. L'utente verifica e presenta: non invia nulla agli enti e non garantisce l'ottenimento del contributo.",
  "UEradar non sostituisce il consulente o il professionista incaricato.",
  "Gli utenti indicati nei piani sono capienza tecnica, non la leva di valore.",
];

export const TRIAL_TERMS: readonly string[] = [
  `${TRIAL_COPY.headline}.`,
  `${TRIAL_COPY.noCard}.`,
  TRIAL_COPY.noCharge,
  TRIAL_COPY.ctaNote,
  "Perimetro della prova: 1 impresa e 1 Dossier in versione filigranata.",
  "Una prova per Partita IVA e per dominio aziendale ogni 12 mesi.",
  "Cancellazione online, senza disdetta scritta e senza PEC.",
  "Tutti i prezzi sono IVA esclusa; l'annuale include 2 mesi.",
];

/** Note descrittive sull'architettura del motore lato server. */
export const ARCHITECTURE_NOTES: readonly { t: string; d: string }[] = [
  {
    t: "Cache del contenuto pubblico",
    d: "Il testo ufficiale della misura e la relativa analisi sono deduplicati e riusabili dalla cache del motore finché versione e TTL della fonte restano validi.",
  },
  {
    t: "Riuso sicuro tra utenti della stessa impresa",
    d: "La cache pubblica è condivisibile tra gli utenti operativi della stessa impresa: si tratta esclusivamente di fonti pubbliche ufficiali.",
  },
  {
    t: "Isolamento dei dati privati",
    d: "Profilo impresa, documenti, checklist compilate e dossier restano isolati per impresa e non sono mai condivisi con altre imprese.",
  },
  {
    t: "Limiti applicati lato server",
    d: "I dossier inclusi e i limiti del piano attivo sono applicati dal servizio, non dal browser: il browser non può ampliarli.",
  },
];

export const PRICING_FAQ: readonly { q: string; a: string }[] = [
  {
    q: "La prova gratuita richiede la carta di credito?",
    a: "No. Sono 7 giorni completamente gratuiti, senza carta di credito né dati bancari e senza dover dare disdetta. Al termine non partirà alcun addebito: sarai tu a decidere se abbonarti.",
  },
  {
    q: "Quante opportunità posso vedere?",
    a: "Tutte quelle pertinenti al tuo profilo: il numero di opportunità mostrate non è mai limitato. I piani si distinguono per le Domande / Dossier inclusi ogni mese e per la capienza di utenti operativi.",
  },
  {
    q: "Che differenza c'è tra Radar e Istruttoria?",
    a:
      "Radar è lo strumento sempre acceso: matching sul profilo, push quando esce una novità e 3 bozze di richiesta / Dossier al mese, a 249 € al mese. Istruttoria aggiunge una ricerca più profonda su camere, fonti provinciali e nicchie, priorità per imprese femminili, giovanili e startup, aggiornamento più frequente con alert prioritari e 10 bozze di richiesta / Dossier al mese, a 449 € al mese. Istruttoria prepara la bozza: non invia domande agli enti." +
      (launchOfferActive() ? ` ${LAUNCH_OFFER.note}` : ""),
  },
  {
    q: "Cosa significa l'etichetta Verificato?",
    a: "Indica soltanto che sono presenti i dati obbligatori provenienti dalla fonte ufficiale: fonte raggiungibile, data e versione, stato, scadenza, beneficiari, territorio, intensità del contributo, spese ammissibili e documenti richiesti. Se anche uno solo manca, l'etichetta non viene mostrata. Non è una garanzia assoluta di ammissibilità: la verifica finale resta sul documento dell'ente.",
  },
  {
    q: "Il dossier invia la domanda al posto mio?",
    a: "No. Il dossier prepara e precompila i dati per la tua revisione: non invia automaticamente nulla agli enti e non sostituisce il professionista che segue la pratica.",
  },
  {
    q: "Il numero di utenti è il valore del piano?",
    a: "No. Gli utenti sono soltanto capienza tecnica, titolare incluso: 2 con Radar e 5 con Istruttoria. Il valore sta nella qualità della selezione e nelle bozze di richiesta preparate.",
  },
  {
    q: "Quanto costa l'annuale?",
    a: "L'annuale include 2 mesi: 2.490 € per Radar e 4.490 € per Istruttoria, sempre IVA esclusa.",
  },
  {
    q: "Posso gestire più imprese?",
    a: "I piani acquistabili online coprono una sola impresa verificata. Più imprese e integrazioni su misura rientrano in Studio, da 990 € al mese + IVA su richiesta.",
  },
];
