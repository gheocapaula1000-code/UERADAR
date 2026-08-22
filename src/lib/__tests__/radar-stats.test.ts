import { describe, expect, it } from "vitest";
import type { Bando } from "@/lib/bandocore-types";
import { computeRadarStats } from "@/lib/radar-stats";

const base = {
  id: "1",
  titolo: "T",
  ente: "E",
  descrizione: "D",
  categoria: "ALTRO" as const,
  scope: "COMUNALE" as const,
};

describe("computeRadarStats", () => {
  it("conta fonti rare/nascoste e modulistica reale", () => {
    const bandi = [
      { ...base, id: "a", is_hidden: true } as Bando,
      { ...base, id: "b", rarity_score: 4 } as Bando,
      {
        ...base,
        id: "c",
        modulistica_url: "https://ente.it/moduli",
      } as Bando,
      {
        ...base,
        id: "d",
        application_url: "https://ente.it/domanda",
        official_url: "https://ente.it/",
      } as Bando,
      { ...base, id: "e" } as Bando,
    ];
    const stats = computeRadarStats(bandi);
    expect(stats.totale).toBe(5);
    expect(stats.hidden).toBe(2);
    expect(stats.withModulistica).toBe(2);
  });

  it("non promuove official_url a modulistica", () => {
    const bandi = [
      {
        ...base,
        id: "x",
        official_url: "https://www.gse.it/",
        notice_url: "https://www.gse.it/",
        piattaforma_url: "https://www.gse.it/",
      } as Bando,
    ];
    expect(computeRadarStats(bandi).withModulistica).toBe(0);
  });
});
