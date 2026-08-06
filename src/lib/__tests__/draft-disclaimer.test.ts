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

  it("nessuna CTA 'Genera Istanza' residua", () => {
    expect(SRC).not.toMatch(/Genera Istanza/i);
  });
});
