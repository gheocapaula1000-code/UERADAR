import type { Bando, CompanyProfile, PdfFieldMapping } from "./bandocore-types";
import {
  ALLOWED_PROFILE_FIELDS,
  pickAllowedProfile,
  type AllowedProfile,
  type AllowedProfileField,
} from "./dossier";

/** Avviso obbligatorio su ogni resa della bozza per il modulo ufficiale. */
export const DRAFT_DISCLAIMER = `AVVISO — BOZZA INFORMATIVA
Questo testo è una bozza informativa precompilata, da verificare. Non è una domanda
inviata, non è una dichiarazione sostitutiva e non è pronta alla firma.
Prima di qualsiasi uso verifica dati, requisiti, modulistica e scadenze sulla fonte ufficiale.`;

export const OFFICIAL_MODULE_FIRMA_NOTE =
  "Firma, date di impegno e dichiarazioni: da compilare esclusivamente sul modulo ufficiale dopo verifica.";

const CONTACT_KEYS = ["email_referente", "telefono", "pec"] as const;

/** Etichette italiane oneste, allineate al dossier. */
export const OFFICIAL_MODULE_FIELD_LABELS: Record<AllowedProfileField, string> = {
  ragione_sociale: "Ragione sociale",
  partita_iva: "Partita IVA",
  forma_giuridica: "Forma giuridica",
  codice_ateco: "Codice ATECO principale",
  regione: "Regione della sede",
  provincia: "Provincia della sede",
  comune: "Comune della sede",
  anno_costituzione: "Anno di costituzione",
  numero_dipendenti: "Numero dipendenti",
  fatturato_annuo: "Fatturato annuo",
  imprenditoria_femminile: "Imprenditoria femminile",
  impresa_giovanile: "Impresa giovanile",
  startup_innovativa: "Startup innovativa",
  pmi_innovativa: "PMI innovativa",
  dimensione_impresa: "Dimensione impresa",
  legale_rappresentante: "Legale rappresentante",
};

/** Ordine della lista copiabile: i campi già usati dal dossier, poi gli altri ammessi. */
const LIST_FIELD_ORDER: AllowedProfileField[] = [
  "ragione_sociale",
  "partita_iva",
  "codice_ateco",
  "comune",
  "provincia",
  "regione",
  "forma_giuridica",
  "legale_rappresentante",
  "anno_costituzione",
  "numero_dipendenti",
  "fatturato_annuo",
  "imprenditoria_femminile",
  "impresa_giovanile",
  "startup_innovativa",
  "pmi_innovativa",
  "dimensione_impresa",
];

const FIELD_ALIASES: Record<AllowedProfileField, string[]> = {
  ragione_sociale: [
    "ragione sociale",
    "denominazione sociale",
    "denominazione",
    "nome impresa",
    "nome azienda",
    "denominazione impresa",
  ],
  partita_iva: ["partita iva", "p iva", "piva", "partitaiva"],
  forma_giuridica: ["forma giuridica", "natura giuridica", "forma societaria", "tipo societa"],
  codice_ateco: ["codice ateco", "ateco", "codice ateco principale", "ateco principale"],
  regione: ["regione", "regione sede", "regione sede legale"],
  provincia: ["provincia", "provincia sede", "provincia sede legale"],
  comune: ["comune", "comune sede", "comune sede legale", "citta sede"],
  anno_costituzione: [
    "anno costituzione",
    "anno di costituzione",
    "data costituzione",
    "data di costituzione",
  ],
  numero_dipendenti: [
    "numero dipendenti",
    "n dipendenti",
    "dipendenti",
    "numero addetti",
    "addetti",
  ],
  fatturato_annuo: ["fatturato annuo", "fatturato", "volume d affari"],
  imprenditoria_femminile: [
    "imprenditoria femminile",
    "impresa femminile",
    "a prevalenza femminile",
  ],
  impresa_giovanile: ["impresa giovanile", "imprenditoria giovanile"],
  startup_innovativa: ["startup innovativa", "start up innovativa"],
  pmi_innovativa: ["pmi innovativa"],
  dimensione_impresa: ["dimensione impresa", "dimensione aziendale"],
  legale_rappresentante: [
    "legale rappresentante",
    "rappresentante legale",
    "nominativo legale rappresentante",
  ],
};

