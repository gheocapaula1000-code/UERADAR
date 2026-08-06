import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SRC = readFileSync("src/routes/_authenticated/bando.$id.tsx", "utf8");

describe("bozza: nessuna formula dichiarativa", () => {
  it("non contiene 'dichiarando ai sensi' né 'DPR 445/2000'", () => {
    expect(SRC).not.toMatch(/dichiarando ai sensi/i);
    expect(SRC).not.toMatch(/DPR\s*445\/?2000/i);
  });

  it("la bozza generata include l'avviso esplicito", () => {
    expect(SRC).toMatch(/BOZZA INFORMATIVA/);
    expect(SRC).toMatch(/non è una dichiarazione sostitutiva/i);
    expect(SRC).toMatch(/fonte ufficiale/i);
    expect(SRC).toMatch(/\$\{DRAFT_DISCLAIMER\}/);
  });

  it("nessuna CTA legacy residua", () => {
    const legacyCta = ["Genera", "Istanza"].join(" ");
    expect(SRC.includes(legacyCta)).toBe(false);
  });

  it("nessuna intestazione standalone 'MODULO UFFICIALE —'", () => {
    expect(SRC).not.toMatch(/(^|[^A-Z])`MODULO UFFICIALE —/);
    expect(SRC).toMatch(/BOZZA DATI PER MODULO UFFICIALE —/);
  });

  it("il campo firma non produce una riga firmabile", () => {
    expect(SRC).not.toMatch(/_{6,}/);
    expect(SRC).toMatch(/da compilare esclusivamente sul modulo ufficiale dopo verifica/);
  });
});
