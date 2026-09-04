import type { Bando, CompanyProfile } from "./bandocore-types";
import { daysLeft as daysLeftOf, isExpired, isSportello, matchStatusMeta } from "./bando-status";

/** Avviso obbligatorio riportato su ogni resa del dossier (schermo, TXT, PDF). */
export const DOSSIER_DISCLAIMER = `AVVISO — BOZZA INFORMATIVA
Questo dossier è una bozza informativa precompilata, da verificare. Non è una domanda
inviata, non è una dichiarazione sostitutiva e non è pronta alla firma.
Prima di qualsiasi uso verifica dati, requisiti, modulistica e scadenze sulla fonte ufficiale.`;

/**
 * Allowlist stretta dei campi del profilo utilizzabili nel dossier.
 * Contatti personali (email, telefono, PEC) sono esclusi per privacy.
 */
export const ALLOWED_PROFILE_FIELDS = [
  "ragione_sociale",
  "partita_iva",
  "forma_giuridica",
  "codice_ateco",
  "regione",
  "provincia",
  "comune",
  "anno_costituzione",
  "numero_dipendenti",
  "fatturato_annuo",
  "imprenditoria_femminile",
  "impresa_giovanile",
  "startup_innovativa",
  "pmi_innovativa",
  "dimensione_impresa",
  "legale_rappresentante",
] as const;

export type AllowedProfileField = (typeof ALLOWED_PROFILE_FIELDS)[number];
export type AllowedProfile = Partial<Pick<CompanyProfile, AllowedProfileField>>;

/** Filtra il profilo mantenendo solo i campi ammessi dall'allowlist. */
export function pickAllowedProfile(profile: CompanyProfile | null | undefined): AllowedProfile {
  if (!profile) return {};
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_PROFILE_FIELDS) {
    const value = (profile as unknown as Record<string, unknown>)[key];
    if (value !== undefined && value !== null && value !== "") out[key] = value;
  }
  return out as AllowedProfile;
}

export interface DossierField {
  label: string;
  value: string;
  missing?: boolean;
}

export interface DossierDocument {
  label: string;
  reason: string;
}

export interface DossierTimelineStep {
  label: string;
  date?: string;
  note: string;
}

export interface Dossier {
  bando_id: string;
  generated_at: string;
  /**
   * Fail-closed: COMPLETO solo con verifica ufficiale, scadenza futura, fonte
   * ufficiale mappata, requisiti, evidence e profilo minimo. SCADUTO se il
   * termine è superato. In ogni altro caso PARZIALE.
   */
  readiness: "COMPLETO" | "PARZIALE" | "SCADUTO";
  missing_official: string[];
  missing_profile: string[];
  cover: DossierField[];
  economics: DossierField[];
  compatibility: {
    status: "COMPATIBILE" | "DA_VERIFICARE" | "NON_COMPATIBILE";
    /** Vero solo quando il testo ufficiale consente un giudizio: mai «Da verificare». */
    visible: boolean;
    label: string;
    score: number | null;
    confirmed: string[];
    blockers: string[];
    to_check: string[];
  };

  requirements: string[];
  documents: DossierDocument[];
  timeline: DossierTimelineStep[];
  channel: DossierField[];
  rarity: { poco_diffusa: boolean; source_kind?: string; rarity_score?: number; note?: string };
  evidence: Array<{ title: string; url: string; type: string }>;
  cover_letter: string;
  missing_before_use: string[];
}

const REQUIRED_OFFICIAL: Array<{ key: keyof Bando; label: string }> = [
  { key: "titolo", label: "Titolo ufficiale del bando" },
  { key: "ente", label: "Ente erogatore" },
  { key: "scadenza", label: "Data di scadenza" },
];

const REQUIRED_PROFILE: Array<{ key: AllowedProfileField; label: string }> = [
  { key: "ragione_sociale", label: "Ragione sociale" },
  { key: "partita_iva", label: "Partita IVA" },
  { key: "forma_giuridica", label: "Forma giuridica" },
  { key: "codice_ateco", label: "Codice ATECO principale" },
  { key: "regione", label: "Regione della sede" },
  { key: "comune", label: "Comune della sede" },
  { key: "legale_rappresentante", label: "Legale rappresentante" },
];

function it(value: number): string {
  return new Intl.NumberFormat("it-IT").format(value);
}

function date(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const t = new Date(value);
  return Number.isFinite(t.getTime()) ? t.toLocaleDateString("it-IT") : undefined;
}

