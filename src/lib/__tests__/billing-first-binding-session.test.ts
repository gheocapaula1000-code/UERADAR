import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKOUT_TTL_SECONDS, checkoutSessionExpiresAt } from "../billing";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const SQL = readdirSync(MIGRATIONS)
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");
const ROUTE = readFileSync("src/routes/api/public/billing-webhook.ts", "utf8");
const FNS = readFileSync("src/lib/billing.functions.ts", "utf8");

function lastBody(name: string) {
  const start = SQL.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, name).toBeGreaterThan(-1);
  const end = SQL.indexOf("$function$;", start);
  return SQL.slice(start, end);
}

/** Modello del primo binding allineato al SQL applicato. */
type Intent = { price_id: string; session_id: string | null; expires_at: number };

class Db {
  now = 0;
  intent: Intent | null = null;
  sub = { customer: null as string | null, subscription: null as string | null };
  event = { status: "processing", token: "t1" as string | null, expires: 100 };

  apply(i: {
    expCustomer: string | null;
    expSubscription: string | null;
    expPrice: string | null;
    sessionId: string | null;
    token?: string;
  }) {
    if (
      this.event.status !== "processing" ||
      this.event.token !== (i.token ?? "t1") ||
      this.event.expires <= this.now
    )
      return { ok: false, code: "LEASE_LOST" };
    const first = this.sub.subscription === null;
    if (!first) {
      if (i.expSubscription !== this.sub.subscription)
        return { ok: false, code: "SUBSCRIPTION_REASSIGNMENT_BLOCKED" };
    } else {
      if (!i.sessionId)
        return { ok: false, code: "FIRST_BINDING_REQUIRES_CHECKOUT_SESSION" };
      if (!i.expSubscription) return { ok: false, code: "FIRST_BINDING_SUBSCRIPTION_REQUIRED" };
      if (!i.expCustomer) return { ok: false, code: "FIRST_BINDING_CUSTOMER_REQUIRED" };
      if (!i.expPrice) return { ok: false, code: "FIRST_BINDING_PRICE_REQUIRED" };
      if (!this.intent) return { ok: false, code: "CHECKOUT_INTENT_MISSING" };
      if (this.intent.session_id !== i.sessionId)
        return { ok: false, code: "CHECKOUT_SESSION_MISMATCH" };
      if (this.intent.price_id !== i.expPrice)
        return { ok: false, code: "CHECKOUT_INTENT_PRICE_MISMATCH" };
      if (this.intent.expires_at <= this.now)
        return { ok: false, code: "CHECKOUT_INTENT_EXPIRED" };
    }
    this.sub.subscription = i.expSubscription;
    this.sub.customer = i.expCustomer;
    if (first) this.intent = null;
    return { ok: true, code: "APPLIED", first_binding: first };
  }

  settle(token: string | null) {
    if (
      this.event.status !== "processing" ||
      token === null ||
      this.event.token !== token ||
      this.event.expires <= this.now
    )
      return { ok: false, code: "LEASE_LOST" };
    this.event.status = "succeeded";
    this.event.token = null;
    return { ok: true, code: "SETTLED" };
  }
}

function seeded() {
  const db = new Db();
  db.intent = { price_id: "price_biz_m", session_id: "cs_1", expires_at: CHECKOUT_TTL_SECONDS };
  return db;
}

describe("primo binding legato alla Checkout Session esatta", () => {
  const good = {
    expCustomer: "cus_1",
    expSubscription: "sub_1",
    expPrice: "price_biz_m",
    sessionId: "cs_1",
  };

  it("lega solo con sessione, cliente, abbonamento e prezzo coerenti", () => {
    const db = seeded();
    expect(db.apply(good)).toMatchObject({ ok: true, first_binding: true });
    expect(db.intent).toBeNull();
  });

  it("evento subscription.* anticipato non può legare senza sessione", () => {
    const db = seeded();
    expect(db.apply({ ...good, sessionId: null }).code).toBe(
      "FIRST_BINDING_REQUIRES_CHECKOUT_SESSION",
    );
    expect(db.sub.subscription).toBeNull();
    expect(db.intent).not.toBeNull();
  });

  it("sessione diversa da quella registrata: rifiuto e intento preservato", () => {
    const db = seeded();
    expect(db.apply({ ...good, sessionId: "cs_altro" }).code).toBe("CHECKOUT_SESSION_MISMATCH");
    expect(db.intent).not.toBeNull();
  });

  it("cliente o abbonamento attesi mancanti: fail-closed", () => {
    expect(seeded().apply({ ...good, expCustomer: null }).code).toBe(
      "FIRST_BINDING_CUSTOMER_REQUIRED",
    );
    expect(seeded().apply({ ...good, expSubscription: null }).code).toBe(
      "FIRST_BINDING_SUBSCRIPTION_REQUIRED",
    );
    expect(seeded().apply({ ...good, expPrice: null }).code).toBe("FIRST_BINDING_PRICE_REQUIRED");
  });

  it("intento scaduto: completamento fuori finestra non lega", () => {
    const db = seeded();
    db.now = CHECKOUT_TTL_SECONDS + 1;
    db.event.expires = db.now + 100;
    expect(db.apply(good).code).toBe("CHECKOUT_INTENT_EXPIRED");
    expect(db.sub.subscription).toBeNull();
  });

  it("abbonamento già legato: nessuna riassegnazione, retry idempotente ok", () => {
    const db = seeded();
    db.apply(good);
    expect(db.apply({ ...good, expSubscription: "sub_2" }).code).toBe(
      "SUBSCRIPTION_REASSIGNMENT_BLOCKED",
    );
    expect(db.apply({ ...good, sessionId: null })).toMatchObject({ ok: true, first_binding: false });
  });

  it("settle: worker scaduto o evento già chiuso non muta nulla", () => {
    const db = seeded();
    expect(db.settle("t_altro").code).toBe("LEASE_LOST");
    db.now = 200;
    expect(db.settle("t1").code).toBe("LEASE_LOST");
    db.now = 0;
    expect(db.settle("t1").ok).toBe(true);
    expect(db.settle("t1").code).toBe("LEASE_LOST");
  });
});

