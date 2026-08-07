/**
 * Piani pubblici UEradar.com.
 * Fonte unica di verità per prezzi e condizioni: usata da landing, pagina prezzi e test.
 * Billing tecnicamente disabilitato: nessun pagamento e nessun provider collegato.
 * Nessuna quota, nessun credito, nessun limite d'uso sulle funzionalità.
 */
export const BILLING_ENABLED = false;

export type PublicPlan = {
  id: "business" | "team";
  name: string;
  price: string;
  vatNote: string;
  audience: string;
  seats: number;
  seatsLabel: string;
  features: string[];
};

/** Funzionalità illimitate, identiche nei due piani. */
export const UNLIMITED_FEATURES: readonly string[] = [
  "Dossier candidatura illimitati",
  "Pratiche seguite illimitate",
  "Ricerche e controlli illimitati",
  "Matching sul profilo impresa illimitato",
  "Compilazioni di bozze illimitate",
  "Export TXT e PDF in locale illimitati",
];

export const PUBLIC_PLANS: readonly PublicPlan[] = [
  {
    id: "business",
    name: "BUSINESS",
    price: "€299,00",
    vatNote: "/ mese + IVA (IVA esclusa)",
    audience: "Per una impresa verificata",
    seats: 3,
    seatsLabel: "fino a 3 utenti nominativi",
    features: [
      "1 impresa verificata",
      "fino a 3 utenti nominativi",
      "Tutto illimitato: nessuna quota e nessun credito",
      ...UNLIMITED_FEATURES,
    ],
  },
  {
    id: "team",
    name: "TEAM",
    price: "€599,00",
    vatNote: "/ mese + IVA (IVA esclusa)",
    audience: "Per una impresa verificata con più referenti",
    seats: 10,
    seatsLabel: "fino a 10 utenti nominativi",
    features: [
      "1 impresa verificata",
      "fino a 10 utenti nominativi",
      "Tutto illimitato: nessuna quota e nessun credito",
      "Accesso del team ai dossier e al radar della stessa impresa",
      ...UNLIMITED_FEATURES,
    ],
  },
] as const;

export const CUSTOM_PLAN = {
  name: "OLTRE 10 UTENTI",
  headline: "Soluzione su misura",
  cta: "Contattaci",
  description:
    "Per organizzazioni con più di 10 utenti nominativi valutiamo una soluzione su misura. Scrivici e concordiamo insieme perimetro e condizioni.",
  contact: "assistenza@ueradar.com",
} as const;

/** Condizioni identiche per entrambi i piani. */
export const TRIAL_TERMS: readonly string[] = [
  "Prova gratuita 7 giorni.",
  "Nessuna carta di credito e nessun dato bancario richiesto per iniziare.",
  "Nessun addebito automatico alla fine della prova: il servizio a pagamento parte solo con attivazione volontaria.",
  "Cancellazione online, senza disdetta scritta e senza PEC.",
  "Tutto illimitato: nessuna quota, nessun credito, nessun limite su dossier, ricerche, controlli, matching, compilazioni ed export.",
  "Costi API inclusi nel canone.",
  "Nessun overage e nessun costo extra automatico.",
  "Gli unici limiti sono commerciali: una impresa verificata e il numero di utenti nominativi del piano.",
];

/**
 * Note tecniche sull'architettura del motore lato backend.
 * Descrittive: nessun controllo è simulato lato client.
 */
export const ARCHITECTURE_NOTES: readonly { t: string; d: string }[] = [
  {
    t: "Cache del contenuto pubblico",
    d: "Il testo ufficiale del bando e la relativa analisi sono deduplicati e riusabili dalla cache del motore finché la versione o il TTL della fonte restano validi, evitando nuove chiamate ai provider.",
  },
  {
    t: "Riuso sicuro tra utenti della stessa impresa",
    d: "La cache pubblica può essere condivisa tra gli utenti nominativi della stessa impresa e, trattandosi esclusivamente di fonti pubbliche ufficiali, riusata dal motore in sicurezza.",
  },
  {
    t: "Isolamento dei dati privati",
    d: "Profilo impresa, documenti, checklist compilate e dossier restano isolati per impresa/tenant e non sono mai condivisi cross-tenant.",
  },
  {
    t: "Deduplica, idempotenza e invalidazione",
    d: "Il motore applica deduplica, operazioni idempotenti, TTL e versione per fonte, con invalidazione quando il bando cambia.",
  },
  {
    t: "Protezioni interne, non quote commerciali",
    d: "Rate limit anti-abuso e circuit breaker sono protezioni interne di costo e affidabilità: non sono quote commerciali, non generano overage e non comportano addebiti al cliente.",
  },
];

export const PRICING_FAQ: readonly { q: string; a: string }[] = [
  {
    q: "Ci sono limiti di utilizzo o crediti da consumare?",
    a: "No. Dossier, pratiche, ricerche, controlli, matching, compilazioni ed export sono illimitati in entrambi i piani. Gli unici limiti sono commerciali: una impresa verificata e il numero di utenti nominativi.",
  },
  {
    q: "Serve la carta di credito per iniziare la prova?",
    a: "No. La prova gratuita dura 7 giorni e non richiede carta di credito né dati bancari.",
  },
  {
    q: "Cosa succede al termine dei 7 giorni?",
    a: "Non viene effettuato nessun addebito automatico. Il servizio a pagamento parte solo con una attivazione volontaria da parte tua.",
  },
  {
    q: "Come si disdice?",
    a: "La cancellazione avviene online dal tuo account, senza disdetta scritta e senza PEC.",
  },
  {
    q: "Ci sono costi extra a consumo?",
    a: "No. I costi API sono inclusi nel canone: nessun overage e nessun costo extra automatico.",
  },
  {
    q: "Come fate a offrire tutto illimitato?",
    a: "Il motore deduplica e riusa dalla cache il contenuto pubblico ufficiale dei bandi e la relativa analisi finché versione e TTL della fonte sono validi, riducendo le chiamate ai provider. I dati privati dell'impresa restano isolati per tenant.",
  },
  {
    q: "Posso gestire altre imprese con lo stesso piano?",
    a: "No. Entrambi i piani coprono una sola impresa verificata; cambia soltanto il numero di utenti nominativi (3 o 10).",
  },
  {
    q: "I prezzi sono IVA inclusa?",
    a: "No, i prezzi indicati sono IVA esclusa: €299,00 e €599,00 al mese + IVA.",
  },
];
