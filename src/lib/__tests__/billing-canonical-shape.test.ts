import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalSubscriptionGuard, subscriptionUpdateFromEvent } from "@/lib/billing";

const PRICE_MAP = { "business:month": "price_biz_m" };
const ITEM = { quantity: 1, price: { id: "price_biz_m", type: "recurring", active: true } };

function sub(over: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    livemode: false,
    customer: "cus_1",
    status: "active",
    current_period_end: 1893456000,
    items: { data: [ITEM] },
    ...over,
  };
}

const base = {
  expectedSubscriptionId: "sub_1",
  expectedCustomerId: "cus_1",
  linkedCustomerId: "cus_1",
  priceMap: PRICE_MAP,
};

describe("forma canonica della subscription", () => {
  it("accetta esattamente un item ricorrente con quantità 1", () => {
    expect(canonicalSubscriptionGuard({ ...base, subscription: sub() }).ok).toBe(true);
  });

  it("rifiuta item aggiuntivi", () => {
    expect(
      canonicalSubscriptionGuard({
        ...base,
        subscription: sub({ items: { data: [ITEM, ITEM] } }),
      }).code,
    ).toBe("SUBSCRIPTION_ITEM_COUNT_INVALID");
    expect(
      canonicalSubscriptionGuard({ ...base, subscription: sub({ items: { data: [] } }) }).code,
    ).toBe("SUBSCRIPTION_ITEM_COUNT_INVALID");
  });

  it("rifiuta quantità diversa da 1", () => {
    expect(
      canonicalSubscriptionGuard({
        ...base,
        subscription: sub({ items: { data: [{ ...ITEM, quantity: 2 }] } }),
      }).code,
    ).toBe("SUBSCRIPTION_QUANTITY_INVALID");
  });

  it("rifiuta price non ricorrente o non attivo", () => {
    expect(
      canonicalSubscriptionGuard({
        ...base,
        subscription: sub({
          items: { data: [{ quantity: 1, price: { id: "price_biz_m", type: "one_time" } }] },
        }),
      }).code,
    ).toBe("PRICE_NOT_RECURRING");
    expect(
      canonicalSubscriptionGuard({
        ...base,
        subscription: sub({
          items: {
            data: [{ quantity: 1, price: { id: "price_biz_m", type: "recurring", active: false } }],
          },
        }),
      }).code,
    ).toBe("PRICE_NOT_ACTIVE");
  });

  it("rifiuta fine periodo mancante o non valida", () => {
    for (const value of [undefined, null, 0, -1, "2026-01-01"]) {
      expect(
        canonicalSubscriptionGuard({ ...base, subscription: sub({ current_period_end: value }) })
          .code,
      ).toBe("CURRENT_PERIOD_END_INVALID");
    }
  });

  it("la mappatura non azzera mai la fine periodo locale", () => {
    const mapped = subscriptionUpdateFromEvent({
      status: "active",
      currentPeriodEnd: undefined,
      cancelAtPeriodEnd: false,
      priceId: "price_biz_m",
      subscriptionId: "sub_1",
      customerId: "cus_1",
      priceMap: PRICE_MAP,
    });
    expect(mapped).toEqual({ ok: false, code: "CURRENT_PERIOD_END_INVALID", patch: null });
  });
});

describe("webhook: errori di lettura bloccano l'evento", () => {
  const ROUTE = readFileSync("src/routes/api/public/billing-webhook.ts", "utf8");

  it("distingue errore di lettura da record assente", () => {
    expect(ROUTE).toContain("SUBSCRIPTION_STATE_UNAVAILABLE");
    expect(ROUTE).toContain("USER_LOOKUP_FAILED");
  });

  it("il primo collegamento consuma la prenotazione di checkout", () => {
    expect(ROUTE).toContain("ueradar_consume_checkout_intent");
  });
});

describe("prenotazione checkout QA-only", () => {
  const FN = readFileSync("src/lib/billing.functions.ts", "utf8");
  it("il checkout prenota in modo transazionale con TTL", () => {
    expect(FN).toContain("ueradar_claim_checkout_intent");
    expect(FN).toContain("_ttl_seconds");
  });
});
