import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { computeRadarStats } from "@/lib/radar-stats";
import type { Bando } from "@/lib/bandocore-types";

function bando(over: Partial<Bando> = {}): Bando {
  return {
    id: over.id ?? "b1",
    titolo: "Bando test",
    ente: "Ente",
    descrizione: "Descrizione",
    categoria: "FONDO_PERDUTO",
    scope: "REGIONALE",
    scadenza: "2099-12-31",
    ...over,
  } as Bando;
}

describe("computeRadarStats", () => {
  it("conta solo la lista passata, senza totali inventati", () => {
    expect(computeRadarStats([])).toEqual({
      totale: 0,
      femm: 0,
      flash: 0,
      hidden: 0,
      euPnrr: 0,
      importo: 0,
      withModulistica: 0,
    });
  });

  it("usa isFlash e isRareOrHidden, non is_hidden come metrica isolata", () => {
    const list = [
      bando({ id: "a", flash: true }),
      bando({ id: "b", is_hidden: true, importo_max: 10_000 }),
      bando({ id: "c", rarity_score: 4, categoria: "IMPRENDITORIA_FEMMINILE" }),
      bando({ id: "d", scope: "EUROPEO", pnrr_mission: "M1" }),
      bando({
        id: "e",
        scadenza: "2020-01-01",
        flash: true,
        application_url: "https://esempio.it/domanda",
      }),
    ];
    const stats = computeRadarStats(list);
    expect(stats.totale).toBe(5);
    expect(stats.flash).toBe(1);
    expect(stats.hidden).toBe(2);
    expect(stats.femm).toBe(1);
    expect(stats.euPnrr).toBe(1);
    expect(stats.importo).toBe(10_000);
    expect(stats.withModulistica).toBe(1);
  });
});

describe("Radar Bandi usa i helper come unica fonte", () => {
  const dashboard = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
  const card = readFileSync("src/components/bandocore/BandoCard.tsx", "utf8");

  it("il feed importa compareByQuality, isRareOrHidden e computeRadarStats", () => {
    expect(dashboard).toContain('from "@/lib/bando-status"');
    expect(dashboard).toContain("compareByQuality");
    expect(dashboard).toContain("isRareOrHidden");
    expect(dashboard).toContain("isActive");
    expect(dashboard).toContain("isFlash");
    expect(dashboard).toContain('from "@/lib/radar-stats"');
    expect(dashboard).toContain("computeRadarStats(statsSource)");
  });

  it("non ricalcola i contatori in linea e non usa il catalogo Core come totale", () => {
    expect(dashboard).not.toMatch(/s\.flash\+\+/);
    expect(dashboard).not.toMatch(/if \(b\.is_hidden\) s\.hidden/);
    expect(dashboard).not.toMatch(/\b477\b/);
    expect(dashboard).not.toMatch(/bandi nascosti/i);
    expect(dashboard).not.toMatch(/più potente/i);
  });

  it("Home mostra 4 numeri in-feed, non match COMPATIBILE", () => {
    expect(dashboard).toContain("lg:grid-cols-4");
    expect(dashboard).toContain("Bandi attivi per te");
    expect(dashboard).toContain("Bandi ufficiali aperti");
    expect(dashboard).toContain("In scadenza a breve");
    expect(dashboard).toContain("Fonti locali / poco diffuse");
    expect(dashboard).toContain("Con modulistica / presentazione");
    expect(dashboard).toContain("Bandi in feed per questo profilo (sede e settore)");
    expect(dashboard).toContain("Bandi del catalogo ufficiale attualmente mostrati");
    expect(dashboard).not.toMatch(/compatibili con il profilo/);
    expect(dashboard).not.toContain("Bandi Attivi per te");
    expect(dashboard).toContain("Catalogo");
    expect(dashboard).toContain("Per la mia impresa");
    expect(dashboard).toContain('homeView === "catalog"');
    expect(dashboard).not.toMatch(/l:\s*["']COMPATIBILE["']/);
    expect(dashboard).not.toContain("Modulistica disponibile");
    expect(dashboard).toContain("Importo Massimo");
    expect(dashboard).toContain("UE + PNRR");
    expect(dashboard).toContain("Imprenditoria Femminile");
  });

  it("le card scadute e flash usano i helper, non i flag grezzi", () => {
    expect(card).toContain("isExpired");
    expect(card).toContain("isFlash");
    expect(card).toContain("isRareOrHidden");
    expect(card).not.toMatch(/!expired && bando\.flash/);
  });
});
