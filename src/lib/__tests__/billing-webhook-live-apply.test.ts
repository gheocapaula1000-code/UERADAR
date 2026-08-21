import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canonicalPriceId,
  canonicalSubscriptionGuard,
  priceKey,
  selfServicePricesConfigured,
  subscriptionUpdateFromEvent,
  webhookUserLookup,
} from "@/lib/billing";
import { billingConfigured, readBillingEnv } from "@/lib/billing.server";

const ISTRUTTORIA_LIVE_MAP = {
  [priceKey("business", "month")]: "price_live_business_month",
  [priceKey("business", "year")]: "price_live_business_year",
};

const USER_ID = "11111111-1111-4111-8111-111111111111";
const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function liveCheckoutSession(over: Record<string, unknown> = {}) {
  return {
    id: "cs_live_istruttoria_1",
    object: "checkout.session",
    livemode: true,
    customer: "cus_live_1",
    subscription: "sub_live_1",
    status: "complete",
    metadata: { supabase_user_id: USER_ID, plan_id: "business", interval: "month" },
    ...over,
  };
}

function liveCanonicalSubscription(over: Record<string, unknown> = {}) {
  return {
    id: "sub_live_1",
    customer: "cus_live_1",
    livemode: true,
    status: "active",
    current_period_end: 1_900_000_000,
    cancel_at_period_end: false,
    items: {
      data: [
        {
          quantity: 1,
          price: {
            id: "price_live_business_month",
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

describe("USER_NOT_FOUND fail-closed", () => {
  it("Payment Link, Dashboard o metadata assenti senza customer LIVE non inventano un utente", () => {
    expect(webhookUserLookup({ metadataUserId: undefined, linkedUserId: null })).toEqual({
      ok: false,
      code: "USER_NOT_FOUND",
    });
    expect(webhookUserLookup({ metadataUserId: "", linkedUserId: null }).code).toBe("USER_NOT_FOUND");
    expect(webhookUserLookup({ metadataUserId: 12, linkedUserId: null }).code).toBe("USER_NOT_FOUND");
    expect(webhookUserLookup({ metadataUserId: null, linkedUserId: "" }).code).toBe("USER_NOT_FOUND");
  });

  it("usa metadata supabase_user_id oppure il customer già legato", () => {
    expect(webhookUserLookup({ metadataUserId: USER_ID, linkedUserId: null })).toEqual({
      ok: true,
      userId: USER_ID,
    });
    expect(webhookUserLookup({ metadataUserId: null, linkedUserId: USER_ID })).toEqual({
      ok: true,
      userId: USER_ID,
    });
  });

  it("il webhook chiude USER_NOT_FOUND senza 200 e senza inventare un utente", () => {
    const src = readFileSync("src/routes/api/public/billing-webhook.ts", "utf8");
    expect(src).toContain("webhookUserLookup");
    expect(src).toContain('settle("USER_NOT_FOUND", false)');
    expect(src).not.toMatch(/Response\.json\(\{\s*ok:\s*true,\s*code:\s*"USER_NOT_FOUND"/);
    expect(src).not.toMatch(/insert\([\s\S]*ueradar_subscriptions/);
  });
});

describe("apply LIVE Istruttoria-only su checkout.session.completed", () => {
  it("la mappa Istruttoria LIVE è sufficiente, Radar e Studio restano opzionali", () => {
    expect(selfServicePricesConfigured(ISTRUTTORIA_LIVE_MAP)).toBe(true);
    expect(selfServicePricesConfigured({ [priceKey("business", "month")]: "price_only" })).toBe(
      false,
    );
    expect(
      selfServicePricesConfigured({
        [priceKey("professional", "month")]: "price_radar_m",
        [priceKey("professional", "year")]: "price_radar_y",
        [priceKey("executive", "month")]: "price_studio_m",
        [priceKey("executive", "year")]: "price_studio_y",
      }),
    ).toBe(false);
  });

  it("un checkout.session.completed Istruttoria LIVE produce la patch canonica", () => {
    const session = liveCheckoutSession();
    const user = webhookUserLookup({
      metadataUserId: (session.metadata as { supabase_user_id: string }).supabase_user_id,
      linkedUserId: null,
    });
    expect(user).toEqual({ ok: true, userId: USER_ID });

    const sub = liveCanonicalSubscription();
    expect(session.subscription).toBe(sub.id);
    expect(
      canonicalSubscriptionGuard({
        subscription: sub,
        expectedSubscriptionId: session.subscription,
        expectedCustomerId: session.customer,
        linkedCustomerId: null,
        priceMap: ISTRUTTORIA_LIVE_MAP,
        expectedLivemode: true,
      }).ok,
    ).toBe(true);

    const mapped = subscriptionUpdateFromEvent({
      status: sub.status,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      priceId: canonicalPriceId(sub),
      subscriptionId: session.subscription,
      customerId: sub.customer,
      priceMap: ISTRUTTORIA_LIVE_MAP,
      billingMode: "live",
    });
    expect(mapped.ok).toBe(true);
    expect(mapped.code).toBe("OK");
    expect(mapped.patch).toMatchObject({
      status: "active",
      provider: "stripe",
      billing_mode: "live",
      provider_customer_id: "cus_live_1",
      provider_subscription_id: "sub_live_1",
      stripe_price_id: "price_live_business_month",
      plan_code: "ueradar_business_monthly",
      plan_seats: 5,
    });
  });

  it("un checkout.session.completed annuale Istruttoria LIVE mappa il plan_code annuale", () => {
    const mapped = subscriptionUpdateFromEvent({
      status: "active",
      currentPeriodEnd: 1_900_000_000,
      cancelAtPeriodEnd: false,
      priceId: "price_live_business_year",
      subscriptionId: "sub_live_year",
      customerId: "cus_live_1",
      priceMap: ISTRUTTORIA_LIVE_MAP,
      billingMode: "live",
    });
    expect(mapped.ok).toBe(true);
    expect(mapped.patch?.plan_code).toBe("ueradar_business_annual");
    expect(mapped.patch?.billing_mode).toBe("live");
  });

  it("senza utente UERADAR l'evento completed non viene applicato", () => {
    const session = liveCheckoutSession({ metadata: {} });
    const user = webhookUserLookup({
      metadataUserId: (session.metadata as { supabase_user_id?: string }).supabase_user_id,
      linkedUserId: null,
    });
    expect(user).toEqual({ ok: false, code: "USER_NOT_FOUND" });
  });

  it("readBillingEnv LIVE con soli Price Istruttoria resta configured", () => {
    process.env = { ...originalEnv };
    process.env["UERADAR_BILLING_MODE"] = "live";
    process.env["UERADAR_BILLING_LIVE_ENABLED"] = "true";
    process.env["STRIPE_SECRET_KEY_LIVE"] = "sk_live_valid123";
    process.env["STRIPE_SECRET_KEY_TEST"] = "";
    process.env["STRIPE_SECRET_KEY"] = "";
    process.env["STRIPE_PRICE_BUSINESS_MONTHLY_LIVE"] = "price_live_business_month";
    process.env["STRIPE_PRICE_BUSINESS_ANNUAL_LIVE"] = "price_live_business_year";
    for (const name of [
      "STRIPE_PRICE_PROFESSIONAL_MONTHLY_LIVE",
      "STRIPE_PRICE_PROFESSIONAL_ANNUAL_LIVE",
      "STRIPE_PRICE_EXECUTIVE_MONTHLY_LIVE",
      "STRIPE_PRICE_EXECUTIVE_ANNUAL_LIVE",
      "STRIPE_PRICE_PROFESSIONAL_MONTHLY_TEST",
      "STRIPE_PRICE_PROFESSIONAL_ANNUAL_TEST",
      "STRIPE_PRICE_BUSINESS_MONTHLY_TEST",
      "STRIPE_PRICE_BUSINESS_ANNUAL_TEST",
      "STRIPE_PRICE_EXECUTIVE_MONTHLY_TEST",
      "STRIPE_PRICE_EXECUTIVE_ANNUAL_TEST",
    ]) {
      delete process.env[name];
    }

    const env = readBillingEnv();
    expect(env.mode).toBe("live");
    expect(env.missingPriceEnvs).toEqual([]);
    expect(env.priceMap).toEqual(ISTRUTTORIA_LIVE_MAP);
    expect(billingConfigured(env)).toEqual({ ok: true, code: "OK" });
    expect(selfServicePricesConfigured(env.priceMap)).toBe(true);

    const mapped = subscriptionUpdateFromEvent({
      status: "active",
      currentPeriodEnd: 1_900_000_000,
      cancelAtPeriodEnd: false,
      priceId: "price_live_business_month",
      subscriptionId: "sub_live_1",
      customerId: "cus_live_1",
      priceMap: env.priceMap,
      billingMode: env.mode ?? undefined,
    });
    expect(mapped.ok).toBe(true);
    expect(mapped.patch?.billing_mode).toBe("live");
  });
});
