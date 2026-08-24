import type { Bando, BandoScope } from "./bandocore-types";
import { isSportello } from "./bando-status";

/**
 * Registro delle fonti core (ordine di priorità).
 * Core è la fonte di verità: un bando con `official_source` e URL ufficiale
 * valido entra anche se l'host non è ancora in questo elenco, così un nuovo
 * `official_domain` su Core non richiede un PR della PWA.
 * L'elenco resta un catalogo fail-closed per schede senza attestazione Core
 * (cache, flag assente): solo host `trovabandi_sources` o loro sottodomini.
 * Nessun comune o sito extra viene inventato. Il matching ATECO/sede resta
 * a valle e non viene allargato qui.
 */
export type CoreSourceId =
  | "veneto"
  | "invitalia"
  | "mimit"
  | "eu"
  | "padova"
  | "cciaa"
  | "gal"
  | "unioncamere"
  | "provincia"
  | "bur"
  | "regionale"
  | "nazionale"
  | "core";

export interface CoreSource {
  id: CoreSourceId;
  label: string;
  homepage: string;
  hosts: string[];
  level: BandoScope;
}

/** Bollettini ufficiali regionali presenti nel catalogo Core. */
export const CORE_BUR_HOSTS = [
  "bur.regione.emilia-romagna.it",
  "bur.regione.fvg.it",
  "bur.regione.marche.it",
  "bur.regione.umbria.it",
  "bur.regione.veneto.it",
  "bura.regione.abruzzo.it",
  "buras.regione.sardegna.it",
  "burc.regione.campania.it",
  "burl.it",
  "burp.regione.puglia.it",
] as const;

/**
 * Regioni italiane già in Core (`regione.abruzzo.it` … `regione.veneto.it`).
 * `regione.veneto.it` resta sulla fonte veneto per l'etichetta di priorità.
 */
export const CORE_REGION_HOSTS = [
  "regione.abruzzo.it",
  "regione.basilicata.it",
  "regione.calabria.it",
  "regione.campania.it",
  "regione.emilia-romagna.it",
  "regione.fvg.it",
  "regione.lazio.it",
  "regione.liguria.it",
  "regione.lombardia.it",
  "regione.marche.it",
  "regione.molise.it",
  "regione.piemonte.it",
  "regione.puglia.it",
  "regione.sardegna.it",
  "regione.sicilia.it",
  "regione.toscana.it",
  "regione.umbria.it",
  "regione.vda.it",
  "regione.veneto.it",
] as const;

/**
 * Host camerali del catalogo Core. `camcom.it` ammette `*.camcom.it` via endsWith.
 * `*.camcom.gov.it`, `camcom.bz.it`, `cameracommercio.cl.it` e Unioncamere non
 * cadono su quel suffisso: restano elencati esplicitamente.
 */
export const CORE_CAMCOM_HOSTS = [
  "camcom.it",
  "pd.camcom.it",
  "aa.camcom.it",
  "ag.camcom.it",
  "ao.camcom.it",
  "as.camcom.it",
  "ba.camcom.it",
  "basilicata.camcom.it",
  "bg.camcom.it",
  "brta.camcom.it",
  "bs.camcom.it",
  "caor.camcom.it",
  "cameracommercio.cl.it",
  "cameragransasso.camcom.it",
  "ce.camcom.it",
  "chpe.camcom.it",
  "cn.camcom.it",
  "cmp.camcom.it",
  "comolecco.camcom.it",
  "czkrvv.camcom.it",
  "dl.camcom.it",
  "emilia.camcom.it",
  "fera.camcom.it",
  "fg.camcom.it",
  "frlt.camcom.it",
  "irpiniasannio.camcom.it",
  "le.camcom.it",
  "lg.camcom.it",
  "marche.camcom.it",
  "me.camcom.it",
  "milomb.camcom.it",
  "mo.camcom.it",
  "nu.camcom.it",
  "pno.camcom.it",
  "pnud.camcom.it",
  "ptpo.camcom.it",
  "rivt.camcom.it",
  "rm.camcom.it",
  "romagna.camcom.it",
  "sa.camcom.it",
  "so.camcom.it",
  "ss.camcom.it",
  "tn.camcom.it",
  "tno.camcom.it",
  "to.camcom.it",
  "tp.camcom.it",
  "umbria.camcom.it",
  "va.camcom.it",
  "vg.camcom.it",
  "vi.camcom.it",
  "vr.camcom.it",
  "bo.camcom.gov.it",
  "cs.camcom.gov.it",
  "ctrgsr.camcom.gov.it",
  "fi.camcom.gov.it",
  "ge.camcom.gov.it",
  "molise.camcom.gov.it",
  "na.camcom.gov.it",
  "paen.camcom.gov.it",
  "rc.camcom.gov.it",
  "rivlig.camcom.gov.it",
  "tb.camcom.gov.it",
  "camcom.bz.it",
] as const;

