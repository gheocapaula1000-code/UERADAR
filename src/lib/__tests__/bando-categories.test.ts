import { describe, expect, it } from "vitest";
import { BANDO_CATEGORIES } from "../bandocore-types";
import { CATEGORY_FILTERS, CATEGORY_LABELS } from "../bando-categories";

describe("filtri categorie", () => {
  it("i filtri coprono TUTTE le categorie dell'enum canonico", () => {
    const keys = CATEGORY_FILTERS.map((f) => f.key).filter((k) => k !== "TUTTI");
    expect([...keys].sort()).toEqual([...BANDO_CATEGORIES].sort());
  });

  it("include esplicitamente le categorie prima mancanti", () => {
    const keys = CATEGORY_FILTERS.map((f) => f.key);
    for (const k of ["FINANZIAMENTO_AGEVOLATO", "GARANZIA", "VOUCHER", "ALTRO"]) {
      expect(keys).toContain(k);
    }
  });

  it("nessun duplicato e nessuna etichetta vuota", () => {
    const keys = CATEGORY_FILTERS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of CATEGORY_FILTERS) expect(f.label.trim().length).toBeGreaterThan(0);
    for (const c of BANDO_CATEGORIES) expect(CATEGORY_LABELS[c]?.trim().length).toBeGreaterThan(0);
  });
});
