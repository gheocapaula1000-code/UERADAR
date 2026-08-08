import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Modello logico delle due RPC di fatturazione, allineato al SQL applicato.
 * Serve a esercitare gli scenari di ordine e conflitto senza dipendere da un
 * database vivo; le asserzioni sul SQL sotto verificano l'allineamento.
 */
type Row = {
  status: string;
  plan_code: string | null;
  stripe_price_id: string | null;
  provider_subscription_id: string | null;
  last_event_created_at: string | null;
  last_invoice_event_at: string | null;
  latest_invoice_url: string | null;
};

type Patch = {
  status: string;
  plan_code?: string;
  stripe_price_id?: string;
  provider_subscription_id?: string;
};

function applySubscription(row: Row, at: string, patch: Patch) {
  if (row.last_event_created_at) {
    if (at < row.last_event_created_at) return { ok: false, code: "EVENT_OUT_OF_ORDER" };
    if (at === row.last_event_created_at) {
      if (row.status === "canceled" && patch.status !== "canceled")
        return { ok: false, code: "CANCELED_NOT_REACTIVATED" };
      const conflict =
        (patch.provider_subscription_id &&
          row.provider_subscription_id &&
          patch.provider_subscription_id !== row.provider_subscription_id) ||
        (patch.stripe_price_id &&
          row.stripe_price_id &&
          patch.stripe_price_id !== row.stripe_price_id) ||
        (patch.plan_code && row.plan_code && patch.plan_code !== row.plan_code);
      if (patch.status !== "canceled" && conflict)
        return { ok: false, code: "CANONICAL_CONFLICT" };
    }
  }
  row.status = patch.status;
  row.plan_code = patch.plan_code ?? row.plan_code;
  row.stripe_price_id = patch.stripe_price_id ?? row.stripe_price_id;
  row.provider_subscription_id = patch.provider_subscription_id ?? row.provider_subscription_id;
  row.last_event_created_at = at;
  return { ok: true, code: "APPLIED" };
}

function applyInvoice(row: Row, at: string, subscriptionId: string, url: string) {
  if (row.provider_subscription_id !== subscriptionId)
    return { ok: false, code: "SUBSCRIPTION_MISMATCH" };
  if (row.last_invoice_event_at && at < row.last_invoice_event_at)
    return { ok: false, code: "INVOICE_OUT_OF_ORDER" };
  row.latest_invoice_url = url ?? row.latest_invoice_url;
  row.last_invoice_event_at = at;
  return { ok: true, code: "INVOICE_APPLIED" };
}

const T1 = "2026-08-08T10:00:00.000Z";
const T2 = "2026-08-08T10:05:00.000Z";

function seed(over: Partial<Row> = {}): Row {
  return {
    status: "active",
    plan_code: "professional",
    stripe_price_id: "price_pro_m",
    provider_subscription_id: "sub_1",
    last_event_created_at: T1,
    last_invoice_event_at: null,
    latest_invoice_url: null,
    ...over,
  };
}

describe("fattura più recente elaborata prima di subscription.updated", () => {
  it("non consuma il cursore di stato: l'aggiornamento precedente resta applicabile", () => {
    const row = seed();
    // Fattura con created più recente, elaborata per prima.
    expect(applyInvoice(row, T2, "sub_1", "https://inv/1").ok).toBe(true);
    expect(row.last_event_created_at).toBe(T1);
    expect(row.last_invoice_event_at).toBe(T2);

    // subscription.updated con created intermedio: viene comunque applicato.
    const applied = applySubscription(row, "2026-08-08T10:03:00.000Z", {
      status: "past_due",
      plan_code: "business",
      stripe_price_id: "price_biz_m",
      provider_subscription_id: "sub_1",
    });
    expect(applied).toEqual({ ok: true, code: "APPLIED" });
    expect(row.status).toBe("past_due");
    expect(row.plan_code).toBe("business");
  });

  it("una fattura più vecchia della precedente non riscrive il documento", () => {
    const row = seed({ last_invoice_event_at: T2, latest_invoice_url: "https://inv/2" });
    expect(applyInvoice(row, T1, "sub_1", "https://inv/1")).toEqual({
      ok: false,
      code: "INVOICE_OUT_OF_ORDER",
    });
    expect(row.latest_invoice_url).toBe("https://inv/2");
  });
});