export const CORE_NATIONAL_HOSTS = [
  "agenziaentrate.gov.it",
  "incentivi.gov.it",
  "invitalia.it",
  "italiadomani.gov.it",
  "mimit.gov.it",
  "padigitale2026.gov.it",
  "gazzettaufficiale.it",
  "mase.gov.it",
  "ministeroturismo.gov.it",
  "mur.gov.it",
  "pariopportunita.gov.it",
  "politichecoesione.governo.it",
  "politichegiovanili.gov.it",
  "fondimpresa.it",
  "gse.it",
  "ice.it",
  "inail.it",
  "simest.it",
] as const;

export const CORE_EU_HOSTS = [
  "ec.europa.eu",
  "agriculture.ec.europa.eu",
  "cinea.ec.europa.eu",
  "commission.europa.eu",
  "culture.ec.europa.eu",
  "digital-strategy.ec.europa.eu",
  "eic.ec.europa.eu",
  "eismea.ec.europa.eu",
  "european-social-fund-plus.ec.europa.eu",
  "funding-tenders.ec.europa.eu",
  "interregeurope.eu",
  "research-and-innovation.ec.europa.eu",
  "europa.eu",
  "eurekanetwork.org",
] as const;

export const CORE_PROVINCE_CM_HOSTS = [
  "amministrazionetrasparente.provincia.pc.it",
  "amministrazionetrasparente.provincia.treviso.it",
  "ammtrasp.provincia.livorno.it",
  "at.provincia.brescia.it",
  "casadivetro.provincia.pu.it",
  "cittametropolitana.fi.it",
  "cittametropolitana.mi.it",
  "cittametropolitana.ve.it",
  "cittametropolitanacagliari.it",
  "dati.cittametropolitana.genova.it",
  "provincia.arezzo.it",
  "provincia.benevento.it",
  "provincia.bz.it",
  "provincia.como.it",
  "provincia.cremona.it",
  "provincia.cuneo.it",
  "provincia.fermo.it",
  "provincia.imperia.it",
  "provincia.lecco.it",
  "provincia.mantova.it",
  "provincia.padova.it",
  "provincia.pd.it",
  "provincia.perugia.it",
  "provincia.ra.it",
  "provincia.savona.it",
  "provincia.tn.it",
  "provincia.vicenza.it",
  "provinciams.etrasparenza.it",
  "provinciasondrio.it",
  "trasparenza.cittametropolitana.torino.it",
  "trasparenza.provincia.pistoia.it",
  "web.provincia.vr.it",
] as const;

export const CORE_GAL_HOSTS = [
  "baldolessinia.it",
  "farmaremma.it",
  "gal-start.it",
  "galadige.it",
  "galaltamarca.tv.it",
  "galaltobellunese.com",
  "galaretino.it",
  "galcasacastra.it",
  "galcilento.it",
  "galdeltapo.it",
  "galpartenio.it",
  "galpatavino.it",
  "galprealpidolomiti.it",
  "galterraevita.eu",
  "galterretrusche.com",
  "galvesuvioverde.it",
  "leadersiena.it",
  "montagnappennino.it",
  "montagnavicentina.com",
  "sentieridelbuonvivere.it",
  "sviluppolunigiana.it",
  "vegal.net",
] as const;

