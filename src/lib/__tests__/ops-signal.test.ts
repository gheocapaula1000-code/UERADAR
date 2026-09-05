import { describe, expect, it, vi } from "vitest";
import {
  OPS_SIGNAL_PREFIX,
  coreAttestedSignal,
  emitOpsSignal,
  formatOpsSignal,
  stripeUnhandledSignal,
} from "../ops-signal";

describe("segnali operativi UEradar", () => {
  it("ignora tipi evento o host vuoti", () => {
    expect(stripeUnhandledSignal("")).toBeNull();
    expect(coreAttestedSignal("  ")).toBeNull();
  });

  it("normalizza host e tipo senza dati personali", () => {
    const stripe = stripeUnhandledSignal("invoice.upcoming")!;
    const attested = coreAttestedSignal("Nuova-Fonte.Core-Catalog.test")!;
    expect(stripe).toEqual({ kind: "stripe_unhandled_event", event_type: "invoice.upcoming" });
    expect(attested).toEqual({
      kind: "core_attested_source",
      host: "nuova-fonte.core-catalog.test",
    });
    expect(formatOpsSignal(stripe)).toContain(OPS_SIGNAL_PREFIX);
    expect(JSON.stringify(stripe)).not.toMatch(/@/);
  });

  it("emette un warning strutturato", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    emitOpsSignal(stripeUnhandledSignal("customer.tax_id.updated"));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"event_type":"customer.tax_id.updated"'),
    );
    warn.mockRestore();
  });
});