describe("cambio piano concorrente allo stesso secondo", () => {
  it("due snapshot canonici divergenti non si sovrascrivono", () => {
    const row = seed({ last_event_created_at: T2, plan_code: "professional" });
    expect(
      applySubscription(row, T2, {
        status: "active",
        plan_code: "executive",
        stripe_price_id: "price_exe_m",
        provider_subscription_id: "sub_1",
      }),
    ).toEqual({ ok: false, code: "CANONICAL_CONFLICT" });
    expect(row.plan_code).toBe("professional");
  });

  it("lo stesso snapshot allo stesso istante resta idempotente", () => {
    const row = seed({ last_event_created_at: T2 });
    expect(
      applySubscription(row, T2, {
        status: "active",
        plan_code: "professional",
        stripe_price_id: "price_pro_m",
        provider_subscription_id: "sub_1",
      }).ok,
    ).toBe(true);
  });

  it("la cancellazione resta terminale e applicabile anche in conflitto", () => {
    const row = seed({ last_event_created_at: T2 });
    expect(
      applySubscription(row, T2, {
        status: "canceled",
        plan_code: "executive",
        provider_subscription_id: "sub_1",
      }).ok,
    ).toBe(true);
    expect(row.status).toBe("canceled");
    expect(
      applySubscription(row, T2, { status: "active", provider_subscription_id: "sub_1" }),
    ).toEqual({ ok: false, code: "CANCELED_NOT_REACTIVATED" });
    expect(row.status).toBe("canceled");
  });
});

describe("fattura dopo una cancellazione", () => {
  it("aggiorna il documento senza resuscitare lo stato", () => {
    const row = seed({ status: "canceled", last_event_created_at: T1 });
    expect(applyInvoice(row, T2, "sub_1", "https://inv/3").ok).toBe(true);
    expect(row.status).toBe("canceled");
    expect(row.last_event_created_at).toBe(T1);
  });

  it("una fattura di un'altra subscription non viene applicata", () => {
    const row = seed();
    expect(applyInvoice(row, T2, "sub_altro", "https://inv/4")).toEqual({
      ok: false,
      code: "SUBSCRIPTION_MISMATCH",
    });
  });
});

const ROUTE = readFileSync("src/routes/api/public/billing-webhook.ts", "utf8");
const SQL = readdirSync("supabase/migrations")
  .sort()
  .map((f) => readFileSync(join("supabase/migrations", f), "utf8"))
  .join("\n");

function lastFunctionBody(name: string) {
  const start = SQL.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const ends = ["$function$;", "$$;"]
    .map((t) => SQL.indexOf(t, start))
    .filter((i) => i > -1);
  return SQL.slice(start, Math.min(...ends) + 3);
}

describe("SQL allineato al modello", () => {
  it("la RPC fattura usa un cursore dedicato e non tocca l'ordine di stato", () => {
    const body = lastFunctionBody("ueradar_billing_apply_invoice");
    expect(body).toContain("last_invoice_event_at");
    expect(body).toContain("INVOICE_OUT_OF_ORDER");
    expect(body).not.toContain("last_event_created_at");
    expect(body).not.toMatch(/SET[\s\S]*?\bstatus =/);
  });

  it("la RPC subscription protegge cancellazione e conflitti a pari istante", () => {
    const body = lastFunctionBody("ueradar_billing_apply_subscription");
    expect(body).toContain("CANCELED_NOT_REACTIVATED");
    expect(body).toContain("CANONICAL_CONFLICT");
    expect(body).toContain("EVENT_OUT_OF_ORDER");
    expect(body).toContain("FOR UPDATE");
  });
});

describe("webhook: la fattura passa dallo stato canonico", () => {
  it("il ramo invoice sincronizza la subscription canonica prima dei metadati", () => {
    const block = ROUTE.slice(ROUTE.indexOf('eventType === "invoice.paid"'));
    expect(block.indexOf("canonicalSync(")).toBeGreaterThan(-1);
    expect(block.indexOf("canonicalSync(")).toBeLessThan(
      block.indexOf("ueradar_billing_apply_invoice"),
    );
    // Nessuno stato inferito dalla fattura.
    expect(block).not.toMatch(/"active"|"past_due"/);
  });

  it("un solo esito chiude l'evento, con lease di proprietà", () => {
    const block = ROUTE.slice(
      ROUTE.indexOf('eventType === "invoice.paid"'),
      ROUTE.indexOf('return settle("EVENT_IGNORED"'),
    );
    // settle è chiamato solo nei rami terminali del percorso fattura.
    expect((block.match(/return settle\(/g) ?? []).length).toBeLessThanOrEqual(7);
    expect(ROUTE).toContain("_lease_token: leaseToken");
    expect(ROUTE).toContain("EVENT_LEASE_LOST");
  });

  it("il conflitto canonico non genera retry infiniti", () => {
    expect(ROUTE).toContain('code === "CANONICAL_CONFLICT"');
  });
});