const ALIAS_EXTRAS = [
  "sede",
  "sede legale",
  "impresa",
  "richiedente",
  "azienda",
  "societa",
  "societa richiedente",
  "principale",
];

const SEDE_ALIASES = ["sede", "sede legale", "sede impresa", "luogo sede", "sede della societa"];

export interface OfficialModuleListItem {
  label: string;
  value: string;
  missing: boolean;
  profileField?: AllowedProfileField | "sede";
}

export interface PdfFormFieldInfo {
  name: string;
  label?: string;
  type: "text" | "checkbox" | "radio" | "dropdown" | "signature" | "button" | "other";
}

export type OfficialFillTarget =
  | { kind: "profile"; field: AllowedProfileField }
  | { kind: "sede" };

export interface PlannedFill {
  fieldName: string;
  value: string;
  target: OfficialFillTarget;
  source: "mapping" | "label";
}

export interface OfficialFillPlan {
  fills: PlannedFill[];
  leftEmpty: Array<{ fieldName: string; reason: string }>;
}

export type ApplyChannelBando = Pick<
  Bando,
  "modulistica_url" | "application_url" | "piattaforma_url" | "official_url" | "notice_url"
>;

function presentUrl(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sameHref(left: string, right: string): boolean {
  const normalize = (raw: string): string => {
    try {
      const url = new URL(raw);
      url.hash = "";
      url.pathname = url.pathname.replace(/\/+$/, "") || "/";
      return url.toString();
    } catch {
      return raw.replace(/\/+$/, "");
    }
  };
  return normalize(left) === normalize(right);
}

/** Solo URL che il Core ha etichettato come modulistica: mai official_url. */
export function realFormsUrl(bando: ApplyChannelBando | null | undefined): string | undefined {
  return presentUrl(bando?.modulistica_url);
}

/** Solo URL che il Core ha etichettato come domanda: mai official_url. */
export function realApplicationUrl(bando: ApplyChannelBando | null | undefined): string | undefined {
  const apply = presentUrl(bando?.application_url);
  if (apply) return apply;
  const platform = presentUrl(bando?.piattaforma_url);
  const official = presentUrl(bando?.official_url) ?? presentUrl(bando?.notice_url);
  if (!platform) return undefined;
  if (official && sameHref(platform, official)) return undefined;
  return platform;
}

export function hasOfficialModulistica(bando: ApplyChannelBando | null | undefined): boolean {
  return Boolean(realFormsUrl(bando) || realApplicationUrl(bando));
}

export function countRealApplyLinks(bandi: ApplyChannelBando[]): {
  total: number;
  withForms: number;
  withApply: number;
  withEither: number;
  dossierOnly: number;
} {
  let withForms = 0;
  let withApply = 0;
  let withEither = 0;
  for (const bando of bandi) {
    const forms = Boolean(realFormsUrl(bando));
    const apply = Boolean(realApplicationUrl(bando));
    if (forms) withForms += 1;
    if (apply) withApply += 1;
    if (forms || apply) withEither += 1;
  }
  return {
    total: bandi.length,
    withForms,
    withApply,
    withEither,
    dossierOnly: bandi.length - withEither,
  };
}

export function looksLikePdfUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().split("?")[0].endsWith(".pdf");
  } catch {
    return false;
  }
}

/** Classificazione senza rete: i 5 bandi live cadono su HTML. */
export function classifyModulisticaHint(url: string | undefined | null): "missing" | "likely_pdf" | "likely_html" {
  if (!url?.trim()) return "missing";
  return looksLikePdfUrl(url.trim()) ? "likely_pdf" : "likely_html";
}