/**
 * Fonte ufficiale primaria ai fini della readiness: official_url, poi notice_url.
 * application_url / piattaforma_url sono canali di presentazione e non valgono
 * come prova della fonte ufficiale.
 */
export function officialUrl(bando: Bando): string | undefined {
  return bando.official_url || bando.notice_url || undefined;
}

/** Una riga esiste solo se il dato ufficiale esiste: niente «dato non disponibile». */
function field(label: string, value: string | undefined): DossierField | null {
  return value && value.trim() ? { label, value: value.trim() } : null;
}

function fields(...items: Array<DossierField | null>): DossierField[] {
  return items.filter((f): f is DossierField => f !== null);
}

/** Un requisito è un allegato quando il testo ufficiale nomina un documento. */
const ATTACHMENT_HINT =
  /\b(allegat|modulo|modulistica|modello|dichiarazione|documento|documentazione|scheda|format|relazione|prospetto|preventiv|business plan|formulario|domanda\s+di)/i;

/**
 * Solo allegati realmente presenti nel testo ufficiale del bando.
 * Nessun documento inventato (visura, DURC, de minimis, carta d'identità).
 */
export function officialAttachments(bando: Bando): DossierDocument[] {
  const items = (bando.requisiti ?? [])
    .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
    .map((r) => r.trim())
    .filter((r) => ATTACHMENT_HINT.test(r));
  const seen = new Set<string>();
  const docs: DossierDocument[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    docs.push({ label: item, reason: "Indicato nel testo ufficiale del bando" });
  }
  return docs;
}


export function buildTimeline(bando: Bando, now = Date.now()): DossierTimelineStep[] {
  const steps: DossierTimelineStep[] = [];
  const apertura = date(bando.apertura);
  const scadenza = date(bando.scadenza);
  const left = daysLeftOf(bando, now);
  if (apertura) steps.push({ label: "Apertura sportello", date: apertura, note: "Data indicata dalla fonte" });
  steps.push({
    label: "Lettura del bando ufficiale",
    note: "Primo passo prima di ogni altra attività",
  });
  steps.push({
    label: "Raccolta degli allegati richiesti dal bando",
    note: "Tempi variabili in base alla documentazione richiesta",
  });
  steps.push({
    label: "Compilazione della modulistica ufficiale",
    note: bando.modulistica_url ? "Usa i moduli pubblicati dall'ente" : "Moduli sulla fonte ufficiale",
  });
  if (bando.click_day) {
    steps.push({ label: "Preparazione al click day", note: "Procedura a sportello: prepara tutto in anticipo" });
  }
  if (scadenza) {
    steps.push({
      label: "Scadenza presentazione",
      date: scadenza,
      note: isExpired(bando, now)
        ? "Termine già superato secondo i dati disponibili"
        : left !== null
          ? `${left} giorni residui`
          : "Termine indicato dalla fonte",
    });
  }

  return steps;
}

export const PROFILE_FIELD_MISSING = "— non presente nel profilo";

export function buildCoverLetter(bando: Bando, profile: AllowedProfile): string {
  const sede = [profile.comune, profile.provincia ? `(${profile.provincia})` : undefined, profile.regione]
    .filter(Boolean)
    .join(" ");
  const v = (value: string | number | undefined | null) =>
    value === undefined || value === null || value === "" ? PROFILE_FIELD_MISSING : String(value);
  // Clausole dimensionali: presenti solo se il dato esiste davvero nel profilo.
  const dimensionali = [
    profile.anno_costituzione !== undefined ? `anno di costituzione ${profile.anno_costituzione}` : null,
    profile.numero_dipendenti !== undefined ? `dipendenti ${profile.numero_dipendenti}` : null,
    typeof profile.fatturato_annuo === "number" ? `fatturato annuo € ${it(profile.fatturato_annuo)}` : null,
    profile.dimensione_impresa ? `dimensione ${profile.dimensione_impresa}` : null,
  ].filter(Boolean) as string[];

  const lines = [
    `Oggetto: manifestazione di interesse — ${bando.titolo}`,
    "",
    `Spett.le ${bando.ente},`,
    "",
    `l'impresa ${v(profile.ragione_sociale)}, partita IVA ${v(profile.partita_iva)}, ` +
      `forma giuridica ${v(profile.forma_giuridica)}, codice ATECO principale ${v(profile.codice_ateco)}, ` +
      `con sede in ${sede || PROFILE_FIELD_MISSING}, manifesta interesse alla misura in oggetto.`,
    "",
    ...(dimensionali.length
      ? [`Dati dimensionali dichiarati nel profilo: ${dimensionali.join(", ")}.`, ""]
      : []),
    `Referente indicato: ${v(profile.legale_rappresentante)}.`,
    "",
    "I dati sopra riportati provengono dal profilo aziendale inserito in UEradar.com e vanno",
    "verificati e integrati con la modulistica ufficiale dell'ente prima di qualsiasi utilizzo.",
  ];
  return lines.join("\n");
}


