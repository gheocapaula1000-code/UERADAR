import type { Bando, CompanyProfile } from "./bandocore-types";
import { isSportello, officialLink } from "./bando-status";
import { formatItalianInteger } from "./catalog";
import { realApplicationUrl, realFormsUrl } from "./official-module";

/** Frase ufficiale da tenere visibile. Non è una data. */
export const FUNDS_PHRASE = "fino a esaurimento fondi";
export const FUNDS_PHRASE_AD = "fino ad esaurimento fondi";

export const SPORTELLO_BADGE = `A sportello · ${FUNDS_PHRASE}`;

export const SPORTELLO_URGENCY = "Meglio fare subito: i soldi possono finire.";

export const SPORTELLO_LEAD =
  "Puoi chiedere adesso. Non c'è una data di chiusura: finché ci sono soldi.";

export const MISSING_OFFICIAL_LINE =
  "Non c'è sul bando. Aprendo il sito ufficiale lo vedi.";

/** Alias tenuto per le schede già montate: stesso testo, mai un vicolo cieco. */
export const SPORTELLO_MISSING_LINE = MISSING_OFFICIAL_LINE;

export const SPORTELLO_CTA = "Partecipa adesso";

/** Paula: noi pensiamo per lui — we decide the next click; they only click. */
export const WE_THINK_FOR_THEM = "noi pensiamo per lui";

export const NOW_DO_THIS = "Adesso fai questo";

export const SPORTELLO_STEPS = [
  "Apri il bando ufficiale",
  "Prepara i documenti",
  "Controlla se la tua impresa c'entra",
  "Invia la domanda sul sito dell'ente",
] as const;

const FUNDS_RE = /fino ad? esaurimento fondi/i;

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function officialHaystack(
  bando: Pick<Bando, "descrizione" | "requisiti" | "evidence" | "fonte_extratestuale">,
): string {
  return [
    bando.descrizione,
    bando.fonte_extratestuale,
    ...(bando.requisiti ?? []),
    ...(bando.evidence ?? []).flatMap((e) => [e.excerpt, e.source_title]),
  ]
    .filter(nonEmpty)
    .join("\n");
}

/** Legge la frase ufficiale dal testo, senza inventarla. */
export function officialFundsPhrase(
  bando: Pick<Bando, "descrizione" | "requisiti" | "evidence" | "fonte_extratestuale">,
): string {
  const hay = officialHaystack(bando);
  if (/fino ad esaurimento fondi/i.test(hay)) return FUNDS_PHRASE_AD;
  if (FUNDS_RE.test(hay)) return FUNDS_PHRASE;
  return FUNDS_PHRASE;
}

export function sportelloBadgeLabel(bando: Bando): string {
  return `A sportello · ${officialFundsPhrase(bando)}`;
}

/**
 * Dove mandare chi vuole partecipare: prima domanda, poi modulo, poi scheda.
 * Nessun URL inventato.
 */
export function partecipaHref(bando: Bando): string | null {
  return realApplicationUrl(bando) ?? realFormsUrl(bando) ?? officialLink(bando);
}

export function officialPageHref(bando: Bando): string | null {
  return officialLink(bando);
}

export function domandaHref(bando: Bando): string | null {
  return realApplicationUrl(bando) ?? null;
}

export function moduloHref(bando: Bando): string | null {
  return realFormsUrl(bando) ?? null;
}

export function protocolEmail(bando: Bando): string | null {
  const value = bando.ufficio_protocollo_pec ?? bando.pec;
  return nonEmpty(value) ? value.trim() : null;
}

export type OfficialAmount = { label: string; value: string };

/** Solo importi già presenti sulla fonte. Nessun numero inventato. */
export function officialAmounts(bando: Bando): OfficialAmount[] {
  const out: OfficialAmount[] = [];
  if (typeof bando.importo_max === "number" && bando.importo_max > 0) {
    out.push({ label: "Soldi massimi", value: `${formatItalianInteger(bando.importo_max)} €` });
  }
  if (typeof bando.aid_intensity_percent === "number" && bando.aid_intensity_percent > 0) {
    out.push({ label: "Quanto copre", value: `${bando.aid_intensity_percent}%` });
  }
  if (typeof bando.total_budget === "number" && bando.total_budget > 0) {
    out.push({ label: "Cassa totale", value: `${formatItalianInteger(bando.total_budget)} €` });
  }
  if (nonEmpty(bando.apertura)) {
    const t = new Date(bando.apertura);
    if (Number.isFinite(t.getTime())) {
      out.push({ label: "Apre il", value: t.toLocaleDateString("it-IT") });
    }
  }
  return out;
}

export type ProfiloSportello = Pick<
  CompanyProfile,
  "ragione_sociale" | "partita_iva" | "codice_ateco" | "comune" | "provincia" | "regione"
> &
  Partial<Pick<CompanyProfile, "pec" | "email_referente" | "forma_giuridica" | "telefono">>;

export type ProfileFact = { label: string; value: string; kind: "name" | "sede" | "ateco" | "piva" | "other" };

