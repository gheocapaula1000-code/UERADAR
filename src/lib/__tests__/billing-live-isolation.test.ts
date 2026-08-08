import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  billingIdempotencyKey,
  canonicalSubscriptionGuard,
  checkoutResumeGate,
  checkoutSessionGate,
  customerCreationGate,
  modeVerdict,
  portalSessionGate,
  subscriptionUpdateFromEvent,
  validateRemotePrice,
} from "../billing";
import {
  billingConfigured,
  checkoutAccessAllowed,
  parseBillingMode,
  priceEnvForMode,
  type BillingEnv,
} from "../billing.server";
import { CATALOG, LIVE_PRICE_ENV_NAMES, PRICE_ENV_NAMES } from "../catalog";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function env(overrides: Partial<BillingEnv> = {}): BillingEnv {
  return {
    mode: "test",
    expectedLivemode: false,
    liveEnabled: false,
    publicCheckoutEnabled: false,
    secretKey: "sk_test_valid123",
    webhookSecret: "whsec_test123",
    portalConfiguration: "bpc_test123",
    priceMap: Object.fromEntries(PRICE_ENV_NAMES.map((_, i) => [`p:${i}`, `price_test_${i}`])),
    missingPriceEnvs: [],
    appUrl: "https://ueradar.com",
    ...overrides,
  };
}

