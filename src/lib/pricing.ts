/**
 * Presentazione pubblica dei piani UEradar.
 * Prezzi, capienza e limiti NON sono definiti qui: derivano dal catalogo
 * server-side (`catalog.ts`), fonte unica di verità. Questo modulo si limita a
 * formattare per la UI.
 * Billing pubblico disattivato finché l'ambiente TEST non è completo.
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

export const BILLING_ENABLED = false;

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
  headline: "Soluzione su misura",
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

/** Che cosa significa esattamente "Verificato" in UEradar. */
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
  "Il dossier prepara e precompila per la tua revisione: non invia nulla agli enti.",
  "UEradar non sostituisce il consulente o il professionista incaricato.",
  "I tempi di notifica si misurano dal momento del rilevamento da parte di UEradar.",
  "Gli utenti indicati nei piani sono capienza tecnica, non la leva di valore.",
];

export const TRIAL_TERMS: readonly string[] = [
  `${TRIAL_COPY.headline}.`,
  `${TRIAL_COPY.noCard}.`,
  TRIAL_COPY.noCharge,
  TRIAL_COPY.ctaNote,
  "La prova offre temporaneamente il livello Business con 1 impresa, 1 utente, 2 obiettivi e 1 anteprima dossier filigranata.",
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
    t: "Cadenze e verifiche misurate",
    d: "Frequenza degli aggiornamenti e dossier inclusi sono applicati lato server secondo il piano attivo, non dal browser.",
  },
];

export const PRICING_FAQ: readonly { q: string; a: string }[] = [
  {
    q: "La prova gratuita richiede la carta di credito?",
    a: "No. Sono 7 giorni completamente gratuiti, senza carta di credito e senza dati bancari. Al termine non partirà alcun addebito: sarai tu a decidere se abbonarti.",
  },
  {
    q: "Quante opportunità posso vedere?",
    a: "Tutte quelle pertinenti al tuo profilo: il numero di opportunità mostrate non è mai limitato. I piani si distinguono per capienza di utenti operativi e dossier inclusi.",
  },
  {
    q: "Che differenza c'è tra Professional, Business ed Executive?",
    a: "Le fonti ufficiali consultate sono le stesse per tutti i piani self-service. I piani si distinguono per capienza di utenti operativi e dossier inclusi: 1 dossier al mese con Professional, 5 con Business, 15 con Executive.",
  },
  {
    q: "Cosa significa Verificato?",
    a: "Una opportunità è Verificata solo con fonte ufficiale raggiungibile, data e versione, stato, scadenza, beneficiari, territorio, intensità del contributo, spese ammissibili e documenti richiesti.",
  },
  {
    q: "Il dossier invia la domanda al posto mio?",
    a: "No. Il dossier prepara e precompila i dati per la tua revisione: non invia automaticamente nulla agli enti e non sostituisce il professionista che segue la pratica.",
  },
  {
    q: "Il numero di utenti è il valore del piano?",
    a: "No. Gli utenti sono soltanto capienza tecnica, titolare incluso: 2 con Professional, 5 con Business, 10 con Executive. Il valore sta nella qualità della selezione e nei dossier preparati.",
  },
  {
    q: "Quanto costa l'annuale?",
    a: "L'annuale include 2 mesi: 4.990 € per Professional, 9.900 € per Business e 19.900 € per Executive, sempre IVA esclusa.",
  },
  {
    q: "Da quando si misurano i tempi di notifica?",
    a: "Dal momento del rilevamento da parte di UEradar, non dalla pubblicazione originale dell'ente.",
  },
  {
    q: "Posso gestire più imprese?",
    a: "I piani self-service coprono una sola impresa verificata. Più imprese e integrazioni su misura rientrano in Enterprise, da 3.990 € al mese + IVA su preventivo.",
  },
];
