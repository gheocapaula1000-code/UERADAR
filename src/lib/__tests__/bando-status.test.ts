import { describe, expect, it } from "vitest";
import { isActive, isExpired, isFlash, matchStatusMeta, normalizeMatchStatus } from "../bando-status";

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
