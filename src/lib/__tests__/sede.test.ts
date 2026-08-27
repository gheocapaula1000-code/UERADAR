import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { matchesSede } from "../sede";
import type { Bando } from "../bandocore-types";

const padova = {
  comune: "Padova",
  provincia: "PD",
  regione: "Veneto",
};

function bando(over: Partial<Pick<Bando, "scope" | "comune" | "provincia" | "regione">>) {
  return {
    scope: "REGIONALE" as const,
    ...over,
  };
}

describe("matchesSede fail-closed (Padova non vede altri territori)", () => {
  it("esclude Bandi regionali di un'altra regione (Caltanissetta / Sicilia)", () => {
    expect(
      matchesSede(bando({ scope: "REGIONALE", regione: "Sicilia", comune: "Caltanissetta" }), padova),
    ).toBe(false);
  });

  it("esclude Bandi comunali fuori sede (Bergamo, Caltanissetta)", () => {
    expect(
      matchesSede(bando({ scope: "COMUNALE", comune: "Bergamo", provincia: "BG", regione: "Lombardia" }), padova),
    ).toBe(false);
    expect(
      matchesSede(
        bando({ scope: "COMUNALE", comune: "Caltanissetta", provincia: "CL", regione: "Sicilia" }),
        padova,
      ),
    ).toBe(false);
  });

  it("esclude Bandi camerali di un'altra provincia", () => {
    expect(
      matchesSede(bando({ scope: "CAMERALE", comune: "Bergamo", provincia: "BG", regione: "Lombardia" }), padova),
    ).toBe(false);
  });

  it("ammette Nazionale ed Europeo, e i territoriali della sede", () => {
    expect(matchesSede(bando({ scope: "NAZIONALE", regione: "Sicilia" }), padova)).toBe(true);
    expect(matchesSede(bando({ scope: "EUROPEO" }), padova)).toBe(true);
    expect(matchesSede(bando({ scope: "REGIONALE", regione: "Veneto" }), padova)).toBe(true);
    expect(
      matchesSede(bando({ scope: "COMUNALE", comune: "Padova", provincia: "PD", regione: "Veneto" }), padova),
    ).toBe(true);
    expect(
      matchesSede(bando({ scope: "CAMERALE", comune: "Padova", provincia: "PD", regione: "Veneto" }), padova),
    ).toBe(true);
  });

  it("REGIONALE senza regione ufficiale è escluso se il profilo ha una regione", () => {
    expect(matchesSede(bando({ scope: "REGIONALE" }), padova)).toBe(false);
    expect(matchesSede(bando({ scope: "REGIONALE", regione: "Veneto" }), { ...padova, regione: "" })).toBe(
      true,
    );
  });

  it("senza profilo non filtra", () => {
    expect(matchesSede(bando({ scope: "REGIONALE", regione: "Sicilia" }), null)).toBe(true);
  });
});

describe("dashboard Radar usa sedeOk = matchesSede e non reintroduce il ranking", () => {
  const dashboard = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");

  it("filtra con matchesSede e ordina con compareByQualityAndGeo", () => {
    expect(dashboard).toContain("matchesSede");
    expect(dashboard).toContain("const sedeOk");
    expect(dashboard).toContain("sedeOk(b)");
    expect(dashboard).toContain("compareByQualityAndGeo");
    expect(dashboard).not.toContain("from \"@/lib/plain-ux\"");
  });
});
