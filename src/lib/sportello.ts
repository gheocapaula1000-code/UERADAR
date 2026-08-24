import type { Bando, CompanyProfile } from "./bandocore-types";
import { isSportello, officialLink } from "./bando-status";
import { realApplicationUrl, realFormsUrl } from "./official-module";

/** Etichetta unica delle schede a sportello: mai "Da verificare". */
export const SPORTELLO_BADGE = "A sportello · fino a esaurimento fondi";

/** Frase unica per i bandi a sportello: nessuna scadenza, si chiede finché ci sono fondi. */
export const SPORTELLO_LEAD =
  "Puoi chiedere adesso. Non c'è una data di chiusura: si può chiedere fino a esaurimento fondi.";

/** Urgenza onesta: nessuna data inventata, solo il rischio reale. */
export const SPORTELLO_URGENCY = "Meglio fare subito: i soldi possono finire.";

/** I tre passi sempre visibili: l'utente deve sapere qual è il prossimo click. */
export const SPORTELLO_STEPS = [
  "Apri il bando ufficiale",
  "Prepara i documenti",
  "Controlla se la tua impresa c'entra",
  "Invia la domanda sul sito dell'ente",
] as const;

export interface SportelloStep {
  n: number;
  label: string;
  done: boolean;
  /** Cosa succede al click, in parole semplici. */
  hint: string;
}

/**
 * I quattro passi con stato "fatto" / "da fare". "Fatto" indica solo cose che la
 * PWA ha davvero pronte (link trovato, dati impresa in profilo): nessuna promessa
 * sull'esito della domanda.
 */
export function sportelloSteps(bando: Bando, hasProfile: boolean): SportelloStep[] {
  const link = partecipaHref(bando) ?? officialLink(bando);
  return [
    {
      n: 1,
      label: "Apri il bando ufficiale",
      done: Boolean(link),
      hint: link ? "Il link è pronto qui sotto." : "Il link non è sulla fonte.",
    },
    {
      n: 2,
      label: "Prepara i documenti",
      done: hasProfile,
      hint: hasProfile
        ? "Il dossier si riempie con i dati della tua impresa."
        : "Compila il profilo impresa e si riempie da solo.",
    },
    {
      n: 3,
      label: "Controlla se la tua impresa c'entra",
      done: false,
      hint: "Lo dice il testo ufficiale: leggi i requisiti.",
    },
    {
      n: 4,
      label: "Invia la domanda sul sito dell'ente",
      done: false,
      hint: "Si invia sul sito dell'ente, con i campi copiati da qui.",
    },
  ];
}

/**
 * Dove mandare chi vuole partecipare: prima il canale di domanda dichiarato
 * dalla fonte, poi la modulistica, infine la scheda ufficiale. Nessun URL inventato.
 */
export function partecipaHref(bando: Bando): string | null {
  return realApplicationUrl(bando) ?? realFormsUrl(bando) ?? officialLink(bando);
}

export { isSportello };

/** Riga unica quando un dato non è sulla fonte: mai inventare, sempre dire dove guardare. */
export const SPORTELLO_MISSING_LINE = "Non c'è sul bando. Aprendo il sito ufficiale lo vedi.";

export interface SportelloFact {
  label: string;
  value: string | null;
  href?: string;
}

function euro(n: number | undefined | null): string | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function list(items: string[] | undefined, max = 4): string | null {
  const clean = (items ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (clean.length === 0) return null;
  const shown = clean.slice(0, max).join(" · ");
  return clean.length > max ? `${shown} (+${clean.length - max})` : shown;
}

/**
 * Tutto quello che la fonte ufficiale dichiara davvero su un bando a sportello.
 * Nessun valore inventato: se il dato manca, `value` è null e la UI mostra
 * SPORTELLO_MISSING_LINE.
 */
export function sportelloFacts(bando: Bando): SportelloFact[] {
  const official = officialLink(bando);
  const domanda = realApplicationUrl(bando) ?? null;
  const modulo = realFormsUrl(bando) ?? null;
  const protocollo = bando.ufficio_protocollo_pec ?? bando.pec ?? null;
  const intensity =
    typeof bando.aid_intensity_percent === "number" && bando.aid_intensity_percent > 0
      ? `${bando.aid_intensity_percent}%`
      : null;

  return [
    { label: "Bando ufficiale", value: official ? "Apri la pagina ufficiale" : null, href: official ?? undefined },
    { label: "Link per la domanda", value: domanda ? "Vai alla domanda" : null, href: domanda ?? undefined },
    { label: "Modulo da compilare", value: modulo ? "Scarica il modulo" : null, href: modulo ?? undefined },
    { label: "Importo massimo", value: euro(bando.importo_max) },
    { label: "Quanto copre", value: intensity },
    { label: "Soldi totali disponibili", value: euro(bando.total_budget) },
    { label: "Requisiti dichiarati", value: list(bando.requisiti) },
    { label: "Spese ammesse", value: list(bando.eligible_expenses) },
    { label: "Dove si protocolla", value: protocollo },
  ];
}

/** Dati impresa già in profilo: si mostrano così come sono, senza giudizi di compatibilità. */
export function profiloFacts(profile: ProfiloSportello | null | undefined): SportelloFact[] {
  if (!profile) return [];
  const sede = [profile.comune, profile.provincia ? `(${profile.provincia})` : "", profile.regione]
    .filter(Boolean)
    .join(" ")
    .trim();
  return [
    { label: "Impresa", value: profile.ragione_sociale || null },
    { label: "P. IVA", value: profile.partita_iva || null },
    { label: "Codice ATECO in profilo", value: profile.codice_ateco || null },
    { label: "Sede", value: sede || null },
    { label: "Contatto", value: profile.pec || profile.email_referente || null },
    { label: "Forma giuridica", value: profile.forma_giuridica ?? null },
  ];
}

export type ProfiloSportello = Pick<
  CompanyProfile,
  "ragione_sociale" | "partita_iva" | "codice_ateco" | "comune" | "provincia" | "regione"
> &
  Partial<Pick<CompanyProfile, "pec" | "email_referente" | "forma_giuridica" | "telefono">>;

/**
 * Campi pronti da copiare per i portali esterni (Invitalia, Camera, MIMIT):
 * la PWA non compila quei siti, ma dà i valori reali del profilo da incollare.
 */
export function campiDaCopiare(profile: ProfiloSportello | null | undefined): SportelloFact[] {
  if (!profile) return [];
  return profiloFacts(profile).filter((f) => Boolean(f.value));
}

/** Blocco unico "Usa i miei dati": solo valori realmente presenti nel profilo. */
export function copiaMieiDati(profile: ProfiloSportello | null | undefined): string {
  return campiDaCopiare(profile)
    .map((f) => `${f.label}: ${f.value}`)
    .join("\n");
}