export const CORE_SOURCES: CoreSource[] = [
  {
    id: "veneto",
    label: "Regione Veneto — Bandi",
    homepage: "https://bandi.regione.veneto.it",
    hosts: ["bandi.regione.veneto.it", "regione.veneto.it"],
    level: "REGIONALE",
  },
  {
    id: "invitalia",
    label: "Invitalia — Incentivi PMI e imprese",
    homepage: "https://www.invitalia.it",
    hosts: ["invitalia.it"],
    level: "NAZIONALE",
  },
  {
    id: "mimit",
    label: "MIMIT — incentivi.gov.it",
    homepage: "https://www.incentivi.gov.it",
    hosts: ["incentivi.gov.it", "mimit.gov.it"],
    level: "NAZIONALE",
  },
  {
    id: "eu",
    label: "EU Funding & Tenders Portal",
    homepage: "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/home",
    hosts: [...CORE_EU_HOSTS],
    level: "EUROPEO",
  },
  {
    id: "padova",
    label: "Comune di Padova — Padovanet",
    homepage: "https://www.padovanet.it",
    hosts: ["padovanet.it"],
    level: "COMUNALE",
  },
  {
    id: "cciaa",
    label: "Camere di Commercio",
    homepage: "https://www.pd.camcom.it",
    hosts: [...CORE_CAMCOM_HOSTS],
    level: "CAMERALE",
  },
  {
    id: "gal",
    label: "GAL",
    homepage: "https://www.galpatavino.it",
    hosts: [...CORE_GAL_HOSTS],
    level: "COMUNALE",
  },
  {
    id: "unioncamere",
    label: "Unioncamere",
    homepage: "https://www.unioncamere.gov.it",
    hosts: ["unioncamere.gov.it", "unioncamereveneto.it"],
    level: "CAMERALE",
  },
  {
    id: "provincia",
    label: "Province e Città metropolitane",
    homepage: "https://www.provincia.pd.it",
    hosts: [...CORE_PROVINCE_CM_HOSTS],
    level: "REGIONALE",
  },
  {
    id: "bur",
    label: "Bollettini ufficiali regionali",
    homepage: "https://bur.regione.veneto.it",
    hosts: [...CORE_BUR_HOSTS],
    level: "REGIONALE",
  },
  {
    id: "regionale",
    label: "Regioni",
    homepage: "https://www.regione.toscana.it",
    hosts: CORE_REGION_HOSTS.filter((host) => host !== "regione.veneto.it"),
    level: "REGIONALE",
  },
  {
    id: "nazionale",
    label: "Amministrazioni nazionali",
    homepage: "https://www.gazzettaufficiale.it",
    hosts: CORE_NATIONAL_HOSTS.filter(
      (host) => host !== "invitalia.it" && host !== "incentivi.gov.it" && host !== "mimit.gov.it",
    ),
    level: "NAZIONALE",
  },
];

/**
 * Etichetta di rendiconto per schede che Core attesta `official_source` su un
 * host non ancora presente nel catalogo locale. Non è una fonte inventata:
 * l'ammissione resta vincolata al flag Core e a un URL ufficiale valido.
 */
export const CORE_ATTESTED_SOURCE: CoreSource = {
  id: "core",
  label: "Catalogo ufficiale Core",
  homepage: "",
  hosts: [],
  level: "NAZIONALE",
};

/**
 * Domini ufficiali noti in PWA: ammissione per uguaglianza o sottodominio
 * quando Core non ha ancora attestato `official_source`. Non è un elenco di
 * comuni inventati: è il catalogo `official_domain` verificato.
 */
export const CORE_OFFICIAL_DOMAINS: readonly string[] = Array.from(
  new Set(CORE_SOURCES.flatMap((source) => source.hosts)),
);

export const ADMITTED_LEVELS: BandoScope[] = [
  "COMUNALE",
  "CAMERALE",
  "REGIONALE",
  "NAZIONALE",
  "EUROPEO",
];

export type RejectReason =
  | "NO_TITLE"
  | "NO_AUTHORITY"
  | "NO_OFFICIAL_URL"
  | "SOURCE_NOT_CORE"
  | "LEVEL_NOT_ADMITTED"
  | "DEADLINE_PAST";

/** Buchi informativi tollerati: la scheda entra nel feed, ma dichiara cosa manca. */
export interface AdmissionGaps {
  missing_deadline: boolean;
  missing_economics: boolean;
}

export const MISSING_DEADLINE_LABEL = "Manca la scadenza nel testo ufficiale";
export const SPORTELLO_LABEL =
  "A sportello · fino a esaurimento fondi";
export const MISSING_ECONOMICS_LABEL = "Manca l'importo nel testo ufficiale";

