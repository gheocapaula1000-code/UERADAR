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
