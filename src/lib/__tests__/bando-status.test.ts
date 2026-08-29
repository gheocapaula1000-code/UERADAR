import { describe, expect, it } from "vitest";
import type { Bando } from "../bandocore-types";
import {
  isActive,
  isExpired,
  isFlash,
  isRareOrHidden,
  MATCH_UNKNOWN_PROFILE_LABEL,
  matchPreview,
  matchStatusMeta,
  MISSING_ON_NOTICE,
  normalizeMatchStatus,
  territoryBadge,
  compareByQualityAndGeo,
  geographicBoost,
} from "../bando-status";

const NOW = Date.parse("2026-08-06T10:00:00.000Z");
const day = 86_400_000;

describe("stato di compatibilità", () => {
  it("rende i tre stati con etichette distinte", () => {
    expect(matchStatusMeta("COMPATIBILE").label).toBe("Compatibile");
    expect(matchStatusMeta("DA_VERIFICARE").label).toBe("Da verificare");
    expect(matchStatusMeta("NON_COMPATIBILE").label).toBe("Non compatibile");
  });

  it("non mostra mai NON_COMPATIBILE come Da verificare", () => {
    const meta = matchStatusMeta("NON_COMPATIBILE");
    expect(meta.label).not.toBe("Da verificare");
    expect(meta.tone).toBe("negative");
  });

  it("normalizza valori sconosciuti su DA_VERIFICARE", () => {
    expect(normalizeMatchStatus("boh")).toBe("DA_VERIFICARE");
    expect(normalizeMatchStatus(undefined)).toBe("DA_VERIFICARE");
    expect(normalizeMatchStatus("non_compatibile")).toBe("NON_COMPATIBILE");
  });

  it("anteprima card: mostra DA_VERIFICARE con motivi, senza inventare il punteggio", () => {
    const preview = matchPreview({
      status: "DA_VERIFICARE",
      score: 62.4,
      confirmed: ["ATECO ammesso"],
      missing: ["Sede da confermare", "DURC", "extra ignorato"],
      blockers: [],
    });
    expect(preview?.label).toBe("Da verificare");
    expect(preview?.tone).toBe("warning");
    expect(preview?.score).toBe(62);
    expect(preview?.confirmed).toEqual(["ATECO ammesso"]);
    expect(preview?.missing).toEqual(["Sede da confermare", "DURC"]);
    expect(matchPreview(null)).toBeNull();
    expect(matchPreview({ status: "COMPATIBILE", score: Number.NaN, confirmed: [], missing: [], blockers: [] })?.score).toBeNull();
  });

  it("sulla vista profilo il match DA_VERIFICARE è ATECO non sul testo ufficiale", () => {
    expect(MATCH_UNKNOWN_PROFILE_LABEL).toBe("ATECO non sul testo ufficiale");
    expect(matchStatusMeta("DA_VERIFICARE", "profile").label).toBe(MATCH_UNKNOWN_PROFILE_LABEL);
    expect(matchStatusMeta("DA_VERIFICARE", "catalog").label).toBe("Da verificare");
    expect(matchStatusMeta("DA_VERIFICARE").label).toBe("Da verificare");
    expect(
      matchPreview(
        { status: "DA_VERIFICARE", score: 40, confirmed: [], missing: [], blockers: [] },
        "profile",
      )?.label,
    ).toBe(MATCH_UNKNOWN_PROFILE_LABEL);
  });
});

describe("scadenze", () => {
  it("considera scaduto un bando con scadenza passata", () => {
    expect(isExpired({ scadenza: "2026-08-01" }, NOW)).toBe(true);
    expect(isActive({ scadenza: "2026-08-01" }, NOW)).toBe(false);
  });

  it("considera attivo il giorno stesso della scadenza", () => {
    expect(isExpired({ scadenza: "2026-08-06" }, NOW)).toBe(false);
  });

  it("senza scadenza il bando resta attivo", () => {
    expect(isExpired({}, NOW)).toBe(false);
  });

  it("un bando scaduto non è mai flash, nemmeno con click_day", () => {
    expect(isFlash({ scadenza: "2026-07-01", flash: true, click_day: true }, NOW)).toBe(false);
    expect(isFlash({ scadenza: new Date(NOW + 3 * day).toISOString() }, NOW)).toBe(true);
  });
});

describe("fonti rare o locali", () => {
  it("is_hidden o rarity_score >= 4, senza inventare schede", () => {
    expect(isRareOrHidden({ is_hidden: true })).toBe(true);
    expect(isRareOrHidden({ rarity_score: 4 })).toBe(true);
    expect(isRareOrHidden({ rarity_score: 5 })).toBe(true);
    expect(isRareOrHidden({ rarity_score: 3 })).toBe(false);
    expect(isRareOrHidden({})).toBe(false);
  });
});

describe("badge territoriale", () => {
  it("mostra nazionale/europeo senza inventare un comune", () => {
    expect(territoryBadge({ scope: "NAZIONALE" }).label).toBe("Nazionale");
    expect(territoryBadge({ scope: "EUROPEO" }).label).toBe("Europeo");
  });

  it("per i bandi territoriali usa solo il luogo ufficiale", () => {
    expect(territoryBadge({ scope: "REGIONALE", regione: "Veneto" }).label).toBe(
      "Regionale · Veneto",
    );
    expect(territoryBadge({ scope: "COMUNALE", comune: "Padova" }).label).toBe(
      "Comunale · Padova",
    );
    expect(territoryBadge({ scope: "REGIONALE" }).title).toBe(MISSING_ON_NOTICE);
  });
});

describe("ranking geografico additivo (PR 20)", () => {
  const padova = { comune: "Padova", provincia: "PD", regione: "Veneto" };
  const now = Date.parse("2026-08-27T10:00:00.000Z");
  const sameQuality = {
    titolo: "Bando",
    ente: "Ente",
    descrizione: "D",
    categoria: "FONDO_PERDUTO",
    scadenza: "2099-12-31",
    importo_max: 10000,
  };

  it("stessa provincia pesa più di un altro territorio, a parità di qualità", () => {
    const local = { id: "pd", scope: "COMUNALE" as const, comune: "Padova", provincia: "PD", regione: "Veneto", ...sameQuality } as Bando;
    const far = { id: "bg", scope: "COMUNALE" as const, comune: "Bergamo", provincia: "BG", regione: "Lombardia", ...sameQuality } as Bando;
    expect(geographicBoost(local, padova)).toBeGreaterThan(geographicBoost(far, padova));
    expect(compareByQualityAndGeo(local, far, padova, now)).toBeLessThan(0);
  });
});
