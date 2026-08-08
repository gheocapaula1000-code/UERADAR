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

describe("post-write behaviour: true vs unknown vs false", () => {
  const ok = (extra: Record<string, unknown> = {}) => ({
    status: 200,
    payload: { id: "cus_123", livemode: false, ...extra },
  });

  it("customer: livemode true blocca con LIVE_MODE_BLOCKED", () => {
    expect(customerCreationGate({ status: 200, payload: { id: "cus_1", livemode: true } })).toEqual({
      ok: false,
      code: "LIVE_MODE_BLOCKED",
    });
  });

  it.each([undefined, null, "false", 0, 1, {}])(
    "customer: livemode %p è ignoto ⇒ CUSTOMER_MODE_UNKNOWN",
    (value) => {
      const res = customerCreationGate({ status: 200, payload: { id: "cus_1", livemode: value } });
      expect(res).toEqual({ ok: false, code: "CUSTOMER_MODE_UNKNOWN" });
    },
  );

  it("customer: solo livemode false e id cus_ passano", () => {
    expect(customerCreationGate(ok())).toEqual({ ok: true, code: "OK" });
    expect(customerCreationGate({ status: 500, payload: { id: "cus_1", livemode: false } }).code).toBe(
      "CUSTOMER_CREATE_FAILED",
    );
    expect(customerCreationGate({ status: 200, payload: { id: "cs_1", livemode: false } }).code).toBe(
      "CUSTOMER_CREATE_FAILED",
    );
    expect(customerCreationGate({ status: 200, payload: null }).code).toBe("CUSTOMER_CREATE_FAILED");
  });

  it("checkout: url non https o malformata non passa il gate", () => {
    for (const url of ["http://x.dev/s", "javascript:alert(1)", "/relative", "", 42, null]) {
      expect(
        checkoutSessionGate({ status: 200, payload: { id: "cs_1", url, livemode: false } }).code,
      ).toBe("PAYMENT_SESSION_FAILED");
    }
    expect(
      checkoutSessionGate({
        status: 200,
        payload: { id: "cs_1", url: "https://pay.example.com/s", livemode: false },
      }),
    ).toEqual({ ok: true, code: "OK" });
  });

  it("checkout: true ⇒ LIVE_MODE_BLOCKED, ignoto ⇒ CHECKOUT_MODE_UNKNOWN", () => {
    const base = { id: "cs_1", url: "https://pay.example.com/s" };
    expect(checkoutSessionGate({ status: 200, payload: { ...base, livemode: true } }).code).toBe(
      "LIVE_MODE_BLOCKED",
    );
    expect(checkoutSessionGate({ status: 200, payload: base }).code).toBe("CHECKOUT_MODE_UNKNOWN");
  });

  it("resume: id non corrispondente, live, ignoto o non aperta non restituiscono URL", () => {
    const good = {
      status: 200,
      payload: { id: "cs_1", url: "https://pay.example.com/s", status: "open", livemode: false },
    };
    expect(checkoutResumeGate(good, "cs_1")).toEqual({ ok: true, code: "OK" });
    expect(checkoutResumeGate(good, "cs_other").code).toBe("CHECKOUT_RESUME_ID_MISMATCH");
    expect(
      checkoutResumeGate({ ...good, payload: { ...good.payload, livemode: true } }, "cs_1").code,
    ).toBe("LIVE_MODE_BLOCKED");
    const unknown = { id: "cs_1", url: "https://pay.example.com/s", status: "open" };
    expect(checkoutResumeGate({ status: 200, payload: unknown }, "cs_1").code).toBe(
      "CHECKOUT_MODE_UNKNOWN",
    );
    expect(
      checkoutResumeGate({ ...good, payload: { ...good.payload, status: "complete" } }, "cs_1").code,
    ).toBe("CHECKOUT_RESUME_UNAVAILABLE");
    // eccezione di rete ⇒ res null
    expect(checkoutResumeGate(null, "cs_1").code).toBe("CHECKOUT_RESUME_UNAVAILABLE");
  });

  it("portal: true ⇒ LIVE_MODE_BLOCKED, ignoto ⇒ PORTAL_MODE_UNKNOWN, url invalida ⇒ PORTAL_FAILED", () => {
    const url = "https://portal.example.com/s";
    expect(portalSessionGate({ status: 200, payload: { url, livemode: false } })).toEqual({
      ok: true,
      code: "OK",
    });
    expect(portalSessionGate({ status: 200, payload: { url, livemode: true } }).code).toBe(
      "LIVE_MODE_BLOCKED",
    );
    expect(portalSessionGate({ status: 200, payload: { url } }).code).toBe("PORTAL_MODE_UNKNOWN");
    expect(portalSessionGate({ status: 200, payload: { url: "http://x/s", livemode: false } }).code).toBe(
      "PORTAL_FAILED",
    );
    expect(portalSessionGate({ status: 402, payload: { url, livemode: false } }).code).toBe(
      "PORTAL_FAILED",
    );
  });
});