/** Dati ufficiali minimi mancanti nel bando ricevuto dal feed (fail-closed). */
export function missingOfficialData(bando: Bando, now: number = Date.now()): string[] {
  const sportello = isSportello(bando);
  const missing = REQUIRED_OFFICIAL.filter(
    (f) => !bando[f.key] && !(sportello && f.key === "scadenza"),
  ).map((f) => f.label);
  if (!officialUrl(bando)) missing.push("URL della fonte ufficiale (official_url / notice_url)");
  if (bando.verification_status !== "VERIFICATO" && !sportello) {
    missing.push(
      bando.verification_status
        ? `Verifica ufficiale non completata (stato: ${bando.verification_status})`
        : "Stato di verifica ufficiale assente",
    );
  }
  if (!(bando.requisiti ?? []).length) missing.push("Elenco requisiti del bando");
  if (!(bando.evidence ?? []).some((e) => e?.source_url)) missing.push("Evidenza documentale ufficiale");
  if (bando.scadenza && isExpired(bando, now)) missing.push("Termine di presentazione già superato");
  return missing;
}

export function buildDossier(
  bando: Bando,
  rawProfile: CompanyProfile | null | undefined,
  now: number = Date.now(),
): Dossier {
  const profile = pickAllowedProfile(rawProfile);
  const expiredNow = isExpired(bando, now);
  const missing_official = missingOfficialData(bando, now);
  const missing_profile = REQUIRED_PROFILE.filter((f) => profile[f.key] === undefined).map((f) => f.label);

  const left = daysLeftOf(bando, now);
  const expired = expiredNow;
  const meta = matchStatusMeta(bando.match?.status);

  const cover: DossierField[] = fields(
    field("Titolo", bando.titolo),
    field("Ente erogatore", bando.ente),
    field("Ultima verifica", date(bando.last_verified_at)),
    field("URL ufficiale", officialUrl(bando)),
    field("Riferimento / codice programma", bando.programme_code ?? bando.programme_name ?? bando.id),
    field("Apertura", date(bando.apertura)),
    field("Scadenza", date(bando.scadenza)),
    field(
      "Giorni residui",
      expired ? "Termine superato" : left !== null ? `${left} giorni` : undefined,
    ),
  );

  const economics: DossierField[] = fields(
    field("Importo massimo", typeof bando.importo_max === "number" ? `€ ${it(bando.importo_max)}` : undefined),
    field(
      "Intensità aiuto",
      typeof bando.aid_intensity_percent === "number" ? `${bando.aid_intensity_percent}%` : undefined,
    ),
    field("Budget totale", typeof bando.total_budget === "number" ? `€ ${it(bando.total_budget)}` : undefined),
    field("Spese ammissibili", bando.eligible_expenses?.length ? bando.eligible_expenses.join("; ") : undefined),
  );

  // Modulistica ufficiale: stampiamo l'URL solo se il bando lo pubblica davvero.
  const channel: DossierField[] = fields(
    field("Piattaforma di presentazione", bando.piattaforma_url),
    field("Modulistica ufficiale", bando.modulistica_url),
    field("PEC ufficio protocollo", bando.ufficio_protocollo_pec ?? bando.pec),
    field("Ente attuatore", bando.implementing_body),
  );

  const missing_before_use = [
    ...missing_official.map((m) => `Dato ufficiale mancante: ${m}`),
    ...missing_profile.map((m) => `Dato di profilo mancante: ${m}`),
  ];

  return {
    bando_id: bando.id,
    generated_at: new Date(now).toISOString(),
    readiness: expiredNow
      ? "SCADUTO"
      : missing_official.length === 0 && missing_profile.length === 0
        ? "COMPLETO"
        : "PARZIALE",
    missing_official,
    missing_profile,
    cover,
    economics,
    compatibility: {
      status: meta.status,
      // Senza ATECO nel testo ufficiale non esprimiamo un giudizio: nessuna etichetta.
      visible: meta.status !== "DA_VERIFICARE",
      label: meta.status === "DA_VERIFICARE" ? "" : meta.label,
      score: meta.status === "DA_VERIFICARE" ? null : (bando.match?.score ?? null),
      confirmed: meta.status === "DA_VERIFICARE" ? [] : (bando.match?.confirmed ?? []),
      blockers: bando.match?.blockers ?? [],
      to_check: [],
    },
    requirements: (bando.requisiti ?? [])
      .filter((r): r is string => typeof r === "string" && r.trim().length > 0)
      .map((r) => r.trim()),

    documents: officialAttachments(bando),

    timeline: buildTimeline(bando, now),
    channel,
    rarity: {
      poco_diffusa: Boolean(bando.is_hidden) || (bando.rarity_score ?? 0) >= 4,
      source_kind: bando.source_kind,
      rarity_score: bando.rarity_score,
      note: bando.fonte_extratestuale,
    },
    // Igiene fonti: mai stampare una riga senza URL reale.
    evidence: (bando.evidence ?? [])
      .filter((e) => typeof e?.source_url === "string" && e.source_url.trim().length > 0)
      .map((e) => ({
        title: e.source_title || "Documento ufficiale",
        url: e.source_url.trim(),
        type: e.evidence_type,
      })),
    cover_letter: buildCoverLetter(bando, profile),
    missing_before_use,
  };
}

