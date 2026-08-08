import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const sql = readdirSync(MIGRATIONS)
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");

/**
 * Modello logico allineato al SQL applicato: prenotazione checkout, primo
 * binding e consumo vivono nella stessa transazione dell'apply.
 */
type Intent = { price_id: string; session_id: string | null; expires_at: number };

class Db {
  now = 0;
  intent: Intent | null = null;
  sub = { provider_subscription_id: null as string | null, stripe_price_id: null as string | null };
  leaseValid = true;

  claim(priceId: string) {
    if (this.intent && this.intent.expires_at > this.now)
      return {
        ok: false,
        code: "CHECKOUT_ALREADY_IN_PROGRESS",
        session_id: this.intent.session_id,
        price_id: this.intent.price_id,
      };
    this.intent = { price_id: priceId, session_id: null, expires_at: this.now + 1800 };
    return { ok: true, code: "OK" };
  }

  attach(priceId: string, sessionId: string) {
    if (!this.intent) return { ok: false, code: "CHECKOUT_INTENT_MISSING" };
    if (this.intent.price_id !== priceId)
      return { ok: false, code: "CHECKOUT_INTENT_PRICE_MISMATCH" };
    if (this.intent.session_id && this.intent.session_id !== sessionId)
      return { ok: false, code: "CHECKOUT_SESSION_ALREADY_BOUND" };
    this.intent.session_id = sessionId;
    return { ok: true, code: "OK" };
  }

  release(priceId: string) {
    if (!this.intent || this.intent.price_id !== priceId || this.intent.session_id !== null)
      return { ok: false, code: "CHECKOUT_INTENT_NOT_RELEASABLE" };
    this.intent = null;
    return { ok: true, code: "OK" };
  }

  /** apply: nessuna scrittura e nessun consumo se un solo controllo fallisce. */
  apply(input: { subscriptionId: string; priceId: string; writeFails?: boolean }) {
    if (!this.leaseValid) return { ok: false, code: "LEASE_LOST" };
    const first = this.sub.provider_subscription_id === null;
    if (first) {
      if (!this.intent) return { ok: false, code: "CHECKOUT_INTENT_MISSING" };
      if (this.intent.price_id !== input.priceId)
        return { ok: false, code: "CHECKOUT_INTENT_PRICE_MISMATCH" };
      if (this.intent.expires_at <= this.now)
        return { ok: false, code: "CHECKOUT_INTENT_EXPIRED" };
    } else if (this.sub.provider_subscription_id !== input.subscriptionId) {
      return { ok: false, code: "SUBSCRIPTION_REASSIGNMENT_BLOCKED" };
    }
    if (input.writeFails) return { ok: false, code: "SUBSCRIPTION_WRITE_FAILED" };
    this.sub.provider_subscription_id = input.subscriptionId;
    this.sub.stripe_price_id = input.priceId;
    if (first) this.intent = null;
    return { ok: true, code: "APPLIED", first_binding: first };
  }
}

describe("atomicità prenotazione checkout e primo binding", () => {
  it("non consuma la prenotazione se l'apply fallisce: il retry riesce", () => {
    const db = new Db();
    expect(db.claim("price_biz_m").ok).toBe(true);
    db.attach("price_biz_m", "cs_1");
    expect(db.apply({ subscriptionId: "sub_1", priceId: "price_biz_m", writeFails: true })).toEqual({
      ok: false,
      code: "SUBSCRIPTION_WRITE_FAILED",
    });
    expect(db.intent).not.toBeNull();
    const retry = db.apply({ subscriptionId: "sub_1", priceId: "price_biz_m" });
    expect(retry.ok).toBe(true);
    expect(retry.first_binding).toBe(true);
    expect(db.intent).toBeNull();
  });

  it("lease perso: nessuna scrittura, nessun consumo, ritentabile dal worker valido", () => {
    const db = new Db();
    db.claim("price_biz_m");
    db.leaseValid = false;
    expect(db.apply({ subscriptionId: "sub_1", priceId: "price_biz_m" }).code).toBe("LEASE_LOST");
    expect(db.intent).not.toBeNull();
    expect(db.sub.provider_subscription_id).toBeNull();
    db.leaseValid = true;
    expect(db.apply({ subscriptionId: "sub_1", priceId: "price_biz_m" }).ok).toBe(true);
  });

  it("un intento vivo blocca un secondo checkout, stesso Price o Price diverso", () => {
    const db = new Db();
    db.claim("price_biz_m");
    db.attach("price_biz_m", "cs_1");
    expect(db.claim("price_biz_m").code).toBe("CHECKOUT_ALREADY_IN_PROGRESS");
    expect(db.claim("price_exec_y").code).toBe("CHECKOUT_ALREADY_IN_PROGRESS");
    // Ripresa idempotente: stessa sessione, nessuna seconda sessione creata.
    expect(db.claim("price_biz_m").session_id).toBe("cs_1");
  });

  it("scadenza e rilascio pre-sessione liberano la prenotazione", () => {
    const db = new Db();
    db.claim("price_biz_m");
    expect(db.release("price_biz_m").ok).toBe(true);
    expect(db.claim("price_exec_y").ok).toBe(true);
    db.attach("price_exec_y", "cs_2");
    // Con sessione registrata il rilascio non è ammesso: solo il TTL.
    expect(db.release("price_exec_y").code).toBe("CHECKOUT_INTENT_NOT_RELEASABLE");
    db.now += 2000;
    expect(db.claim("price_biz_m").ok).toBe(true);
  });

  it("binding esistente resta immutabile anche con intento presente", () => {
    const db = new Db();
    db.sub.provider_subscription_id = "sub_1";
    db.claim("price_biz_m");
    expect(db.apply({ subscriptionId: "sub_2", priceId: "price_biz_m" }).code).toBe(
      "SUBSCRIPTION_REASSIGNMENT_BLOCKED",
    );
  });
});

describe("SQL e webhook allineati al modello", () => {
  it("l'apply consuma l'intento solo dopo l'UPDATE, nella stessa transazione", () => {
    const fn = sql.slice(sql.lastIndexOf("FUNCTION public.ueradar_billing_apply_subscription"));
    expect(fn).toContain("CHECKOUT_INTENT_MISSING");
    expect(fn).toContain("CHECKOUT_INTENT_EXPIRED");
    expect(fn.indexOf("UPDATE public.ueradar_subscriptions")).toBeLessThan(
      fn.indexOf("DELETE FROM public.ueradar_checkout_intents"),
    );
  });

  it("esistono rilascio sicuro e registrazione sessione", () => {
    expect(sql).toContain("FUNCTION public.ueradar_release_checkout_intent");
    expect(sql).toContain("FUNCTION public.ueradar_attach_checkout_session");
  });

  it("il webhook non consuma più l'intento prima dell'apply", () => {
    const hook = readFileSync(join(process.cwd(), "src/routes/api/public/billing-webhook.ts"), "utf8");
    expect(hook).not.toContain("ueradar_consume_checkout_intent");
  });

  it("il checkout rilascia la prenotazione se la sessione non nasce e registra quella creata", () => {
    const fns = readFileSync(join(process.cwd(), "src/lib/billing.functions.ts"), "utf8");
    expect(fns).toContain("ueradar_release_checkout_intent");
    expect(fns).toContain("ueradar_attach_checkout_session");
    expect(fns).toContain("CHECKOUT_RESUMED");
  });
});