function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Restituisce la fonte core proprietaria dell'URL ufficiale, o null. */
export function sourceForUrl(url: string | undefined | null): CoreSource | null {
  if (typeof url !== "string" || url.length === 0) return null;
  const host = hostOf(url);
  if (!host) return null;
  return (
    CORE_SOURCES.find((source) =>
      source.hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`)),
    ) ?? null
  );
}

/**
 * Fonte per l'ammissione: prima il catalogo locale, poi l'attestazione Core.
 * `official_source` da Core su un URL http(s) valido evita SOURCE_NOT_CORE
 * per host già abilitati su `trovabandi_sources` ma non ancora in PWA.
 */
export function sourceForBando(bando: Pick<Bando, "official_url" | "notice_url" | "official_source">): CoreSource | null {
  const officialUrl = bando.official_url ?? bando.notice_url;
  const listed = sourceForUrl(officialUrl);
  if (listed) return listed;
  if (bando.official_source !== true) return null;
  if (!officialUrl || !hostOf(officialUrl)) return null;
  return CORE_ATTESTED_SOURCE;
}

function hasEconomicData(bando: Bando): boolean {
  const amount = bando.importo_max;
  const intensity = bando.aid_intensity_percent;
  const expenses = bando.eligible_expenses;
  if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) return true;
  if (typeof intensity === "number" && Number.isFinite(intensity) && intensity > 0) return true;
  return Array.isArray(expenses) && expenses.length > 0;
}

function parseDate(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type Admission =
  | { ok: true; source: CoreSource; gaps: AdmissionGaps }
  | { ok: false; reason: RejectReason };

/**
 * Ammissione: nessun dato viene dedotto o inventato.
 * Obbligatori titolo, ente, URL ufficiale su fonte core (catalogo locale o
 * `official_source` attestato da Core), livello ammesso e scadenza non passata.
 * Scadenza/apertura o dato economico assenti non scartano la scheda: vengono
 * segnalati come buchi dichiarati.
 */
export function admitBando(bando: Bando, now: number = Date.now()): Admission {
  if (!bando.titolo?.trim()) return { ok: false, reason: "NO_TITLE" };
  if (!bando.ente?.trim()) return { ok: false, reason: "NO_AUTHORITY" };

  const officialUrl = bando.official_url ?? bando.notice_url;
  if (!officialUrl) return { ok: false, reason: "NO_OFFICIAL_URL" };
  const source = sourceForBando(bando);
  if (!source) return { ok: false, reason: "SOURCE_NOT_CORE" };

  if (!ADMITTED_LEVELS.includes(bando.scope)) return { ok: false, reason: "LEVEL_NOT_ADMITTED" };

  const deadline = parseDate(bando.scadenza);
  const opening = parseDate(bando.apertura);
  if (deadline !== null && deadline < now) return { ok: false, reason: "DEADLINE_PAST" };

  return {
    ok: true,
    source,
    gaps: {
      missing_deadline: deadline === null && opening === null && !isSportello(bando),
      missing_economics: !hasEconomicData(bando),
    },
  };
}

export interface AdmissionReport {
  admitted: Bando[];
  admitted_count: number;
  rejected_count: number;
  missing_deadline_count: number;
  missing_economics_count: number;
  rejected_by_reason: Partial<Record<RejectReason, number>>;
  active_sources: Array<{ id: CoreSource["id"]; label: string; count: number }>;
}

/* ------------------------------------------------------------------ *
 * Vetrina: due fasce, nessuna scheda nascosta.
 * ------------------------------------------------------------------ */

export type FeedTier = "ALTA_PRIORITA" | "DA_VERIFICARE";

/**
 * Alta priorità = (scadenza o apertura) + un dato economico.
 * Il badge match non incide: tutto il resto resta visibile in «Da verificare».
 */
export function feedTier(bando: Bando, now: number = Date.now()): FeedTier {
  const hasDate =
    parseDate(bando.scadenza) !== null ||
    parseDate(bando.apertura) !== null ||
    isSportello(bando);
  const deadline = parseDate(bando.scadenza);
  const notExpired = deadline === null || deadline >= now;
  return hasDate && notExpired && hasEconomicData(bando)
    ? "ALTA_PRIORITA"
    : "DA_VERIFICARE";
}

/** Divide il feed nelle due fasce mantenendo l'ordine ricevuto. */
export function splitFeedTiers(
  bandi: Bando[],
  now: number = Date.now(),
): { high: Bando[]; review: Bando[] } {
  const high: Bando[] = [];
  const review: Bando[] = [];
  for (const bando of bandi) {
    (feedTier(bando, now) === "ALTA_PRIORITA" ? high : review).push(bando);
  }
  return { high, review };
}

/** Applica l'ammissione all'intero feed e produce il rendiconto validi/scartati. */
export function admitFeed(bandi: Bando[], now: number = Date.now()): AdmissionReport {
  const admitted: Bando[] = [];
  const rejected_by_reason: Partial<Record<RejectReason, number>> = {};
  const counts = new Map<CoreSource["id"], number>();
  let missing_deadline_count = 0;
  let missing_economics_count = 0;

  for (const bando of bandi) {
    const verdict = admitBando(bando, now);
    if (verdict.ok) {
      admitted.push(bando);
      if (verdict.gaps.missing_deadline) missing_deadline_count += 1;
      if (verdict.gaps.missing_economics) missing_economics_count += 1;
      counts.set(verdict.source.id, (counts.get(verdict.source.id) ?? 0) + 1);
    } else {
      rejected_by_reason[verdict.reason] = (rejected_by_reason[verdict.reason] ?? 0) + 1;
    }
  }

  return {
    admitted,
    admitted_count: admitted.length,
    rejected_count: bandi.length - admitted.length,
    missing_deadline_count,
    missing_economics_count,
    rejected_by_reason,
    active_sources: [...CORE_SOURCES, CORE_ATTESTED_SOURCE]
      .filter((source) => (counts.get(source.id) ?? 0) > 0)
      .map((source) => ({
        id: source.id,
        label: source.label,
        count: counts.get(source.id) ?? 0,
      })),
  };
}