/** Dati già inseriti dall'utente, da copiare. Non è un giudizio di compatibilità. */
export function profileFacts(profile: ProfiloSportello | null | undefined): ProfileFact[] {
  if (!profile) return [];
  const out: ProfileFact[] = [];
  if (nonEmpty(profile.ragione_sociale)) {
    out.push({ label: "Nome impresa", value: profile.ragione_sociale.trim(), kind: "name" });
  }
  if (nonEmpty(profile.partita_iva)) {
    out.push({ label: "Partita IVA", value: profile.partita_iva.trim(), kind: "piva" });
  }
  const sede = [profile.comune, profile.provincia, profile.regione].filter(nonEmpty).join(", ");
  if (sede) out.push({ label: "Dove sei", value: sede, kind: "sede" });
  if (nonEmpty(profile.codice_ateco)) {
    out.push({
      label: "Codice attività della tua impresa",
      value: profile.codice_ateco.trim(),
      kind: "ateco",
    });
  }
  if (nonEmpty(profile.forma_giuridica)) {
    out.push({ label: "Forma della società", value: profile.forma_giuridica, kind: "other" });
  }
  return out;
}

export interface SportelloFact {
  label: string;
  value: string | null;
  href?: string;
}

function euro(n: number | undefined | null): string | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return `${formatItalianInteger(n)} €`;
}

