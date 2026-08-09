import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { portalAvailable } from "../billing.functions";
import {
  checkoutAccessAllowed,
  portalAccessAllowed,
  type BillingEnv,
} from "../billing.server";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function liveEnv(overrides: Partial<BillingEnv> = {}): Pick<
  BillingEnv,
  "mode" | "liveEnabled" | "publicCheckoutEnabled"
> {
  return { mode: "live", liveEnabled: true, publicCheckoutEnabled: false, ...overrides };
}

describe("gating Portal vs checkout pubblico", () => {
  it("checkout pubblico disabilitato blocca il checkout prima di ogni creazione", () => {
    expect(checkoutAccessAllowed(liveEnv(), "owner@example.test")).toEqual({
      ok: false,
      code: "PUBLIC_CHECKOUT_DISABLED",
    });
    const src = readFileSync("src/lib/billing.functions.ts", "utf8");
    const checkout = src.slice(
      src.indexOf("export const createPaymentSession"),
      src.indexOf("export const createPortalSession"),
    );
    // Il gate precede qualunque providerCall di creazione.
    expect(checkout.indexOf("checkoutAccessAllowed")).toBeGreaterThan(-1);
    expect(checkout.indexOf("checkoutAccessAllowed")).toBeLessThan(
      checkout.indexOf("providerCall("),
    );
  });

  it("il Portal resta aperto con checkout pubblico disabilitato", () => {
    expect(portalAccessAllowed(liveEnv(), "owner@example.test")).toEqual({ ok: true, code: "OK" });
  });

  it("il Portal resta fail-closed su modalità e flag LIVE", () => {
    expect(portalAccessAllowed({ mode: "live", liveEnabled: false }, "o@e.test").code).toBe(
      "LIVE_MODE_DISABLED",
    );
    expect(portalAccessAllowed({ mode: null, liveEnabled: true }, "o@e.test").code).toBe(
      "BILLING_MODE_INVALID",
    );
  });

  it("in TEST il Portal richiede il gate QA con allowlist", () => {
    process.env["UERADAR_CHECKOUT_QA_ENABLED"] = "false";
    expect(portalAccessAllowed({ mode: "test", liveEnabled: false }, "o@e.test").code).toBe(
      "CHECKOUT_QA_DISABLED",
    );
    process.env["UERADAR_CHECKOUT_QA_ENABLED"] = "true";
    process.env["UERADAR_CHECKOUT_QA_EMAILS"] = "owner@example.test";
    expect(portalAccessAllowed({ mode: "test", liveEnabled: false }, "other@example.test").code).toBe(
      "CHECKOUT_QA_NOT_ALLOWED",
    );
    expect(portalAccessAllowed({ mode: "test", liveEnabled: false }, "owner@example.test")).toEqual({
      ok: true,
      code: "OK",
    });
  });

  it("il Portal richiede customer preesistente e autorizzazione del tenant", () => {
    expect(portalAvailable({ provider_customer_id: "cus_1" }, true, true)).toBe(true);
    expect(portalAvailable({ provider_customer_id: null }, true, true)).toBe(false);
    expect(portalAvailable({ provider_customer_id: "cus_1" }, false, true)).toBe(false);
    expect(portalAvailable({ provider_customer_id: "cus_1" }, true, false)).toBe(false);
  });

  it("createPortalSession non crea oggetti Stripe e verifica modalità e customer", () => {
    const src = readFileSync("src/lib/billing.functions.ts", "utf8");
    const portal = src.slice(src.indexOf("export const createPortalSession"));
    const body = portal.slice(0, portal.indexOf("export type CompanyMember"));
    expect(body).toContain("portalAccessAllowed");
    expect(body).toContain("BILLING_MODE_CONFLICT");
    expect(body).toContain("MEMBER_CANNOT_MANAGE_BILLING");
    expect(body).toContain("PORTAL_NOT_AVAILABLE");
    expect(body).toContain("portalSessionGate");
    for (const forbidden of [
      "ensureCustomer",
      '"customers"',
      "checkout/sessions",
      "payment_intents",
      "payment_links",
    ])
      expect(body).not.toContain(forbidden);
  });
});
