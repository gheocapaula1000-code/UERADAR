import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Modello logico dell'evento sotto lease e delle due RPC apply, allineato al
 * SQL applicato: ogni scrittura è preceduta, nella stessa transazione, dalla
 * verifica della presa in carico.
 */
type EventRow = {
  status: "processing" | "succeeded" | "failed";
  lease_token: string | null;
  lease_expires_at: number | null;
};

type SubRow = {
  status: string;
  plan_code: string | null;
  stripe_price_id: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  last_event_created_at: string | null;
  last_invoice_event_at: string | null;
  latest_invoice_url: string | null;
};

class Db {
  now = 0;
  event: EventRow = { status: "processing", lease_token: null, lease_expires_at: null };
  sub: SubRow = {
    status: "active",
    plan_code: "professional",
    stripe_price_id: "price_pro_m",
    provider_customer_id: "cus_1",
    provider_subscription_id: "sub_1",
    last_event_created_at: null,
    last_invoice_event_at: null,
    latest_invoice_url: null,
  };

  claim(token: string, leaseSeconds = 300) {
    const ev = this.event;
    if (ev.status === "succeeded") return { ok: false, code: "ALREADY_PROCESSED" };
    if (
      ev.status === "processing" &&
      ev.lease_token &&
      ev.lease_expires_at !== null &&
      ev.lease_expires_at > this.now
    )
      return { ok: false, code: "EVENT_ALREADY_IN_PROGRESS" };
    ev.status = "processing";
    ev.lease_token = token;
    ev.lease_expires_at = this.now + leaseSeconds;
    return { ok: true, code: "CLAIMED" };
  }

  private leaseValid(token: string) {
    const ev = this.event;
    return (
      ev.status === "processing" &&
      ev.lease_token === token &&
      ev.lease_expires_at !== null &&
      ev.lease_expires_at > this.now
    );
  }

  applySubscription(
    token: string,
    at: string,
    expected: { customer?: string; subscription?: string; price?: string },
    patch: Partial<SubRow> & { status: string },
  ) {
    if (!this.leaseValid(token)) return { ok: false, code: "LEASE_LOST" };
    const row = this.sub;
    if (expected.price && patch.stripe_price_id && expected.price !== patch.stripe_price_id)
      return { ok: false, code: "PRICE_MISMATCH" };
    if (
      row.provider_customer_id &&
      ((expected.customer && expected.customer !== row.provider_customer_id) ||
        (patch.provider_customer_id && patch.provider_customer_id !== row.provider_customer_id))
    )
      return { ok: false, code: "CUSTOMER_MISMATCH" };
    if (
      row.provider_subscription_id &&
      !["canceled", "incomplete_expired"].includes(row.status) &&
      ((expected.subscription && expected.subscription !== row.provider_subscription_id) ||
        (patch.provider_subscription_id &&
          patch.provider_subscription_id !== row.provider_subscription_id))
    )
      return { ok: false, code: "SUBSCRIPTION_REASSIGNMENT_BLOCKED" };
    if (row.last_event_created_at && at < row.last_event_created_at)
      return { ok: false, code: "EVENT_OUT_OF_ORDER" };
    Object.assign(row, patch, { last_event_created_at: at });
    return { ok: true, code: "APPLIED" };
  }

  applyInvoice(token: string, at: string, expectedCustomer: string, subscriptionId: string, url: string) {
    if (!this.leaseValid(token)) return { ok: false, code: "LEASE_LOST" };
    const row = this.sub;
    if (row.provider_customer_id && expectedCustomer && expectedCustomer !== row.provider_customer_id)
      return { ok: false, code: "CUSTOMER_MISMATCH" };
    if (row.provider_subscription_id !== subscriptionId)
      return { ok: false, code: "SUBSCRIPTION_MISMATCH" };
    row.latest_invoice_url = url;
    row.last_invoice_event_at = at;
    return { ok: true, code: "INVOICE_APPLIED" };
  }

