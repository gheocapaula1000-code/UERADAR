import { describe, expect, it } from "vitest";
import {
  checkoutResumeGate,
  checkoutSessionGate,
  customerCreationGate,
  isProviderObjectId,
  isProviderUrl,
  isTestModeObject,
  portalSessionGate,
  testModeVerdict,
} from "../billing";

const URL_OK = "https://checkout.stripe.com/c/pay/cs_test_123";

describe("post-write fail-closed: livemode", () => {
  it("isTestModeObject accetta solo il booleano false", () => {
    expect(isTestModeObject({ livemode: false })).toBe(true);
    for (const v of [true, "false", "true", 0, 1, null, undefined])
      expect(isTestModeObject({ livemode: v } as Record<string, unknown>)).toBe(false);
    expect(isTestModeObject({})).toBe(false);
    expect(isTestModeObject(null)).toBe(false);
  });

  it("testModeVerdict distingue live da modo ignoto", () => {
    expect(testModeVerdict({ livemode: false }, "X_UNKNOWN")).toEqual({ ok: true, code: "OK" });
    expect(testModeVerdict({ livemode: true }, "X_UNKNOWN").code).toBe("LIVE_MODE_BLOCKED");
    expect(testModeVerdict({}, "X_UNKNOWN").code).toBe("X_UNKNOWN");
    expect(testModeVerdict({ livemode: "false" }, "X_UNKNOWN").code).toBe("X_UNKNOWN");
    expect(testModeVerdict(null, "X_UNKNOWN").code).toBe("X_UNKNOWN");
  });

  it("id e url provider sono validati per prefisso e schema", () => {
    expect(isProviderObjectId("cus_ABC123", "cus_")).toBe(true);
    expect(isProviderObjectId("cs_test_1", "cus_")).toBe(false);
    expect(isProviderObjectId(undefined, "cs_")).toBe(false);
    expect(isProviderUrl(URL_OK)).toBe(true);
    expect(isProviderUrl("http://checkout.stripe.com/x")).toBe(false);
    expect(isProviderUrl("javascript:alert(1)")).toBe(false);
    expect(isProviderUrl("")).toBe(false);
  });

  it("customerCreationGate: linka solo Customer test valido", () => {
    expect(customerCreationGate({ status: 200, payload: { id: "cus_1", livemode: false } })).toEqual(
      { ok: true, code: "OK" },
    );
    expect(customerCreationGate({ status: 200, payload: { id: "cus_1", livemode: true } }).code).toBe(
      "LIVE_MODE_BLOCKED",
    );
    expect(customerCreationGate({ status: 200, payload: { id: "cus_1" } }).code).toBe(
      "CUSTOMER_MODE_UNKNOWN",
    );
    expect(customerCreationGate({ status: 200, payload: { id: "x", livemode: false } }).code).toBe(
      "CUSTOMER_CREATE_FAILED",
    );
    expect(customerCreationGate({ status: 500, payload: null }).code).toBe("CUSTOMER_CREATE_FAILED");
  });

  it("checkoutSessionGate: id cs_, url https e livemode false", () => {
    expect(
      checkoutSessionGate({ status: 200, payload: { id: "cs_1", url: URL_OK, livemode: false } }),
    ).toEqual({ ok: true, code: "OK" });
    expect(
      checkoutSessionGate({ status: 200, payload: { id: "cs_1", url: URL_OK, livemode: true } }).code,
    ).toBe("LIVE_MODE_BLOCKED");
    expect(checkoutSessionGate({ status: 200, payload: { id: "cs_1", url: URL_OK } }).code).toBe(
      "CHECKOUT_MODE_UNKNOWN",
    );
    expect(
      checkoutSessionGate({ status: 200, payload: { id: "cs_1", url: "ftp://x", livemode: false } })
        .code,
    ).toBe("PAYMENT_SESSION_FAILED");
  });

  it("checkoutResumeGate: solo sessione test aperta con url valida", () => {
    const open = { id: "cs_1", url: URL_OK, status: "open", livemode: false };
    expect(checkoutResumeGate({ status: 200, payload: open })).toEqual({ ok: true, code: "OK" });
    expect(
      checkoutResumeGate({ status: 200, payload: { ...open, livemode: true } }).code,
    ).toBe("LIVE_MODE_BLOCKED");
    expect(checkoutResumeGate({ status: 200, payload: { ...open, livemode: undefined } }).code).toBe(
      "CHECKOUT_MODE_UNKNOWN",
    );
    expect(
      checkoutResumeGate({ status: 200, payload: { ...open, status: "expired" } }).code,
    ).toBe("CHECKOUT_RESUME_UNAVAILABLE");
    expect(checkoutResumeGate(null).code).toBe("CHECKOUT_RESUME_UNAVAILABLE");
  });

  it("portalSessionGate: nessun link senza livemode false", () => {
    expect(portalSessionGate({ status: 200, payload: { url: URL_OK, livemode: false } })).toEqual({
      ok: true,
      code: "OK",
    });
    expect(portalSessionGate({ status: 200, payload: { url: URL_OK, livemode: true } }).code).toBe(
      "LIVE_MODE_BLOCKED",
    );
    expect(portalSessionGate({ status: 200, payload: { url: URL_OK } }).code).toBe(
      "PORTAL_MODE_UNKNOWN",
    );
    expect(portalSessionGate({ status: 200, payload: { url: "nope" } }).code).toBe("PORTAL_FAILED");
  });
});
