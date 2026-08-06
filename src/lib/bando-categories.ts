import { BANDO_CATEGORIES, type BandoCategory } from "./bandocore-types";

/** Etichetta italiana per ogni categoria dell'enum canonico. */
export const CATEGORY_LABELS: Record<BandoCategory, string> = {
  FONDO_PERDUTO: "Fondo Perduto",
  FINANZIAMENTO_AGEVOLATO: "Finanziamento agevolato",
  TASSO_ZERO: "Tasso Zero",
  CREDITO_IMPOSTA: "Credito d'Imposta",
  IMPRENDITORIA_FEMMINILE: "Imprenditoria Femminile",
  IMPRENDITORIA_GIOVANILE: "Imprenditoria Giovanile",
  DIGITALIZZAZIONE: "Digitale",
  TRANSIZIONE_ENERGETICA: "Energia",
  RICERCA_SVILUPPO: "Ricerca e sviluppo",
  INTERNAZIONALIZZAZIONE: "Estero",
  STARTUP_INNOVAZIONE: "Startup",
  FORMAZIONE_OCCUPAZIONE: "Formazione",
  AGRICOLTURA_RURALE: "Agricoltura",
  TURISMO_CULTURA: "Turismo & Cultura",
  ECONOMIA_CIRCOLARE: "Economia circolare",
  GARANZIA: "Garanzia",
  VOUCHER: "Voucher",
  ALTRO: "Altro",
};

export type CategoryFilterKey = BandoCategory | "TUTTI";

/** Filtri espliciti: derivati dall'enum, quindi mai divergenti. */
export const CATEGORY_FILTERS: { key: CategoryFilterKey; label: string }[] = [
  { key: "TUTTI", label: "Tutti" },
  ...BANDO_CATEGORIES.map((key) => ({ key, label: CATEGORY_LABELS[key] })),
];
