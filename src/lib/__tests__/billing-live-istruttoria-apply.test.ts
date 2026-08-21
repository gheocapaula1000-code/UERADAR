import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canonicalSubscriptionApply,
  priceKey,
  selfServicePricesConfigured,
  subscriptionUpdateFromEvent,
  webhookUserFromEvent,
} from "@/lib/billing";
import { billingConfigured, type BillingEnv } from "@/lib/billing.server";

/** Price map LIVE reale: solo Istruttoria, come nei Secrets di produzione. */
const ISTRUTTORIA_LIVE_PRICES: Record<string, string> = {
  [priceKey("business", "month")]: "price_live_istruttoria_month",
  [priceKey("business", "year")]: "price_live_istruttoria_year",
};

const USER_ID = "11111111-2222-4333-8444-555555555555";
const CUSTOMER_ID = "cus_live_istruttoria_1";
const SUBSCRIPTION_ID = "sub_live_istruttoria_1";
const PERIOD_END = 1_900_000_000;

function liveEnv(overrides: Partial<BillingEnv> = {}): BillingEnv {
  return {
    mode: "live",
    expectedLivemode: true,
    liveEnabled: true,
    publicCheckoutEnabled: true,
    secretKey: "sk_live_valid123",
    webhookSecret: "whsec_live123",
    portalConfiguration: "bpc_live123",
    priceMap: ISTRUTTORIA_LIVE_PRICES,
    missingPriceEnvs: [],
    appUrl: "https://ueradar.com",
    ...overrides,
  };
}

function checkoutSessionCompleted(over: Record<string, unknown> = {}) {
  return {
    id: "cs_live_istruttoria_month",
    object: "checkout.session",
    customer: CUSTOMER_ID,
    subscription: SUBSCRIPTION_ID,
    metadata: {
      supabase_user_id: USER_ID,
      plan_id: "business",
      interval: "month",
    },
    ...over,
  };
}

