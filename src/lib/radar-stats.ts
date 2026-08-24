import type { Bando } from "./bandocore-types";
import { isFlash, isRareOrHidden, isSportello } from "./bando-status";
import { countRealApplyLinks } from "./official-module";

/** Conteggi UI sulla lista attualmente mostrata (catalogo o profilo). */
export function computeRadarStats(bandiPerProfilo: Bando[]) {
  const s = {
    totale: bandiPerProfilo.length,
    femm: 0,
    flash: 0,
    hidden: 0,
    euPnrr: 0,
    importo: 0,
    withModulistica: 0,
  };
  for (const b of bandiPerProfilo) {
    if (b.categoria === "IMPRENDITORIA_FEMMINILE") s.femm += 1;
    if (isFlash(b) || isSportello(b)) s.flash += 1;
    if (isRareOrHidden(b)) s.hidden += 1;
    if (b.scope === "EUROPEO" || b.pnrr_mission) s.euPnrr += 1;
    if (b.importo_max) s.importo += b.importo_max;
  }
  s.withModulistica = countRealApplyLinks(bandiPerProfilo).withEither;
  return s;
}