  settle(token: string, ok: boolean) {
    if (this.event.lease_token !== token) return { ok: false, code: "LEASE_LOST" };
    this.event.status = ok ? "succeeded" : "failed";
    this.event.lease_token = null;
    this.event.lease_expires_at = null;
    return { ok: true, code: "SETTLED" };
  }
}

const T = "2026-08-08T11:00:00.000Z";

describe("worker scaduto e sostituito da un retry", () => {
  it("A non scrive nulla e non chiude l'evento: B è l'unico writer", () => {
    const db = new Db();
    expect(db.claim("tok-A").ok).toBe(true);

    // Il lease di A scade e B reclama l'evento.
    db.now = 400;
    expect(db.claim("tok-B").ok).toBe(true);

    // A si risveglia e prova ad applicare: negato prima di ogni scrittura.
    expect(db.applySubscription("tok-A", T, { subscription: "sub_1" }, {
      status: "canceled",
    })).toEqual({ ok: false, code: "LEASE_LOST" });
    expect(db.applyInvoice("tok-A", T, "cus_1", "sub_1", "https://inv/A")).toEqual({
      ok: false,
      code: "LEASE_LOST",
    });
    expect(db.sub.status).toBe("active");
    expect(db.sub.latest_invoice_url).toBeNull();

    // Anche la chiusura di A è negata.
    expect(db.settle("tok-A", true)).toEqual({ ok: false, code: "LEASE_LOST" });

    // B scrive e chiude.
    expect(db.applySubscription("tok-B", T, { subscription: "sub_1" }, {
      status: "past_due",
    }).ok).toBe(true);
    expect(db.settle("tok-B", true).ok).toBe(true);
    expect(db.sub.status).toBe("past_due");
    expect(db.event.status).toBe("succeeded");
  });

  it("dopo la chiusura, lo stesso token non riapre l'evento", () => {
    const db = new Db();
    db.claim("tok-A");
    db.settle("tok-A", true);
    expect(db.applySubscription("tok-A", T, {}, { status: "canceled" })).toEqual({
      ok: false,
      code: "LEASE_LOST",
    });
    expect(db.claim("tok-C")).toEqual({ ok: false, code: "ALREADY_PROCESSED" });
  });
});

describe("legame utente/cliente/abbonamento/prezzo deciso sotto lock", () => {
  it("un evento con cliente diverso non riassegna il cliente dell'utente", () => {
    const db = new Db();
    db.claim("tok");
    expect(
      db.applySubscription("tok", T, { customer: "cus_altro", subscription: "sub_1" }, {
        status: "active",
        provider_customer_id: "cus_altro",
      }),
    ).toEqual({ ok: false, code: "CUSTOMER_MISMATCH" });
    expect(db.sub.provider_customer_id).toBe("cus_1");
  });

  it("due checkout concorrenti: il secondo non sostituisce l'abbonamento attivo", () => {
    const db = new Db();
    db.claim("tok");
    expect(
      db.applySubscription("tok", T, { customer: "cus_1", subscription: "sub_2" }, {
        status: "active",
        provider_subscription_id: "sub_2",
        plan_code: "executive",
      }),
    ).toEqual({ ok: false, code: "SUBSCRIPTION_REASSIGNMENT_BLOCKED" });
    expect(db.sub.provider_subscription_id).toBe("sub_1");
    expect(db.sub.plan_code).toBe("professional");
  });

  it("dopo la cancellazione un nuovo abbonamento è ammesso", () => {
    const db = new Db();
    db.claim("tok");
    db.sub.status = "canceled";
    expect(
      db.applySubscription("tok", T, { customer: "cus_1", subscription: "sub_2" }, {
        status: "active",
        provider_subscription_id: "sub_2",
      }).ok,
    ).toBe(true);
    expect(db.sub.provider_subscription_id).toBe("sub_2");
  });

  it("Price incoerente con lo snapshot atteso non viene applicato", () => {
    const db = new Db();
    db.claim("tok");
    expect(
      db.applySubscription("tok", T, { subscription: "sub_1", price: "price_exe_m" }, {
        status: "active",
        stripe_price_id: "price_biz_m",
      }),
    ).toEqual({ ok: false, code: "PRICE_MISMATCH" });
    expect(db.sub.stripe_price_id).toBe("price_pro_m");
  });

  it("una fattura di un cliente diverso non tocca i metadati", () => {
    const db = new Db();
    db.claim("tok");
    expect(db.applyInvoice("tok", T, "cus_altro", "sub_1", "https://inv/x")).toEqual({
      ok: false,
      code: "CUSTOMER_MISMATCH",
    });
    expect(db.sub.latest_invoice_url).toBeNull();
  });
});