function canonicalLive(over: Record<string, unknown> = {}) {
  return {
    id: SUBSCRIPTION_ID,
    customer: CUSTOMER_ID,
    livemode: true,
    status: "active",
    current_period_end: PERIOD_END,
    cancel_at_period_end: false,
    items: {
      data: [
        {
          quantity: 1,
          price: {
            id: ISTRUTTORIA_LIVE_PRICES[priceKey("business", "month")],
            type: "recurring",
            active: true,
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
    ...over,
  };
}

function applyCheckoutCompleted(input: {
  session?: Record<string, unknown>;
  subscription?: Record<string, unknown> | null;
  priceMap?: Record<string, string>;
  linkedUserId?: string | null;
  linkedCustomerId?: string | null;
}) {
  const session = input.session ?? checkoutSessionCompleted();
  const user = webhookUserFromEvent({
    metadata: session["metadata"],
    linkedUserId: input.linkedUserId ?? null,
  });
  if (!user.ok) return { ...user, patch: null as Record<string, unknown> | null };
  const subscriptionId = session["subscription"];
  if (typeof subscriptionId !== "string" || !subscriptionId)
    return { ok: false, code: "SESSION_WITHOUT_SUBSCRIPTION", userId: user.userId, patch: null };
  const mapped = canonicalSubscriptionApply({
    subscription: input.subscription === undefined ? canonicalLive() : input.subscription,
    expectedSubscriptionId: subscriptionId,
    expectedCustomerId: session["customer"],
    linkedCustomerId: input.linkedCustomerId ?? null,
    priceMap: input.priceMap ?? ISTRUTTORIA_LIVE_PRICES,
    expectedLivemode: true,
    billingMode: "live",
  });
  return { ...mapped, userId: user.userId };
}

describe("USER_NOT_FOUND fail-closed", () => {
  it("Payment Link / Dashboard / metadata assente e nessun customer LIVE: codice chiaro, nessun utente inventato", () => {
    expect(webhookUserFromEvent({ metadata: null, linkedUserId: null })).toEqual({
      ok: false,
      code: "USER_NOT_FOUND",
      userId: null,
    });
    expect(webhookUserFromEvent({ metadata: {}, linkedUserId: null }).code).toBe("USER_NOT_FOUND");
    expect(
      webhookUserFromEvent({
        metadata: { plan_id: "business", interval: "month", email: "guest@example.test" },
        linkedUserId: null,
      }),
    ).toEqual({ ok: false, code: "USER_NOT_FOUND", userId: null });
  });

  it("un checkout.session.completed senza utente UERADAR non applica la patch", () => {
    const applied = applyCheckoutCompleted({
      session: checkoutSessionCompleted({ metadata: {} }),
    });
    expect(applied).toEqual({
      ok: false,
      code: "USER_NOT_FOUND",
      userId: null,
      patch: null,
    });
  });

  it("il webhook chiude l'evento in fail-closed, non con 200", () => {
    const src = readFileSync("src/routes/api/public/billing-webhook.ts", "utf8");
    expect(src).toContain("webhookUserFromEvent");
    expect(src).toContain('settle("USER_NOT_FOUND", false)');
    expect(src).not.toMatch(/Response\.json\(\{\s*ok:\s*true,\s*code:\s*"USER_NOT_FOUND"/);
    expect(src).not.toMatch(/settle\("USER_NOT_FOUND",\s*true\)/);
  });

  it("collega l'utente da metadata checkout o da customer già in anagrafica LIVE", () => {
    expect(
      webhookUserFromEvent({
        metadata: { supabase_user_id: USER_ID },
        linkedUserId: null,
      }),
    ).toEqual({ ok: true, code: "OK", userId: USER_ID });
    expect(
      webhookUserFromEvent({
        metadata: {},
        linkedUserId: USER_ID,
      }),
    ).toEqual({ ok: true, code: "OK", userId: USER_ID });
  });
});

describe("checkout.session.completed con price map Istruttoria-only LIVE", () => {
  it("billingConfigured e la mappa apply accettano solo i Price Istruttoria", () => {
    expect(selfServicePricesConfigured(ISTRUTTORIA_LIVE_PRICES)).toBe(true);
    expect(selfServicePricesConfigured({})).toBe(false);
    expect(
      selfServicePricesConfigured({
        [priceKey("professional", "month")]: "price_live_radar_month",
        [priceKey("professional", "year")]: "price_live_radar_year",
      }),
    ).toBe(false);
    expect(billingConfigured(liveEnv())).toEqual({ ok: true, code: "OK" });
  });

  it("un checkout Istruttoria mensile completo applica su ueradar_subscriptions", () => {
    const applied = applyCheckoutCompleted({});
    expect(applied.ok).toBe(true);
    expect(applied.code).toBe("OK");
    expect(applied.userId).toBe(USER_ID);
    expect(applied.patch).toMatchObject({
      status: "active",
      provider: "stripe",
      billing_mode: "live",
      provider_customer_id: CUSTOMER_ID,
      provider_subscription_id: SUBSCRIPTION_ID,
      stripe_price_id: ISTRUTTORIA_LIVE_PRICES[priceKey("business", "month")],
      plan_code: "ueradar_business_monthly",
      plan_seats: 5,
      cancel_at_period_end: false,
      trial_consumed: true,
    });
    expect(applied.patch?.current_period_end).toBe(new Date(PERIOD_END * 1000).toISOString());
  });

  it("un checkout Istruttoria annuale completo applica con la stessa mappa LIVE", () => {
    const yearPrice = ISTRUTTORIA_LIVE_PRICES[priceKey("business", "year")];
    const applied = applyCheckoutCompleted({
      session: checkoutSessionCompleted({
        metadata: { supabase_user_id: USER_ID, plan_id: "business", interval: "year" },
      }),
      subscription: canonicalLive({
        items: {
          data: [
            {
              quantity: 1,
              price: { id: yearPrice, type: "recurring", active: true },
            },
          ],
        },
      }),
    });
    expect(applied.ok).toBe(true);
    expect(applied.patch).toMatchObject({
      billing_mode: "live",
      stripe_price_id: yearPrice,
      plan_code: "ueradar_business_annual",
      provider: "stripe",
    });
  });

  it("senza i Price Istruttoria l'apply resta chiuso, anche se Radar è in mappa", () => {
    const radarOnly = {
      [priceKey("professional", "month")]: "price_live_radar_month",
      [priceKey("professional", "year")]: "price_live_radar_year",
    };
    expect(
      subscriptionUpdateFromEvent({
        status: "active",
        currentPeriodEnd: PERIOD_END,
        cancelAtPeriodEnd: false,
        priceId: ISTRUTTORIA_LIVE_PRICES[priceKey("business", "month")],
        subscriptionId: SUBSCRIPTION_ID,
        customerId: CUSTOMER_ID,
        priceMap: radarOnly,
        billingMode: "live",
      }),
    ).toEqual({ ok: false, code: "PRICES_NOT_CONFIGURED", patch: null });
    expect(
      applyCheckoutCompleted({ priceMap: radarOnly }).code,
    ).toBe("PRICES_NOT_CONFIGURED");
  });
});
