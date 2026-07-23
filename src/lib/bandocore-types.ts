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
  legale_rappresentante?: string | null;
  email_referente?: string | null;
  telefono?: string | null;
  pec?: string | null;
}

export type BandoCategory =
  | "FONDO_PERDUTO"
  | "TASSO_ZERO"
  | "CREDITO_IMPOSTA"
  | "IMPRENDITORIA_FEMMINILE"
  | "ALTRO";

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
  /** True quando il bando è stato estratto da fonti "sommerse" (albo pretorio, BUR, decreto non pubblicizzato). */
  is_hidden?: boolean;
  /** Descrizione della fonte originaria extratestuale (es. "Allegato B verbale delibera Comune di X"). */
  fonte_extratestuale?: string;
  /** Scala 1..5 — 1 = concorrenza minima (bando quasi sconosciuto), 5 = alta concorrenza. */
  competition_index?: number;
  /** Mappatura dei campi PDF estratta dal Proxy-Core per l'autofill del modulo cartaceo. */
  pdf_field_mapping?: PdfFieldMapping[];
}

export interface FeedResponse {
  bandi: Bando[];
  fetched_at: string;
  source: "proxy-core" | "cache";
  deep_search?: boolean;
}