function canonical(livemode: boolean) {
  return {
    id: "sub_123",
    customer: "cus_123",
    livemode,
    status: "active",
    current_period_end: 1_900_000_000,
    items: {
      data: [
        {
          quantity: 1,
          price: {
            id: "price_live_business",
            type: "recurring",
            active: true,
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
  };
}

describe("isolamento Stripe TEST/LIVE", () => {
  it("accetta solo i due selettori espliciti", () => {
    expect(parseBillingMode("test")).toBe("test");
    expect(parseBillingMode(" LIVE ")).toBe("live");
    for (const value of [undefined, "", "sandbox", "prod", true])
      expect(parseBillingMode(value)).toBeNull();
  });

  it("deriva le sei env LIVE senza fallback", () => {
    expect(PRICE_ENV_NAMES).toHaveLength(6);
    expect(LIVE_PRICE_ENV_NAMES).toHaveLength(6);
    expect(LIVE_PRICE_ENV_NAMES.every((name) => name.endsWith("_LIVE"))).toBe(true);
    PRICE_ENV_NAMES.forEach((name, i) => {
      expect(priceEnvForMode(name, "test")).toBe(name);
      expect(priceEnvForMode(name, "live")).toBe(LIVE_PRICE_ENV_NAMES[i]);
    });
  });

  it("LIVE resta fail-closed senza entrambi i flag", () => {
    const live = env({
      mode: "live",
      expectedLivemode: true,
      secretKey: "sk_live_valid123",
    });
    expect(billingConfigured(live).code).toBe("LIVE_MODE_DISABLED");
    expect(checkoutAccessAllowed(live, "owner@example.test").code).toBe("LIVE_MODE_DISABLED");
    const enabled = { ...live, liveEnabled: true };
    expect(checkoutAccessAllowed(enabled, "owner@example.test").code).toBe(
      "PUBLIC_CHECKOUT_DISABLED",
    );
    expect(checkoutAccessAllowed({ ...enabled, publicCheckoutEnabled: true }, null)).toEqual({
      ok: true,
      code: "OK",
    });
  });

  it("rifiuta una chiave appartenente all'altra modalità", () => {
    expect(billingConfigured(env({ secretKey: "sk_live_wrong123" })).code).toBe(
      "BILLING_KEY_MODE_MISMATCH",
    );
    expect(
      billingConfigured(
        env({
          mode: "live",
          expectedLivemode: true,
          liveEnabled: true,
          secretKey: "sk_test_wrong123",
        }),
      ).code,
    ).toBe("BILLING_KEY_MODE_MISMATCH");
  });

  it("il verdetto richiede un booleano identico al contesto", () => {
    expect(modeVerdict({ livemode: false }, false, "UNKNOWN").ok).toBe(true);
    expect(modeVerdict({ livemode: true }, true, "UNKNOWN").ok).toBe(true);
    expect(modeVerdict({ livemode: false }, true, "UNKNOWN").code).toBe("TEST_MODE_BLOCKED");
    expect(modeVerdict({ livemode: true }, false, "UNKNOWN").code).toBe("LIVE_MODE_BLOCKED");
    expect(modeVerdict({ livemode: "true" }, true, "UNKNOWN").code).toBe("UNKNOWN");
  });

  it("applica il gate LIVE a Customer, Checkout nuovo/ripreso e Portal", () => {
    expect(customerCreationGate({ status: 200, payload: { id: "cus_1", livemode: true } }, true).ok)
      .toBe(true);
    expect(
      checkoutSessionGate(
        {
          status: 200,
          payload: { id: "cs_live_1", url: "https://checkout.stripe.com/x", livemode: true },
        },
        true,
      ).ok,
    ).toBe(true);
    expect(
      checkoutResumeGate(
        {
          status: 200,
          payload: {
            id: "cs_live_1",
            url: "https://checkout.stripe.com/x",
            status: "open",
            livemode: true,
          },
        },
        "cs_live_1",
        true,
      ).ok,
    ).toBe(true);
    expect(
      portalSessionGate(
        { status: 200, payload: { url: "https://billing.stripe.com/x", livemode: true } },
        true,
      ).ok,
    ).toBe(true);
  });

  it("blocca oggetti TEST in un percorso LIVE", () => {
    expect(customerCreationGate({ status: 200, payload: { id: "cus_1", livemode: false } }, true).ok)
      .toBe(false);
    expect(
      checkoutSessionGate(
        {
          status: 200,
          payload: { id: "cs_test_1", url: "https://checkout.stripe.com/x", livemode: false },
        },
        true,
      ).code,
    ).toBe("TEST_MODE_BLOCKED");
  });

  it("valida i Price LIVE contro importo, valuta, ricorrenza e imposte", () => {
    const target = CATALOG.business.prices.month!;
    const price = {
      livemode: true,
      active: true,
      currency: "eur",
      unit_amount: 99000,
      recurring: { interval: "month", interval_count: 1 },
      tax_behavior: "exclusive",
    };
    expect(validateRemotePrice(price, target, true).ok).toBe(true);
    expect(validateRemotePrice({ ...price, livemode: false }, target, true).code).toBe(
      "TEST_MODE_BLOCKED",
    );
  });

  it("la Subscription canonica deve appartenere alla modalità selezionata", () => {
    const priceMap = { "business:month": "price_live_business" };
    const input = {
      expectedSubscriptionId: "sub_123",
      expectedCustomerId: "cus_123",
      linkedCustomerId: "cus_123",
      priceMap,
    };
    expect(
      canonicalSubscriptionGuard({ ...input, subscription: canonical(true), expectedLivemode: true })
        .ok,
    ).toBe(true);
    expect(
      canonicalSubscriptionGuard({ ...input, subscription: canonical(false), expectedLivemode: true })
        .code,
    ).toBe("TEST_MODE_BLOCKED");
  });

  it("la patch webhook persiste il billing_mode selezionato", () => {
    const mapped = subscriptionUpdateFromEvent({
      status: "active",
      currentPeriodEnd: 1_900_000_000,
      cancelAtPeriodEnd: false,
      priceId: "price_live_business",
      subscriptionId: "sub_123",
      customerId: "cus_123",
      priceMap: {
        "professional:month": "p1",
        "professional:year": "p2",
        "business:month": "price_live_business",
        "business:year": "p4",
        "executive:month": "p5",
        "executive:year": "p6",
      },
      billingMode: "live",
    });
    expect(mapped.ok).toBe(true);
    expect(mapped.patch?.billing_mode).toBe("live");
  });

  it("separa anche le chiavi di idempotenza", () => {
    const test = billingIdempotencyKey("test", "checkout", "user-1", "business");
    const live = billingIdempotencyKey("live", "checkout", "user-1", "business");
    expect(test).not.toBe(live);
    expect(test).toContain("ueradar:test:");
    expect(live).toContain("ueradar:live:");
  });

  it("la migrazione impedisce il cambio modo con binding provider", () => {
    const sql = readFileSync(
      "supabase/migrations/20260808153000_ueradar_billing_mode_isolation.sql",
      "utf8",
    );
    expect(sql).toContain("billing_mode IN ('test', 'live')");
    expect(sql).toContain("OLD.provider_customer_id IS NOT NULL");
    expect(sql).toContain("OLD.provider_subscription_id IS NOT NULL");
    expect(sql).toContain("BILLING_MODE_CONFLICT");
  });
});