export function classifyFetchedDocument(
  contentType: string | null | undefined,
  bytes: Uint8Array,
): "pdf" | "html" | "unsupported" {
  if (bytes.length >= 5) {
    const magic = new TextDecoder("latin1").decode(bytes.subarray(0, 5));
    if (magic === "%PDF-") return "pdf";
    const sniff = new TextDecoder("utf-8").decode(bytes.subarray(0, 280)).trimStart().toLowerCase();
    if (sniff.startsWith("<!doctype html") || sniff.startsWith("<html") || sniff.startsWith("<head")) {
      return "html";
    }
  }
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("application/pdf")) return "pdf";
  if (ct.includes("text/html") || ct.includes("application/xhtml")) return "html";
  return "unsupported";
}

export function isPublicHttpsUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".internal") ||
    host.endsWith(".local")
  ) {
    return false;
  }
  if (/^(10\.|192\.168\.|169\.254\.|127\.)/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
  return true;
}

export function formatSede(profile: AllowedProfile): string | undefined {
  const parts = [
    profile.comune,
    profile.provincia ? `(${profile.provincia})` : undefined,
    profile.regione,
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

export function formatOfficialModuleValue(
  field: AllowedProfileField,
  profile: AllowedProfile,
): string | undefined {
  const value = profile[field];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value ? "Sì" : "No";
  if (field === "fatturato_annuo" && typeof value === "number") {
    return `EUR ${new Intl.NumberFormat("it-IT").format(value)}`;
  }
  if (typeof value === "number") return new Intl.NumberFormat("it-IT").format(value);
  return String(value);
}

function normalizeLabel(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(raw: string): string {
  return normalizeLabel(raw).replace(/ /g, "");
}

function fieldCandidates(name: string, label?: string): string[] {
  const raw = [name, label].filter((x): x is string => Boolean(x?.trim()));
  const out: string[] = [];
  for (const r of raw) {
    out.push(r);
    const segments = r.split(".").map((seg) => seg.replace(/\[\d+\]/g, "")).filter(Boolean);
    const last = segments[segments.length - 1];
    if (last && last !== r) out.push(last);
    const stripped = last?.replace(/^(txt|fld|campo|input)_?/i, "");
    if (stripped && stripped !== last) out.push(stripped);
  }
  return out;
}

function isCommitmentDate(normalized: string): boolean {
  if (normalized === "data" || normalized === "data odierna" || normalized === "oggi" || normalized === "data di oggi") {
    return true;
  }
  return /firma|sottoscr|impegno|luogo e data|luogo data/.test(normalized) && /\bdata\b/.test(normalized);
}

function isDeniedNormalized(normalized: string): boolean {
  if (!normalized) return true;
  if (
    /\b(e ?mail|posta elettronica|telefono|cellulare|fax|pec)\b/.test(normalized) ||
    normalized === "tel" ||
    normalized === "mail"
  ) {
    return true;
  }
  if (/dichiar|ai sensi|dpr|consenso|privacy|gdpr|informativa|sottoscr|firma|signature|sigillo/.test(normalized)) {
    return true;
  }
  if (/importo richiest|contributo richiest|agevolazione|intensita aiuto|importo contributo/.test(normalized)) {
    return true;
  }
  if (/\b(indirizzo|viale|piazza|civico)\b/.test(normalized) || /(^| )via( |$)/.test(normalized) || /(^| )cap( |$)/.test(normalized)) {
    return true;
  }
  if (/\bcodice fiscale\b|\bcf\b/.test(normalized) && !/\bpartita iva\b/.test(normalized)) return true;
  return isCommitmentDate(normalized);
}

export function isDeniedPdfField(field: Pick<PdfFormFieldInfo, "name" | "label" | "type">): boolean {
  if (field.type === "signature" || field.type === "checkbox" || field.type === "button" || field.type === "radio") {
    return true;
  }
  return fieldCandidates(field.name, field.label).some((c) => isDeniedNormalized(normalizeLabel(c)));
}

function aliasHits(normalized: string, alias: string): boolean {
  if (normalized === alias) return true;
  if (compact(normalized) === compact(alias)) return true;
  for (const extra of ALIAS_EXTRAS) {
    if (normalized === `${alias} ${extra}` || normalized === `${extra} ${alias}`) return true;
  }
  return false;
}

export function matchOfficialFieldTarget(
  name: string,
  label?: string,
): OfficialFillTarget | undefined {
  const candidates = fieldCandidates(name, label).map(normalizeLabel).filter(Boolean);
  if (candidates.some(isDeniedNormalized)) return undefined;

  for (const n of candidates) {
    if (SEDE_ALIASES.some((alias) => aliasHits(n, alias))) return { kind: "sede" };
  }

  for (const field of ALLOWED_PROFILE_FIELDS) {
    const aliases = FIELD_ALIASES[field];
    if (candidates.some((n) => aliases.some((alias) => aliasHits(n, alias)))) {
      return { kind: "profile", field };
    }
  }
  return undefined;
}

function mappingTarget(profileField: PdfFieldMapping["profile_field"]): OfficialFillTarget | undefined {
  if (profileField === "firma" || profileField === "data_odierna") return undefined;
  if ((CONTACT_KEYS as readonly string[]).includes(profileField)) return undefined;
  if (!(ALLOWED_PROFILE_FIELDS as readonly string[]).includes(profileField)) return undefined;
  return { kind: "profile", field: profileField as AllowedProfileField };
}

function mappingMatchesField(mapping: PdfFieldMapping, field: PdfFormFieldInfo): boolean {
  const label = normalizeLabel(mapping.pdf_label);
  if (!label) return false;
  return fieldCandidates(field.name, field.label).some((c) => {
    const n = normalizeLabel(c);
    return n === label || compact(n) === compact(label);
  });
}

function valueForTarget(target: OfficialFillTarget, profile: AllowedProfile): string | undefined {
  if (target.kind === "sede") return formatSede(profile);
  return formatOfficialModuleValue(target.field, profile);
}

export function planOfficialPdfFill(opts: {
  fields: PdfFormFieldInfo[];
  profile: CompanyProfile | null | undefined;
  mapping?: PdfFieldMapping[] | null;
}): OfficialFillPlan {
  const profile = pickAllowedProfile(opts.profile);
  const mapping = opts.mapping ?? [];
  const fills: PlannedFill[] = [];
  const leftEmpty: OfficialFillPlan["leftEmpty"] = [];

  for (const field of opts.fields) {
    if (field.type !== "text") {
      leftEmpty.push({ fieldName: field.name, reason: "campo non testuale: lasciato vuoto" });
      continue;
    }
    if (isDeniedPdfField(field)) {
      leftEmpty.push({ fieldName: field.name, reason: "firma, dichiarazione, contatto o dato non compilabile" });
      continue;
    }

    const mapped = mapping.find((m) => mappingMatchesField(m, field));
    const target = (mapped ? mappingTarget(mapped.profile_field) : undefined) ?? matchOfficialFieldTarget(field.name, field.label);
    if (!target) {
      leftEmpty.push({ fieldName: field.name, reason: "nessuna corrispondenza chiara con il profilo" });
      continue;
    }
    const value = valueForTarget(target, profile);
    if (!value) {
      leftEmpty.push({ fieldName: field.name, reason: "dato assente dal profilo" });
      continue;
    }
    fills.push({
      fieldName: field.name,
      value,
      target,
      source: mapped && mappingTarget(mapped.profile_field) ? "mapping" : "label",
    });
  }

  return { fills, leftEmpty };
}

export function buildOfficialModuleList(
  profile: CompanyProfile | null | undefined,
  mapping?: PdfFieldMapping[] | null,
): OfficialModuleListItem[] {
  const allowed = pickAllowedProfile(profile);
  if (mapping?.length) {
    return mapping.map((m) => {
      const target = mappingTarget(m.profile_field);
      const value = target ? valueForTarget(target, allowed) : undefined;
      return {
        label: m.pdf_label,
        value: value ?? "",
        missing: !value,
        profileField: target?.kind === "sede" ? "sede" : target?.field,
      };
    });
  }

  const items: OfficialModuleListItem[] = [
    listItem("ragione_sociale", allowed),
    listItem("partita_iva", allowed),
    listItem("codice_ateco", allowed),
    {
      label: "Sede (comune/provincia/regione)",
      value: formatSede(allowed) ?? "",
      missing: !formatSede(allowed),
      profileField: "sede",
    },
  ];
  for (const field of LIST_FIELD_ORDER) {
    if (field === "ragione_sociale" || field === "partita_iva" || field === "codice_ateco") continue;
    items.push(listItem(field, allowed));
  }
  return items;
}

function listItem(field: AllowedProfileField, profile: AllowedProfile): OfficialModuleListItem {
  const value = formatOfficialModuleValue(field, profile);
  return {
    label: OFFICIAL_MODULE_FIELD_LABELS[field],
    value: value ?? "",
    missing: !value,
    profileField: field,
  };
}

export function renderOfficialModuleText(
  bando: Pick<Bando, "titolo" | "ente" | "modulistica_url" | "application_url" | "pdf_field_mapping">,
  profile: CompanyProfile | null | undefined,
): string {
  const items = buildOfficialModuleList(profile, bando.pdf_field_mapping);
  const lines = items.map((item) =>
    item.missing ? `${item.label}: — non presente nel profilo` : `${item.label}: ${item.value}`,
  );
  const pages = [
    bando.modulistica_url ? `Modulistica: ${bando.modulistica_url}` : null,
    bando.application_url ? `Presentazione: ${bando.application_url}` : null,
  ].filter(Boolean);
  return `BOZZA DATI PER MODULO UFFICIALE — ${bando.titolo}
${DRAFT_DISCLAIMER}

Ente: ${bando.ente}
${pages.join("\n") || "Nessun URL di modulistica o presentazione distinto dalla scheda ufficiale."}

── Campi da inserire nel modulo ufficiale ──
${lines.join("\n")}

${OFFICIAL_MODULE_FIRMA_NOTE}
`;
}

export function resolveModulisticaFetchTarget(
  bando: ApplyChannelBando | null | undefined,
): { ok: true; url: string } | { ok: false; kind: "missing" | "invalid_url" } {
  const raw = realFormsUrl(bando) ?? realApplicationUrl(bando);
  if (!raw) return { ok: false, kind: "missing" };
  try {
    const url = new URL(raw);
    if (url.protocol === "http:") url.protocol = "https:";
    const href = url.toString();
    if (!isPublicHttpsUrl(href)) return { ok: false, kind: "invalid_url" };
    return { ok: true, url: href };
  } catch {
    return { ok: false, kind: "invalid_url" };
  }
}

const MAX_OFFICIAL_BYTES = 6_000_000;

export async function readLimitedBytes(res: Response, maxBytes = MAX_OFFICIAL_BYTES): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("TOO_LARGE");
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new Error("TOO_LARGE");
  return buf;
}

export async function fetchOfficialDocument(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<
  | { kind: "pdf"; bytes: Uint8Array; contentType: string; url: string }
  | { kind: "html"; url: string }
  | { kind: "unsupported"; url: string; reason: string }
  | { kind: "error"; reason: string }
> {
  try {
    let current = url;
    let res: Response | undefined;
    for (let hop = 0; hop < 4; hop++) {
      if (!isPublicHttpsUrl(current)) return { kind: "error", reason: "BLOCKED_URL" };
      res = await fetcher(current, {
        method: "GET",
        redirect: "manual",
        headers: { Accept: "application/pdf,text/html;q=0.8,*/*;q=0.5" },
        signal: AbortSignal.timeout(12_000),
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { kind: "error", reason: "REDIRECT_INVALID" };
        current = new URL(loc, current).toString();
        continue;
      }
      break;
    }
    if (!res || res.status >= 300) return { kind: "error", reason: `HTTP_${res?.status ?? "0"}` };
    const bytes = await readLimitedBytes(res);
    const contentType = res.headers.get("content-type") ?? "";
    const kind = classifyFetchedDocument(contentType, bytes);
    if (kind === "pdf") return { kind: "pdf", bytes, contentType, url: current };
    if (kind === "html") return { kind: "html", url: current };
    return { kind: "unsupported", url: current, reason: contentType || "UNKNOWN_TYPE" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "FETCH_FAILED";
    return { kind: "error", reason: message === "TOO_LARGE" ? "TOO_LARGE" : "FETCH_FAILED" };
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
