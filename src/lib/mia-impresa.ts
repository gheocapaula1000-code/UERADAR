export type MiaImpresaMatch = {
  match?: { status?: string } | null;
};

/**
 * Vista «Per la mia impresa»: solo schede il cui match è COMPATIBILE.
 * Fail-closed: senza match, DA_VERIFICARE e NON_COMPATIBILE restano fuori.
 * Non inventa ATECO né compatibilità: usa solo lo status restituito dal feed.
 * sedeOk / settoreOk restano filtri a valle, invariati.
 */
export function isMiaImpresaCompatibile(bando: MiaImpresaMatch): boolean {
  return bando.match?.status === "COMPATIBILE";
}