function block(title: string, lines: string[]): string {
  if (!lines.length) return "";
  return [`── ${title} ──`, ...lines, ""].join("\n");
}

/** Titolo unico (schermo, TXT, PDF) dell'elenco dei dati ancora da completare. */
export const MISSING_BEFORE_USE_TITLE = "Da completare prima dell'uso";

/** Resa testuale del dossier: usata sia per la copia sia per il download TXT. */
export type DossierRenderOptions = { watermarked?: boolean };

/** Filigrana della prova gratuita: deve comparire nell'output, non solo nella UI. */
export const TRIAL_WATERMARK =
  "ANTEPRIMA PROVA GRATUITA — DOCUMENTO FILIGRANATO, NON UTILIZZABILE PER LA PRESENTAZIONE";

export function renderDossierText(d: Dossier, options: DossierRenderOptions = {}): string {
  const mark = options.watermarked ? TRIAL_WATERMARK : "";
  return [
    mark,
    "DOSSIER CANDIDATURA (BOZZA) — UEradar.com",
    DOSSIER_DISCLAIMER,
    "",
    `Riferimento interno: ${d.bando_id}`,
    "",
    block(
      "COPERTINA",
      d.cover.map((f) => `${f.label}: ${f.value}`),
    ),
    block(
      "SINTESI ECONOMICA",
      d.economics.map((f) => `${f.label}: ${f.value}`),
    ),
    d.compatibility.visible
      ? block("COMPATIBILITÀ PROFILO", [
          `Stato: ${d.compatibility.label}${d.compatibility.score !== null ? ` (${d.compatibility.score}%)` : ""}`,
          ...d.compatibility.confirmed.map((x) => `Confermato: ${x}`),
          ...d.compatibility.blockers.map((x) => `Ostacolo: ${x}`),
        ])
      : "",
    block(
      "CHECKLIST REQUISITI",
      d.requirements.map((r, i) => `${i + 1}. ${r}`),
    ),
    block(
      "ALLEGATI UFFICIALI DEL BANDO",
      d.documents.map((doc, i) => `${i + 1}. ${doc.label}`),
    ),
    block(
      "TIMELINE OPERATIVA",
      d.timeline.map((s) => `${s.date ? `${s.date} — ` : ""}${s.label}: ${s.note}`),
    ),
    block(
      "CANALE UFFICIALE",
      d.channel.map((f) => `${f.label}: ${f.value}`),
    ),
    d.rarity.poco_diffusa
      ? block("FONTE POCO DIFFUSA", [
          `Tipo fonte: ${d.rarity.source_kind ?? "documento ufficiale"}`,
          d.rarity.rarity_score ? `Indice diffusione: ${d.rarity.rarity_score}/5` : "",
          d.rarity.note ? `Nota: ${d.rarity.note}` : "",
        ].filter(Boolean))
      : "",
    d.evidence.length
      ? block(
          "PROVE E FONTI UFFICIALI",
          d.evidence.map((e) => `${e.title} (${e.type}): ${e.url}`),
        )
      : "",
    block("TESTO ISTANZA / LETTERA DI ACCOMPAGNAMENTO", [d.cover_letter]),
    block(
      MISSING_BEFORE_USE_TITLE.toUpperCase(),
      d.missing_before_use.map((m, i) => `${i + 1}. ${m}`),
    ),

    DOSSIER_DISCLAIMER,
    mark,
  ]
    .filter(Boolean)
    .join("\n");
}
