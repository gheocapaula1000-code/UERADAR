import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  billingEventMetadata,
  canAddMember,
  canStartNewSubscription,
  idempotencyKey,
  isMemberRole,
  MEMBER_ROLES,
  isTestSecretKey,
  isLiveSecretKey,
  isValidPriceId,
  CATALOG,
  priceKey,
  planFromPriceId,
  validateRemotePrice,
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
  plan_code: "ueradar_trial",
  plan_seats: 1,
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

/** Configurazione Price TEST completa: il webhook non mappa nulla senza. */
function fullPriceMap(overrides: Record<string, string> = {}): Record<string, string> {
  const base: Record<string, string> = {};
  for (const plan of ["professional", "business", "executive"] as const)
    for (const interval of ["month", "year"] as const)
      base[priceKey(plan, interval)] = `price_${plan}_${interval}`;
  return { ...base, ...overrides };
}

describe("catalogo piani UEradar", () => {
  it("espone il catalogo approvato con prezzi IVA esclusa e annuale = 10 mensilità", () => {
    expect(CATALOG.professional.prices.month?.amountCents).toBe(49900);
    expect(CATALOG.professional.prices.year?.amountCents).toBe(499000);
    expect(CATALOG.business.prices.month?.amountCents).toBe(99000);
    expect(CATALOG.business.prices.year?.amountCents).toBe(990000);
    expect(CATALOG.executive.prices.month?.amountCents).toBe(199000);
    expect(CATALOG.executive.prices.year?.amountCents).toBe(1990000);
    expect(CATALOG.professional.limits.seats).toBe(2);
    expect(CATALOG.business.limits.seats).toBe(5);
    expect(CATALOG.executive.limits.seats).toBe(10);
    expect(CATALOG.business.highlighted).toBe(true);
    expect(CATALOG.enterprise.selfService).toBe(false);
    expect(Object.keys(CATALOG.enterprise.prices)).toHaveLength(0);
  });

  it("accetta esclusivamente chiavi e prezzi in modalità test", () => {
    expect(isTestSecretKey("sk_test_abc123")).toBe(true);
    expect(isTestSecretKey("rk_test_abc123")).toBe(true);
    expect(isTestSecretKey("sk_live_abc123")).toBe(false);
    expect(isLiveSecretKey("rk_live_abc123")).toBe(true);
    expect(isTestSecretKey("")).toBe(false);
    expect(isValidPriceId("price_123")).toBe(true);
    expect(isValidPriceId("plan_123")).toBe(false);
  });

  it("rifiuta un Price non coerente con il catalogo o in modalità live", () => {
    const expected = CATALOG.business.prices.month!;
    const good = {
      livemode: false,
      active: true,
      currency: "eur",
      unit_amount: 99000,
      recurring: { interval: "month", interval_count: 1 },
      tax_behavior: "exclusive",
    };
    expect(validateRemotePrice(good, expected).ok).toBe(true);
    expect(validateRemotePrice({ ...good, livemode: true }, expected).code).toBe("LIVE_MODE_BLOCKED");
    expect(validateRemotePrice({ ...good, unit_amount: 29900 }, expected).code).toBe(
      "PRICE_AMOUNT_MISMATCH",
    );
    expect(validateRemotePrice({ ...good, currency: "usd" }, expected).code).toBe(
      "PRICE_CURRENCY_MISMATCH",
    );
    expect(
      validateRemotePrice({ ...good, recurring: { interval: "year", interval_count: 1 } }, expected)
        .code,
    ).toBe("PRICE_INTERVAL_MISMATCH");
    // "Ogni 2 mesi" non è il piano approvato: ricorrenza a periodo singolo.
    expect(
      validateRemotePrice({ ...good, recurring: { interval: "month", interval_count: 2 } }, expected)
        .code,
    ).toBe("PRICE_INTERVAL_COUNT_MISMATCH");
    expect(validateRemotePrice({ ...good, active: false }, expected).code).toBe("PRICE_NOT_ACTIVE");
    expect(validateRemotePrice({ ...good, tax_behavior: "inclusive" }, expected).code).toBe(
      "PRICE_TAX_BEHAVIOR_MISMATCH",
    );
    expect(validateRemotePrice(null, expected).code).toBe("PRICE_NOT_FOUND");
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
        plan_code: "ueradar_executive_monthly",
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
      {
        ...base,
        status: "active",
        plan_code: "ueradar_professional_monthly",
        plan_seats: 3,
        current_period_end: "2026-09-08T10:00:00.000Z",
      },
      NOW,
    );
    // Il titolare occupa un posto: con 3 posti restano 2 collaboratori.
    expect(canAddMember(1, active).allowed).toBe(true);
    expect(canAddMember(2, active).reason).toBe("SEATS_EXCEEDED");
    expect(canAddMember(0, resolveEntitlement(null, NOW)).reason).toBe("NOT_ENTITLED");
  });
});

