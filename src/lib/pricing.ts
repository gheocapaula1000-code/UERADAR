/**
 * Piani pubblici UEradar.com.
 * Fonte unica di verità per prezzi e condizioni: usata da landing, pagina prezzi e test.
 * Billing tecnicamente disabilitato: nessun pagamento e nessun provider collegato.
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
      "Radar e matching per una impresa",
      "Dossier candidatura individuali",
      "Export TXT e PDF in locale",
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
      "Stesse funzioni del piano Business",
      "Accesso del team ai dossier e al radar della stessa impresa",
      "Export TXT e PDF in locale",
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
  "Costi API inclusi entro un uso corretto del servizio.",
  "Nessun overage o costo extra automatico.",
];

export const PRICING_FAQ: readonly { q: string; a: string }[] = [
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
    a: "No. I costi API sono inclusi entro un uso corretto del servizio: nessun overage e nessun costo extra automatico.",
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
