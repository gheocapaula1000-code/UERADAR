import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isTestModeObject } from "../billing";

describe("difesa post-write: livemode === false", () => {
  it("accetta solo livemode booleano false", () => {
    expect(isTestModeObject({ livemode: false })).toBe(true);
    for (const value of [true, "false", "true", 0, 1, null, undefined]) {
      expect(isTestModeObject({ livemode: value } as Record<string, unknown>)).toBe(false);
    }
    expect(isTestModeObject({})).toBe(false);
    expect(isTestModeObject(null)).toBe(false);
    expect(isTestModeObject(undefined)).toBe(false);
  });

  it("il gate è applicato a Customer e Checkout Session", () => {
    const src = readFileSync("src/lib/billing.functions.ts", "utf8");
    expect(src).toContain("CUSTOMER_MODE_BLOCKED");
    expect(src).toContain("CHECKOUT_MODE_BLOCKED");
    expect(src).toContain("isTestModeObject(existing.payload)");
    expect(src).toContain("isTestModeObject(session.payload)");
  });
});