describe("sincronizzazione webhook", () => {
  it("mappa il prezzo sul piano corretto", () => {
    const map = {
      [priceKey("business", "month")]: "price_b",
      [priceKey("executive", "year")]: "price_t",
    };
    expect(planFromPriceId("price_t", map)?.plan.limits.seats).toBe(10);
    expect(planFromPriceId("price_t", map)?.price.planCode).toBe("ueradar_executive_annual");
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
      priceMap: fullPriceMap({ [priceKey("executive", "year")]: "price_t" }),
    });
    expect(update.ok).toBe(true);
    const patch = update.patch!;
    expect(patch.status).toBe("active");
    expect(patch.plan_seats).toBe(10);
    expect(patch.cancel_at_period_end).toBe(true);
    expect(patch.billing_mode).toBe("test");
    expect(patch.current_period_end).toBe(new Date(1790000000 * 1000).toISOString());
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
    // La presa in carico avviene tramite RPC atomica con lease, non con una scrittura diretta.
    expect(webhook).toContain("ueradar_billing_claim_event");
    expect(webhook).toContain("ALREADY_PROCESSED");
    expect(webhook).toContain("LIVE_MODE_BLOCKED");
    expect(webhook.indexOf("verifyWebhookSignature")).toBeLessThan(
      webhook.indexOf("ueradar_billing_claim_event"),
    );
  });

  it("tiene le chiavi solo lato server e blocca la modalità live", () => {
    expect(server).toContain('process.env["STRIPE_SECRET_KEY"]');
    expect(functions).toContain("billingConfigured");
    expect(functions).toContain("requireSupabaseAuth");
    expect(functions).not.toMatch(/import\.meta\.env\.VITE_STRIPE/);
    for (const file of ["src/routes/_authenticated/abbonamento.tsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/sk_(test|live)_/);
      expect(src).not.toMatch(/STRIPE_SECRET_KEY/);
    }
  });
});
describe("gate di review Stripe TEST", () => {
  it("usa il parametro corretto tax_id_collection[enabled] e mai la forma piatta", () => {
    const src = readFileSync("src/lib/billing.functions.ts", "utf8");
    expect(src).toContain('"tax_id_collection[enabled]": "true"');
    expect(src).not.toMatch(/\btax_id_collection:\s*"true"/);
  });

  it("passa chiavi di idempotenza deterministiche a customer, checkout e portale", () => {
    const src = readFileSync("src/lib/billing.functions.ts", "utf8");
    for (const scope of ["customer", "checkout", "portal"]) {
      expect(src).toContain(`idempotencyKey("${scope}"`);
    }
    expect(readFileSync("src/lib/billing.server.ts", "utf8")).toContain('"Idempotency-Key"');
  });

  it("genera la stessa chiave per la stessa intenzione e chiavi diverse per piani diversi", () => {
    const a = idempotencyKey("checkout", "user-1", "business", "price_1");
    expect(idempotencyKey("checkout", "user-1", "business", "price_1")).toBe(a);
    expect(idempotencyKey("checkout", "user-1", "team", "price_1")).not.toBe(a);
    expect(a.length).toBeLessThanOrEqual(255);
  });

  it("blocca una seconda sottoscrizione se ne esiste già una active o trialing", () => {
    expect(
      canStartNewSubscription({ status: "active", provider_subscription_id: "sub_1" }).allowed,
    ).toBe(false);
    expect(
      canStartNewSubscription({ status: "trialing", provider_subscription_id: "sub_1" }).reason,
    ).toBe("SUBSCRIPTION_ALREADY_ACTIVE");
    expect(
      canStartNewSubscription({ status: "canceled", provider_subscription_id: "sub_1" }),
    ).toEqual({ allowed: false, reason: "RESUBSCRIBE_FLOW_REQUIRED" });
    // Prova senza sottoscrizione presso il provider: il checkout resta possibile.
    expect(
      canStartNewSubscription({ status: "trialing", provider_subscription_id: null }).allowed,
    ).toBe(true);
    expect(canStartNewSubscription(null).allowed).toBe(true);
  });

  it("estrae solo metadati minimi dall'evento, senza dati personali", () => {
    const meta = billingEventMetadata({
      id: "evt_1",
      type: "invoice.paid",
      livemode: false,
      data: {
        object: {
          id: "in_1",
          customer: "cus_1",
          customer_email: "mario.rossi@example.com",
          customer_name: "Mario Rossi",
          customer_address: { line1: "Via Roma 1" },
        },
      },
    });
    expect(meta).toEqual({
      event_id: "evt_1",
      event_type: "invoice.paid",
      livemode: false,
      object_id: "in_1",
      provider_customer_id: "cus_1",
    });
    expect(JSON.stringify(meta)).not.toContain("mario.rossi@example.com");
    expect(JSON.stringify(meta)).not.toContain("Via Roma 1");
  });

  it("il webhook non salva il payload completo e non brucia l'evento prima delle scritture", () => {
    const src = readFileSync("src/routes/api/public/billing-webhook.ts", "utf8");
    expect(src).not.toMatch(/payload:\s*event/);
    // Il claim marca processing e il settle chiude l'evento, entrambi lato database.
    expect(src).toContain("ueradar_billing_claim_event");
    expect(src).toContain("ueradar_billing_settle_event");
    expect(src).toContain("_ok: ok");
    // Nessun 200 che consuma l'evento quando l'utente non è collegabile.
    expect(src).toContain('settle("USER_NOT_FOUND", false)');
    expect(src).not.toMatch(/Response\.json\(\{\s*ok:\s*true,\s*code:\s*"USER_NOT_FOUND"/);
    for (const guard of [
      "SUBSCRIPTION_WRITE_FAILED",
      "INVOICE_WRITE_FAILED",
      "SUBSCRIPTION_FETCH_FAILED",
      "EVENT_SETTLE_FAILED",
    ]) {
      expect(src).toContain(guard);
    }
  });

  it("accetta solo i tre ruoli dichiarati previsti", () => {
    expect(MEMBER_ROLES).toEqual(["dipendente", "socio", "amministratore"]);
    expect(isMemberRole("titolare")).toBe(false);
    expect(isMemberRole("")).toBe(false);
    expect(isMemberRole("socio")).toBe(true);
  });

  it("richiede dati completi e attestazione per invitare un utente nominativo", () => {
    const src = readFileSync("src/lib/billing.functions.ts", "utf8");
    for (const field of ["first_name", "last_name", "declared_role", "owner_attestation"]) {
      expect(src).toContain(field);
    }
    expect(src).toContain("z.literal(true)");
    // L'attestazione è registrata nella RPC atomica di invito (posti + insert).
    expect(src).toContain(".rpc(INVITE_RPC");
    expect(src).toContain("mapInviteRpcResult");
    // Il membro accetta con il proprio account tramite la RPC transazionale
    // service-only: i vincoli (invito pendente, nessuna seconda impresa) sono in SQL.
    expect(src).toContain(".rpc(ACCEPT_RPC");
    expect(src).toContain("mapAcceptRpcResult");
  });

  it("non promette verifiche camerali automatiche", () => {
    const files = [
      "src/lib/billing.functions.ts",
      "src/routes/_authenticated/abbonamento.tsx",
      "src/lib/billing.ts",
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // "camerale" ammesso solo in formulazioni negative
      for (const occ of src.matchAll(/.{0,60}camerale/gi)) {
        expect(occ[0]).toMatch(/nessun|non esiste|non viene/i);
      }
      expect(src).not.toMatch(/registro imprese/i);
      expect(src).not.toMatch(/verifichiamo automaticamente/i);
    }
  });
});