function list(items: string[] | undefined, max = 4): string | null {
  const clean = (items ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (clean.length === 0) return null;
  const shown = clean.slice(0, max).join(" · ");
  return clean.length > max ? `${shown} (+${clean.length - max})` : shown;
}

/**
 * Pacchetto ufficiale: solo campi presenti. Se manca, value è null
 * e la UI usa MISSING_OFFICIAL_LINE + bottone al sito.
 */
export function sportelloFacts(bando: Bando): SportelloFact[] {
  const official = officialPageHref(bando);
  const domanda = domandaHref(bando);
  const modulo = moduloHref(bando);
  const protocollo = protocolEmail(bando);
  const intensity =
    typeof bando.aid_intensity_percent === "number" && bando.aid_intensity_percent > 0
      ? `${bando.aid_intensity_percent}%`
      : null;

  return [
    { label: "Bando ufficiale", value: official ? "Apri il bando" : null, href: official ?? undefined },
    { label: "Domanda", value: domanda ? "Apri la domanda" : null, href: domanda ?? undefined },
    { label: "Modulo", value: modulo ? "Scarica il modulo" : null, href: modulo ?? undefined },
    { label: "Soldi massimi", value: euro(bando.importo_max) },
    { label: "Quanto copre", value: intensity },
    { label: "Cassa totale", value: euro(bando.total_budget) },
    { label: "Requisiti", value: list(bando.requisiti) },
    { label: "Spese ammesse", value: list(bando.eligible_expenses) },
    { label: "Posta dell'ufficio", value: protocollo },
  ];
}

/** Dati impresa già in profilo: si mostrano così come sono, senza giudizi. */
export function profiloFacts(profile: ProfiloSportello | null | undefined): SportelloFact[] {
  return profileFacts(profile).map((f) => ({ label: f.label, value: f.value }));
}

export function campiDaCopiare(profile: ProfiloSportello | null | undefined): SportelloFact[] {
  if (!profile) return [];
  return profiloFacts(profile).filter((f) => Boolean(f.value));
}

export function copiaMieiDati(profile: ProfiloSportello | null | undefined): string {
  return campiDaCopiare(profile)
    .map((f) => `${f.label}: ${f.value}`)
    .join("\n");
}

/** ATECO citato dal testo ufficiale (dal match del feed). Mai inventato. */
export function officialAtecoMentions(bando: Bando): string[] {
  const confirmed = bando.match?.confirmed ?? [];
  return confirmed.filter((line) => nonEmpty(line) && /ateco/i.test(line));
}

export type SportelloGap = { what: string; line: string };

export function sportelloGaps(bando: Bando): SportelloGap[] {
  const gaps: SportelloGap[] = [];
  if (!officialPageHref(bando)) {
    gaps.push({ what: "scheda ufficiale", line: MISSING_OFFICIAL_LINE });
  }
  if (!domandaHref(bando)) {
    gaps.push({ what: "pagina della domanda", line: MISSING_OFFICIAL_LINE });
  }
  if (!moduloHref(bando)) {
    gaps.push({ what: "modulo", line: MISSING_OFFICIAL_LINE });
  }
  if (officialAmounts(bando).length === 0) {
    gaps.push({
      what: "importo",
      line: "L'importo non è ancora sul testo. Aprendo il bando ufficiale lo vedi.",
    });
  }
  if (!(bando.requisiti ?? []).some(nonEmpty)) {
    gaps.push({ what: "requisiti", line: MISSING_OFFICIAL_LINE });
  }
  return gaps;
}

export type SportelloStepId = "official" | "dossier" | "check" | "apply";

export type SportelloStep = {
  id: SportelloStepId;
  n: number;
  title: string;
  wePrepared: string;
  youDo: string;
};

export function sportelloSteps(bando: Bando): SportelloStep[] {
  const official = officialPageHref(bando);
  const apply = domandaHref(bando) ?? moduloHref(bando) ?? official;
  const ateco = officialAtecoMentions(bando);
  return [
    {
      id: "official",
      n: 1,
      title: SPORTELLO_STEPS[0],
      wePrepared: official
        ? "Abbiamo il link della pagina dell'ente."
        : "Il link della scheda non c'è in archivio.",
      youDo: official ? "Clicca e leggi la pagina ufficiale." : MISSING_OFFICIAL_LINE,
    },
    {
      id: "dossier",
      n: 2,
      title: SPORTELLO_STEPS[1],
      wePrepared: "Prepariamo una bozza solo con i dati già presenti (importo, requisiti, link).",
      youDo: "Apri la bozza e controlla. Non inventiamo i campi vuoti.",
    },
    {
      id: "check",
      n: 3,
      title: SPORTELLO_STEPS[2],
      wePrepared:
        ateco.length > 0
          ? `Il testo ufficiale scrive: ${ateco.join(" · ")}.`
          : "Non diciamo se sei dentro se il bando non lo scrive.",
      youDo:
        ateco.length > 0
          ? "Controlla comunque sul sito dell'ente."
          : "Leggi tu sul bando ufficiale. Non inventiamo il codice attività.",
    },
    {
      id: "apply",
      n: 4,
      title: SPORTELLO_STEPS[3],
      wePrepared: apply
        ? "Ti portiamo sulla pagina dell'ente."
        : "La pagina di invio non è distinta dalla scheda.",
      youDo: "UEradar non spedisce niente. Lo fai tu sul sito dell'ente.",
    },
  ];
}

const PROGRESS_KEY = "ueradar:sportello-steps:v1";

export type SportelloProgress = Record<SportelloStepId, boolean>;

function emptyProgress(): SportelloProgress {
  return { official: false, dossier: false, check: false, apply: false };
}

export function readSportelloProgress(
  bandoId: string,
  storage: Pick<Storage, "getItem"> | null | undefined,
): SportelloProgress {
  if (!storage) return emptyProgress();
  try {
    const raw = storage.getItem(PROGRESS_KEY);
    if (!raw) return emptyProgress();
    const all = JSON.parse(raw) as Record<string, Partial<SportelloProgress>>;
    const row = all[bandoId] ?? {};
    return {
      official: row.official === true,
      dossier: row.dossier === true,
      check: row.check === true,
      apply: row.apply === true,
    };
  } catch {
    return emptyProgress();
  }
}

export function writeSportelloProgress(
  bandoId: string,
  patch: Partial<SportelloProgress>,
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined,
): SportelloProgress {
  const current = readSportelloProgress(bandoId, storage);
  const next = { ...current, ...patch };
  if (!storage) return next;
  try {
    const raw = storage.getItem(PROGRESS_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, SportelloProgress>) : {};
    all[bandoId] = next;
    storage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {
    // Storage privato: la sessione continua in memoria.
  }
  return next;
}

export function nextSportelloStep(
  steps: SportelloStep[],
  progress: SportelloProgress,
): SportelloStepId {
  return steps.find((s) => !progress[s.id])?.id ?? "apply";
}

export type RecommendedKind = "external" | "dossier" | "detail";

export type RecommendedSportelloAction = {
  stepId: SportelloStepId;
  n: number;
  title: string;
  /** The only recommended click on this view. Already selected. */
  label: string;
  href: string | null;
  kind: RecommendedKind;
  helper: string;
};

/**
 * Every sportello view calls this and shows this one action, already highlighted.
 * Never two peer choices. The user only clicks.
 */
export function recommendedSportelloAction(
  bando: Bando,
  progress: SportelloProgress,
  opts?: { compact?: boolean },
): RecommendedSportelloAction {
  const steps = sportelloSteps(bando);
  const id = nextSportelloStep(steps, progress);
  const step = steps.find((s) => s.id === id) ?? steps[0];
  const official = officialPageHref(bando);
  const domanda = domandaHref(bando);
  const modulo = moduloHref(bando);
  const apply = domanda ?? modulo ?? official;

  if (id === "official") {
    return {
      stepId: "official",
      n: step.n,
      title: step.title,
      label: official ? "Apri il bando ufficiale" : "Apri il sito ufficiale",
      href: official,
      kind: "external",
      helper: step.youDo,
    };
  }

  if (id === "dossier") {
    return {
      stepId: "dossier",
      n: step.n,
      title: step.title,
      label: "Prepara i documenti",
      href: null,
      kind: opts?.compact ? "detail" : "dossier",
      helper: step.youDo,
    };
  }

  if (id === "check") {
    return {
      stepId: "check",
      n: step.n,
      title: step.title,
      label: official ? "Controlla sul sito ufficiale" : "Apri il sito ufficiale",
      href: official,
      kind: "external",
      helper: step.youDo,
    };
  }

  return {
    stepId: "apply",
    n: step.n,
    title: step.title,
    label: apply ? SPORTELLO_CTA : "Apri il sito ufficiale",
    href: apply,
    kind: "external",
    helper: step.youDo,
  };
}

export function browserSportelloStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export { isSportello };
