export type LegalForm = "DITTA_INDIVIDUALE" | "SRL" | "SRLS" | "SPA" | "SAS" | "SNC" | "ALTRO";

export interface CompanyProfile {
  id?: string;
  user_id?: string;
  ragione_sociale: string;
  partita_iva: string;
  forma_giuridica: LegalForm;
  codice_ateco: string;
  regione: string;
  provincia: string;
  comune: string;
  codice_istat?: string | null;
  numero_dipendenti: number;
  fatturato_annuo: number;
  anno_costituzione: number;
  imprenditoria_femminile: boolean;
  impresa_giovanile?: boolean;
  startup_innovativa?: boolean;
  pmi_innovativa?: boolean;
  dimensione_impresa?: "MICRO" | "PICCOLA" | "MEDIA" | "GRANDE";
  ateco_secondari?: string[];
  investimenti_previsti?: string[];
  spesa_prevista?: number | null;
  de_minimis_ultimi_3_anni?: number | null;
  impresa_in_difficolta?: boolean;
  paese_sede?: string;
  disponibile_consorzio_europeo?: boolean;
  legale_rappresentante?: string | null;
  email_referente?: string | null;
  telefono?: string | null;
  pec?: string | null;
}

/** Unica fonte di verità per le categorie bando: filtri e UI derivano da qui. */
export const BANDO_CATEGORIES = [
  "FONDO_PERDUTO",
  "FINANZIAMENTO_AGEVOLATO",
  "TASSO_ZERO",
  "CREDITO_IMPOSTA",
  "IMPRENDITORIA_FEMMINILE",
  "IMPRENDITORIA_GIOVANILE",
  "DIGITALIZZAZIONE",
  "TRANSIZIONE_ENERGETICA",
  "RICERCA_SVILUPPO",
  "INTERNAZIONALIZZAZIONE",
  "STARTUP_INNOVAZIONE",
  "FORMAZIONE_OCCUPAZIONE",
  "AGRICOLTURA_RURALE",
  "TURISMO_CULTURA",
  "ECONOMIA_CIRCOLARE",
  "GARANZIA",
  "VOUCHER",
  "ALTRO",
] as const;

export type BandoCategory = (typeof BANDO_CATEGORIES)[number];

export type BandoScope = "COMUNALE" | "CAMERALE" | "REGIONALE" | "NAZIONALE" | "EUROPEO";

/**
 * Mappatura dei campi PDF nativi della PA restituita dal Proxy-Core.
 * Ogni chiave del profilo aziendale viene mappata sul nome esatto del campo
 * presente nel modulo cartaceo/PDF, così l'app può generare un blocco di testo
 * copiabile riga-per-riga direttamente dentro la modulistica ufficiale.
 */
export interface PdfFieldMapping {
  pdf_label: string;
  profile_field: keyof CompanyProfile | "data_odierna" | "firma";
  static_value?: string;
}

/** Allegato ufficiale nominato dalla fonte (contratto Core). Mai inventato. */
export interface BandoAllegato {
  nome: string;
  url?: string;
  obbligatorio: boolean;
}

export interface Bando {

  id: string;
  titolo: string;
  ente: string;
  descrizione: string;
  categoria: BandoCategory;
  scope: BandoScope;
  regione?: string;
  provincia?: string;
  comune?: string;
  codice_istat?: string;
  importo_max?: number;
  scadenza?: string; // ISO date
  apertura?: string; // ISO date
  click_day?: boolean;
  flash?: boolean;
  pec?: string;
  /** PEC dell'ufficio di protocollo specifico incaricato di ricevere l'istanza. */
  ufficio_protocollo_pec?: string;
  piattaforma_url?: string;
  ateco_compatibili?: string[];
  requisiti?: string[];
  modulistica_url?: string;
  /** Allegati ufficiali dichiarati dalla fonte; vuoto quando non ne nomina. */
  allegati?: BandoAllegato[];

  /** True quando il bando è stato estratto da fonti "sommerse" (albo pretorio, BUR, decreto non pubblicizzato). */
  is_hidden?: boolean;
  /** Descrizione della fonte originaria extratestuale (es. "Allegato B verbale delibera Comune di X"). */
  fonte_extratestuale?: string;
  /** Scala 1..5 — 1 = concorrenza minima (bando quasi sconosciuto), 5 = alta concorrenza. */
  competition_index?: number;
  /** Mappatura dei campi PDF estratta dal Proxy-Core per l'autofill del modulo cartaceo. */
  pdf_field_mapping?: PdfFieldMapping[];
  notice_url?: string;
  application_url?: string;
  /** URL della fonte ufficiale primaria, quando restituito dal contratto core. */
  official_url?: string;
  aid_intensity_percent?: number;
  total_budget?: number;
  eligible_expenses?: string[];
  verification_status?: "VERIFICATO" | "PARZIALE" | "DA_VERIFICARE" | "SPORTELLO";
  /** True quando la fonte ufficiale dichiara procedura a sportello senza data di chiusura. */
  sportello?: boolean;
  official_source?: boolean;
  last_verified_at?: string;
  first_seen_at?: string;
  rarity_score?: number;
  source_kind?: string;
  programme_name?: string;
  programme_code?: string;
  pnrr_mission?: string;
  pnrr_component?: string;
  implementing_body?: string;
  eligible_countries?: string[];
  consortium_required?: boolean;
  min_partners?: number;
  evidence?: Array<{
    source_url: string;
    source_title?: string;
    evidence_type: string;
    excerpt?: string;
    fetched_at?: string;
  }>;
  match?: {
    status: "COMPATIBILE" | "DA_VERIFICARE" | "NON_COMPATIBILE";
    score: number;
    confirmed: string[];
    missing: string[];
    blockers: string[];
  };
}

export type FeedView = "catalog" | "profile";

export interface FeedResponse {
  bandi: Bando[];
  fetched_at: string;
  source: "central-core" | "cache";
  deep_search?: boolean;
  /** Marker di freschezza restituito dal Core quando disponibile. */
  generated_at?: string;
  /** catalog = elenco ufficiale; profile = feed abbinato. Legacy senza campo = profile. */
  view?: FeedView;
  /** Rendiconto ammissione fonti core: bandi validi vs scartati. */
  admission?: {
    admitted_count: number;
    rejected_count: number;
    rejected_by_reason: Record<string, number>;
    active_sources: Array<{ id: string; label: string; count: number }>;
    attested_hosts?: string[];
  };
}
