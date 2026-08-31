import { describe, expect, it } from "vitest";
import { coerceFiniteNumber, coercePositiveNumber } from "../official-number";

describe("coerceFiniteNumber", () => {
  it("accetta number finito e stringa Postgres numeric, senza inventare", () => {
    expect(coerceFiniteNumber(150000)).toBe(150000);
    expect(coerceFiniteNumber("150000.00")).toBe(150000);
    expect(coerceFiniteNumber(" 40 ")).toBe(40);
    expect(coerceFiniteNumber(0)).toBe(0);
  });

  it("rifiuta vuoto, NaN, boolean e testo", () => {
    expect(coerceFiniteNumber(undefined)).toBeUndefined();
    expect(coerceFiniteNumber(null)).toBeUndefined();
    expect(coerceFiniteNumber("")).toBeUndefined();
    expect(coerceFiniteNumber("no")).toBeUndefined();
    expect(coerceFiniteNumber(Number.NaN)).toBeUndefined();
    expect(coerceFiniteNumber(true)).toBeUndefined();
    expect(coerceFiniteNumber(false)).toBeUndefined();
  });
});

describe("coercePositiveNumber", () => {
  it("solo finito e maggiore di zero", () => {
    expect(coercePositiveNumber("150000.00")).toBe(150000);
    expect(coercePositiveNumber(0)).toBeUndefined();
    expect(coercePositiveNumber(-1)).toBeUndefined();
    expect(coercePositiveNumber("0")).toBeUndefined();
  });
});
