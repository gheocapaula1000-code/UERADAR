import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canAddMember,
  isTestSecretKey,
  isValidPriceId,
  MAX_SELF_SERVICE_SEATS,
  PLANS,
  planFromPriceId,
  resolveEntitlement,
  subscriptionUpdateFromEvent,
  verifyWebhookSignature,
  type SubscriptionSnapshot,
} from "@/lib/billing";

const NOW = "2026-08-08T10:00:00.000Z";
const base: SubscriptionSnapshot = {
  status: "trialing",
  trial_ends_at: "2026-08-12T10:00:00.000Z",
  current_period_end: null,
  cancel_at_period_end: false,
  plan_code: "ueradar_business_monthly",
  plan_seats: 3,
};

async function sign(payload: string, secret: string, timestamp: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("catalogo piani UEradar", () => {
  it("espone solo Business 299 e Team 599 con 3 e 10 utenti", () => {
    expect(PLANS.business.amountCents).toBe(29900);
    expect(PLANS.team.amountCents).toBe(59900);
    expect(PLANS.business.seats).toBe(3);
    expect(PLANS.team.seats).toBe(10);
    expect(MAX_SELF_SERVICE_SEATS).toBe(10);
    expect(Object.keys(PLANS)).toEqual(["business", "team"]);
  });

  it("accetta esclusivamente chiavi e prezzi in modalità test", () => {
    expect(isTestSecretKey("sk_test_abc123")).toBe(true);
    expect(isTestSecretKey("rk_test_abc123")).toBe(true);
    expect(isTestSecretKey("sk_live_abc123")).toBe(false);
    expect(isTestSecretKey("")).toBe(false);
    expect(isValidPriceId("price_123")).toBe(true);
    expect(isValidPriceId("plan_123")).toBe(false);
  });
});

describe("entitlement fail-closed", () => {
  it("nega l'accesso senza riga abbonamento", () => {
    const e = resolveEntitlement(null, NOW);
    expect(e.entitled).toBe(false);
    expect(e.requiresPayment).toBe(true);
    expect(e.reason).toBe("NO_SUBSCRIPTION_ROW");
  });

  it("consente la prova di 7 giorni senza carta finché non scade", () => {
    const e = resolveEntitlement(base, NOW);
    expect(e.entitled).toBe(true);
    expect(e.state).toBe("TRIAL");
    expect(e.requiresPayment).toBe(false);
  });

  it("richiede il pagamento alla scadenza della prova", () => {
    const e = resolveEntitlement({ ...base, trial_ends_at: "2026-08-01T00:00:00.000Z" }, NOW);
    expect(e.entitled).toBe(false);
    expect(e.state).toBe("TRIAL_EXPIRED");
    expect(e.requiresPayment).toBe(true);
  });

  it("richiede la fine del periodo valida per gli abbonamenti attivi", () => {
    expect(
      resolveEntitlement({ ...base, status: "active", current_period_end: null }, NOW).entitled,
    ).toBe(false);
    const ok = resolveEntitlement(
      {
        ...base,
        status: "active",
        current_period_end: "2026-09-08T10:00:00.000Z",
        plan_code: "ueradar_team_monthly",
        plan_seats: 10,
      },
      NOW,
    );
    expect(ok.entitled).toBe(true);
    expect(ok.seats).toBe(10);
  });

  it("gestisce past_due, unpaid e canceled senza concedere accesso", () => {
    for (const status of ["past_due", "unpaid", "canceled", "incomplete", "sconosciuto"]) {
      expect(resolveEntitlement({ ...base, status }, NOW).entitled).toBe(false);
    }
    expect(resolveEntitlement({ ...base, status: "past_due" }, NOW).requiresPortal).toBe(true);
    expect(resolveEntitlement({ ...base, status: "unpaid" }, NOW).state).toBe("UNPAID");
  });
});

describe("utenti nominativi della stessa impresa", () => {
  it("blocca oltre i posti del piano e senza entitlement", () => {
    const active = resolveEntitlement(
      { ...base, status: "active", current_period_end: "2026-09-08T10:00:00.000Z" },
      NOW,
    );
    expect(canAddMember(2, active).allowed).toBe(true);
    expect(canAddMember(3, active).reason).toBe("SEATS_EXCEEDED");
    expect(canAddMember(0, resolveEntitlement(null, NOW)).reason).toBe("NOT_ENTITLED");
  });
});

describe("sincronizzazione webhook", () => {
  it("mappa il prezzo sul piano corretto", () => {
    const map = { business: "price_b", team: "price_t" };
    expect(planFromPriceId("price_t", map)?.seats).toBe(10);
    expect(planFromPriceId("price_x", map)).toBeNull();
  });

  it("normalizza stato, periodo e disdetta a fine periodo", () => {
    const update = subscriptionUpdateFromEvent({
      status: "active",
      currentPeriodEnd: 1790000000,
      cancelAtPeriodEnd: true,
      priceId: "price_t",
      subscriptionId: "sub_1",
      customerId: "cus_1",
      priceMap: { business: "price_b", team: "price_t" },
    });
    expect(update.status).toBe("active");
    expect(update.plan_seats).toBe(10);
    expect(update.cancel_at_period_end).toBe(true);
    expect(update.billing_mode).toBe("test");
    expect(update.current_period_end).toBe(new Date(1790000000 * 1000).toISOString());
  });

  it("verifica la firma e rifiuta firme errate, scadute o segreti non validi", async () => {
    const secret = "whsec_testsecret";
    const payload = JSON.stringify({ id: "evt_1" });
    const t = Math.floor(Date.now() / 1000);
    const v1 = await sign(payload, secret, t);
    expect((await verifyWebhookSignature(payload, `t=${t},v1=${v1}`, secret, t)).ok).toBe(true);
    expect((await verifyWebhookSignature(payload, `t=${t},v1=${v1}`, secret, t + 1000)).reason).toBe(
      "SIGNATURE_TOO_OLD",
    );
    expect(
      (await verifyWebhookSignature("{\"id\":\"evt_2\"}", `t=${t},v1=${v1}`, secret, t)).ok,
    ).toBe(false);
    expect((await verifyWebhookSignature(payload, `t=${t},v1=${v1}`, "sk_test_x", t)).reason).toBe(
      "BAD_WEBHOOK_SECRET",
    );
    expect((await verifyWebhookSignature(payload, "", secret, t)).reason).toBe(
      "BAD_SIGNATURE_HEADER",
    );
  });
});

describe("sicurezza dell'integrazione di pagamento", () => {
  const webhook = readFileSync("src/routes/api/public/billing-webhook.ts", "utf8");
  const functions = readFileSync("src/lib/billing.functions.ts", "utf8");
  const server = readFileSync("src/lib/billing.server.ts", "utf8");

  it("verifica firma e idempotenza prima di qualunque scrittura", () => {
    expect(webhook).toContain("verifyWebhookSignature");
    expect(webhook).toContain("ueradar_billing_events");
    expect(webhook).toContain("ALREADY_PROCESSED");
    expect(webhook).toContain("LIVE_MODE_BLOCKED");
    expect(webhook.indexOf("verifyWebhookSignature")).toBeLessThan(
      webhook.indexOf("ueradar_billing_events"),
    );
  });

  it("tiene le chiavi solo lato server e blocca la modalità live", () => {
    expect(server).toContain('process.env["STRIPE_SECRET_KEY"]');
    expect(functions).toContain("assertTestMode");
    expect(functions).toContain("requireSupabaseAuth");
    expect(functions).not.toMatch(/import\.meta\.env\.VITE_STRIPE/);
    for (const file of ["src/routes/_authenticated/abbonamento.tsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/sk_(test|live)_/);
      expect(src).not.toMatch(/STRIPE_SECRET_KEY/);
    }
  });
});