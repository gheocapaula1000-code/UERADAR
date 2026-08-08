import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalPriceId, canonicalSubscriptionGuard, orderingDecision } from "@/lib/billing";

const PRICE_MAP = { "business:month": "price_biz_m" };

function sub(over: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    livemode: false,
    customer: "cus_1",
    status: "active",
    items: { data: [{ price: { id: "price_biz_m" } }] },
    ...over,
  };
}

describe("subscription canonica: validazione fail-closed", () => {
  const base = {
    expectedSubscriptionId: "sub_1",
    expectedCustomerId: "cus_1",
    linkedCustomerId: "cus_1",
    priceMap: PRICE_MAP,
  };

  it("accetta solo un oggetto esplicitamente di test", () => {
    expect(canonicalSubscriptionGuard({ ...base, subscription: sub() }).ok).toBe(true);
    expect(canonicalSubscriptionGuard({ ...base, subscription: sub({ livemode: true }) })).toEqual({
      ok: false,
      code: "LIVE_MODE_BLOCKED",
    });
    expect(
      canonicalSubscriptionGuard({ ...base, subscription: sub({ livemode: undefined }) }).code,
    ).toBe("SUBSCRIPTION_MODE_UNKNOWN");
  });

  it("rifiuta subscription, customer o Price non coerenti", () => {
    expect(canonicalSubscriptionGuard({ ...base, subscription: sub({ id: "sub_x" }) }).code).toBe(
      "SUBSCRIPTION_MISMATCH",
    );
    expect(
      canonicalSubscriptionGuard({ ...base, subscription: sub({ customer: "cus_x" }) }).code,
    ).toBe("CUSTOMER_MISMATCH");
    // Customer diverso da quello già collegato all'utente/tenant.
    expect(
      canonicalSubscriptionGuard({
        ...base,
        expectedCustomerId: "cus_2",
        subscription: sub({ customer: "cus_2" }),
      }).code,
    ).toBe("CUSTOMER_NOT_LINKED_TO_USER");
    expect(
      canonicalSubscriptionGuard({
        ...base,
        subscription: sub({ items: { data: [{ price: { id: "price_ignoto" } }] } }),
      }).code,
    ).toBe("PRICE_NOT_ALLOWLISTED");
  });

  it("rifiuta un recupero fallito", () => {
    expect(canonicalSubscriptionGuard({ ...base, subscription: null }).code).toBe(
      "SUBSCRIPTION_FETCH_FAILED",
    );
  });

  it("legge il Price dalla prima riga della subscription", () => {
    expect(canonicalPriceId(sub())).toBe("price_biz_m");
    expect(canonicalPriceId({ items: { data: [] } })).toBeNull();
  });
});

describe("concorrenza logica degli eventi", () => {
  const T1 = "2026-08-08T10:00:00.000Z";
  const T2 = "2026-08-08T10:05:00.000Z";

  it("un evento vecchio che termina dopo uno nuovo non sovrascrive", () => {
    expect(
      orderingDecision({
        eventCreatedAt: T1,
        lastAppliedAt: T2,
        currentStatus: "canceled",
        nextStatus: "active",
      }),
    ).toEqual({ ok: false, code: "EVENT_OUT_OF_ORDER" });
  });

  it("a parità di istante un annullamento non viene riattivato", () => {
    expect(
      orderingDecision({
        eventCreatedAt: T2,
        lastAppliedAt: T2,
        currentStatus: "canceled",
        nextStatus: "active",
      }),
    ).toEqual({ ok: false, code: "CANCELED_NOT_REACTIVATED" });
    // L'annullamento resta applicabile anche a parità di istante.
    expect(
      orderingDecision({
        eventCreatedAt: T2,
        lastAppliedAt: T2,
        currentStatus: "active",
        nextStatus: "canceled",
      }).ok,
    ).toBe(true);
  });

  it("un evento più recente viene applicato", () => {
    expect(
      orderingDecision({
        eventCreatedAt: T2,
        lastAppliedAt: T1,
        currentStatus: "trialing",
        nextStatus: "active",
      }).ok,
    ).toBe(true);
  });
});

const ROUTE = readFileSync("src/routes/api/public/billing-webhook.ts", "utf8");
const SQL = readdirSync("supabase/migrations")
  .sort()
  .map((f) => readFileSync(join("supabase/migrations", f), "utf8"))
  .join("\n");

describe("webhook: percorso canonico, lease e RPC atomica", () => {
  it("ogni evento di subscription rilegge la subscription canonica dal provider", () => {
    expect(ROUTE).toContain("syncFromCanonical");
    expect(ROUTE).toContain("canonicalSubscriptionGuard");
    // checkout e i tre eventi subscription passano tutti dallo stesso percorso.
    expect((ROUTE.match(/syncFromCanonical\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("una fattura non imposta mai attivo o insoluto", () => {
    const invoiceBlock = ROUTE.slice(ROUTE.indexOf('eventType === "invoice.paid"'));
    expect(invoiceBlock).not.toMatch(/"active"/);
    expect(invoiceBlock).not.toMatch(/"past_due"/);
    expect(invoiceBlock).toContain("ueradar_billing_apply_invoice");
  });

  it("la scrittura passa da RPC atomiche con lease di proprietà", () => {
    expect(ROUTE).toContain("ueradar_billing_claim_event");
    expect(ROUTE).toContain("ueradar_billing_settle_event");
    expect(ROUTE).toContain("ueradar_billing_apply_subscription");
    expect(ROUTE).toContain("_lease_token: leaseToken");
    expect(ROUTE).toContain("EVENT_LEASE_LOST");
    // Nessuna scrittura diretta sull'anagrafica abbonamenti dal webhook.
    expect(ROUTE).not.toMatch(/from\("ueradar_subscriptions"\)[\s\S]{0,40}\.update\(/);
  });

  it("il database garantisce lock, ordine e proprietà del lease", () => {
    expect(SQL).toContain("ueradar_billing_apply_subscription");
    expect(SQL).toMatch(/FROM public\.ueradar_subscriptions\s+WHERE user_id = _user_id FOR UPDATE/);
    expect(SQL).toContain("CANCELED_NOT_REACTIVATED");
    expect(SQL).toContain("EVENT_OUT_OF_ORDER");
    expect(SQL).toContain("lease_token IS NOT DISTINCT FROM _lease_token");
    expect(SQL).toContain("LEASE_LOST");
  });

  it("la funzione fattura non tocca la colonna di stato né l'ordine degli eventi", () => {
    const start = SQL.lastIndexOf(
      "CREATE OR REPLACE FUNCTION public.ueradar_billing_apply_invoice",
    );
    const body = SQL.slice(start, SQL.indexOf("$function$;", start) + 11);
    expect(body).toContain("latest_invoice_url");
    expect(body).toContain("last_invoice_event_at");
    expect(body).not.toContain("last_event_created_at");
    expect(body).not.toMatch(/SET[\s\S]*?\bstatus =/);
  });
});