describe("TTL allineato fra intento e sessione", () => {
  it("la sessione scade nella stessa finestra dell'intento, in epoch Unix", () => {
    const now = 1_800_000_000_000;
    expect(checkoutSessionExpiresAt(now)).toBe(now / 1000 + CHECKOUT_TTL_SECONDS);
    expect(CHECKOUT_TTL_SECONDS).toBe(1860);
    // Limiti Stripe: fra 30 minuti e 24 ore dalla creazione.
    const delta = checkoutSessionExpiresAt(now) - now / 1000;
    expect(delta).toBeGreaterThanOrEqual(1800);
    expect(delta).toBeLessThanOrEqual(86400);
  });

  it("il checkout dichiara expires_at e riusa il TTL condiviso", () => {
    expect(FNS).toContain("checkoutSessionExpiresAt(Date.now())");
    expect(FNS).toContain("_ttl_seconds: CHECKOUT_TTL_SECONDS");
  });
});

describe("SQL e webhook allineati al contratto di primo binding", () => {
  it("l'RPC apply riceve la sessione e la verifica sotto lock", () => {
    const body = lastBody("ueradar_billing_apply_subscription");
    expect(body).toContain("_checkout_session_id");
    expect(body).toContain("FIRST_BINDING_REQUIRES_CHECKOUT_SESSION");
    expect(body).toContain("CHECKOUT_SESSION_MISMATCH");
    expect(body).toContain("FIRST_BINDING_CUSTOMER_REQUIRED");
    expect(body).toContain("pg_advisory_xact_lock");
    expect(body).toContain("ueradar_billing_assert_lease");
  });

  it("nessuna riassegnazione consentita per canceled o incomplete_expired", () => {
    const body = lastBody("ueradar_billing_apply_subscription");
    expect(body).not.toContain("NOT IN ('canceled', 'incomplete_expired')");
    const guard = body.slice(body.indexOf("SUBSCRIPTION_REASSIGNMENT_BLOCKED") - 600);
    expect(guard).toContain("SUBSCRIPTION_REASSIGNMENT_BLOCKED");
  });

  it("settle verifica stato, token e scadenza sotto lock", () => {
    const body = lastBody("ueradar_billing_settle_event");
    expect(body).toContain("FOR UPDATE");
    expect(body).toContain("'processing'");
    expect(body).toContain("lease_expires_at <= clock_timestamp()");
  });

  it("solo il servizio interno può eseguire le RPC aggiornate", () => {
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.ueradar_billing_settle_event[^;]*service_role/);
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.ueradar_billing_apply_subscription\(uuid, text, uuid, timestamptz, text, text, text, text, jsonb\)/);
  });

  it("il webhook passa l'id di sessione solo per checkout.session.completed", () => {
    expect(ROUTE).toContain("_checkout_session_id: checkoutSessionId");
    expect(ROUTE).toContain('syncFromCanonical(subscriptionId, userId, "SUBSCRIPTION_SYNCED", "")');
    expect(ROUTE).toContain('const sessionId = str(object["id"]);');
    expect(ROUTE).toContain('syncFromCanonical(subscriptionId, userId, "CHECKOUT_SYNCED", sessionId)');
  });

  it("attach non confermato: nessun URL restituito e nessuna seconda sessione", () => {
    expect(FNS).toContain("CHECKOUT_SESSION_ATTACH_FAILED");
    const i = FNS.indexOf("ueradar_attach_checkout_session");
    const tail = FNS.slice(i, i + 900);
    expect(tail).toContain("attachError");
    expect(tail).toContain("attachResult.ok");
    expect(tail.indexOf("CHECKOUT_SESSION_ATTACH_FAILED")).toBeLessThan(tail.indexOf("return { ok: true, url"));
  });
});