const ROUTE = readFileSync("src/routes/api/public/billing-webhook.ts", "utf8");
const SQL = readdirSync("supabase/migrations")
  .sort()
  .map((f) => readFileSync(join("supabase/migrations", f), "utf8"))
  .join("\n");

function lastBody(name: string) {
  const start = SQL.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, name).toBeGreaterThan(-1);
  return SQL.slice(start, SQL.indexOf("$function$;", start) + 11);
}

describe("SQL: lease e identità verificati prima di ogni UPDATE", () => {
  for (const fn of ["ueradar_billing_apply_subscription", "ueradar_billing_apply_invoice"]) {
    it(`${fn} riceve evento e token e blocca il lease perso`, () => {
      const body = lastBody(fn);
      expect(body).toContain("_event_id");
      expect(body).toContain("_lease_token");
      expect(body).toContain("ueradar_billing_assert_lease");
      expect(body).toContain("LEASE_LOST");
      // La verifica precede qualunque scrittura.
      expect(body.indexOf("ueradar_billing_assert_lease")).toBeLessThan(
        body.indexOf("UPDATE public.ueradar_subscriptions"),
      );
    });
  }

  it("assert_lease blocca l'evento e richiede token vivo e stato processing", () => {
    const body = lastBody("ueradar_billing_assert_lease");
    expect(body).toContain("FOR UPDATE");
    expect(body).toContain("'processing'");
    expect(body).toContain("lease_expires_at > now()");
  });

  it("la RPC subscription valida cliente, abbonamento e prezzo attesi", () => {
    const body = lastBody("ueradar_billing_apply_subscription");
    expect(body).toContain("_expected_customer");
    expect(body).toContain("_expected_subscription");
    expect(body).toContain("_expected_price");
    expect(body).toContain("CUSTOMER_MISMATCH");
    expect(body).toContain("SUBSCRIPTION_REASSIGNMENT_BLOCKED");
    expect(body).toContain("PRICE_MISMATCH");
  });

  it("le RPC restano eseguibili solo dal servizio interno", () => {
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.ueradar_billing_apply_subscription/);
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.ueradar_billing_apply_invoice[^;]*service_role/);
  });
});

describe("webhook: passa evento, token e identità attesa", () => {
  it("ogni chiamata apply include event_id e lease_token", () => {
    for (const rpc of ["ueradar_billing_apply_subscription", "ueradar_billing_apply_invoice"]) {
      const i = ROUTE.indexOf(rpc);
      expect(i, rpc).toBeGreaterThan(-1);
      const call = ROUTE.slice(i, ROUTE.indexOf("});", i));
      expect(call, rpc).toContain("_event_id");
      expect(call, rpc).toContain("_lease_token: leaseToken");
      expect(call, rpc).toContain("_expected_customer");
    }
  });

  it("la sincronizzazione canonica dichiara abbonamento e prezzo attesi", () => {
    const i = ROUTE.indexOf("ueradar_billing_apply_subscription");
    const call = ROUTE.slice(i, ROUTE.indexOf("});", i));
    expect(call).toContain("_expected_subscription: subscriptionId");
    expect(call).toContain("_expected_price");
  });

  it("i rifiuti di identità non generano retry infiniti", () => {
    expect(ROUTE).toContain('code === "CUSTOMER_MISMATCH"');
    expect(ROUTE).toContain('code === "SUBSCRIPTION_REASSIGNMENT_BLOCKED"');
    expect(ROUTE).toContain('code === "PRICE_MISMATCH"');
  });
});
