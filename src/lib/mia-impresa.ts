export type MiaImpresaMatch = {
  match?: { status?: string } | null;
};

/**
 * Vista «Per la mia impresa»: nasconde solo NON_COMPATIBILE.
 * COMPATIBILE, DA_VERIFICARE e schede senza match restano visibili
 * (ATECO assente sul testo ufficiale, non extra-regione).
 * sedeOk / settoreOk restano filtri a valle, invariati.
 */
export function isMiaImpresaCompatibile(bando: MiaImpresaMatch): boolean {
  return bando.match?.status !== "NON_COMPATIBILE";
}

/* ------------------------------------------------------------------ *
 * Ripulitura vetrina profilo: fuori le pagine che non sono un avviso.
 * Nessun dato viene inventato: si scarta solo ciò che è chiaramente
 * navigazione di portale, indice, FAQ o graduatoria già chiusa.
 * Il Catalogo (toggle OFF) resta non filtrato.
 * ------------------------------------------------------------------ */

export type AvvisoLike = {
  titolo?: string | null;
  descrizione?: string | null;
  official_url?: string | null;
  notice_url?: string | null;
  application_url?: string | null;
  piattaforma_url?: string | null;
};

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function urls(bando: AvvisoLike): string {
  return [bando.official_url, bando.notice_url, bando.application_url, bando.piattaforma_url]
    .map(norm)
    .join(" ");
}

/** Titoli che sono home / indice di portale, non un avviso. */
const JUNK_TITLE = [
  /\|\s*home\b/,
  /^home\b/,
  /^inail\b\s*(\||-|·)/,
  /^bandi,?\s*contributi\s*e\s*premi\b/,
  /^albo\b/,
  /^amministrazione trasparente\b/,
  /^menu\b/,
  /^accedi\b|^login\b|^logout\b/,
  /^faq\b|\bmanuale\b|\bguida all'uso\b/,
  /^elenco (bandi|avvisi)\b/,
  /^bandi e avvisi$/,
  /^contributi$/,
  /^opportunit(à|a)$/,
];

/** Descrizioni che sono chrome di navigazione scrapato. */
const JUNK_DESC = [
  "passa al contenuto principale",
  "skip to main content",
  "vai al contenuto",
  "salta al contenuto",
  "questo sito utilizza cookie",
  "seleziona la lingua",
  "torna alla home",
];

/** URL di servizio (FAQ, SSO, manuali, portale) che non sono l'avviso. */
const JUNK_URL = [
  "/faq",
  "/manuale",
  "/sso",
  "/login",
  "/logout",
  "myinfe",
  "/accessibilita",
  "/privacy",
  "/cookie",
  "/mappa-del-sito",
  "cinea/who-we-are",
  "/help",
  "/support",
];

/** Graduatorie ed esiti: non si presenta più domanda. */
const CLOSED_ACT =
  /(graduatoria|graduatorie|elenco (dei )?(beneficiari|ammessi)|decreto di approvazione|approvazione (della )?graduatoria|esiti?\b|domande ammesse|non ammessi|revoca)/;

/** True quando la scheda è un atto di esito e non un avviso aperto. */
export function isGraduatoria(bando: AvvisoLike): boolean {
  return CLOSED_ACT.test(`${norm(bando.titolo)} ${norm(bando.descrizione)}`);
}

/**
 * True solo per schede che sembrano un vero avviso aperto.
 * Fail-closed sulla vista profilo: nel dubbio la pagina di portale sparisce.
 */
export function isRealOpenAvviso(bando: AvvisoLike): boolean {
  const titolo = norm(bando.titolo);
  if (titolo.length < 12) return false;
  if (JUNK_TITLE.some((re) => re.test(titolo))) return false;

  const descrizione = norm(bando.descrizione);
  if (JUNK_DESC.some((frag) => descrizione.includes(frag))) return false;

  const link = urls(bando);
  if (link && JUNK_URL.some((frag) => link.includes(frag))) return false;

  if (isGraduatoria(bando)) return false;

  return true;
}
