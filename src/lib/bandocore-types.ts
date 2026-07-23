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

export interface Bando {
  id: string;
  titolo: string;
  ente: string;
  descrizione: string;
  categoria: BandoCategory;
  scope: BandoScope;
  regione?: string;
  importo_max?: number;
  scadenza?: string; // ISO date
  apertura?: string; // ISO date
  click_day?: boolean;
  flash?: boolean;
  pec?: string;
  piattaforma_url?: string;
  ateco_compatibili?: string[];
  requisiti?: string[];
  modulistica_url?: string;
}

export interface FeedResponse {
  bandi: Bando[];
  fetched_at: string;
  source: "proxy-core" | "cache";
}