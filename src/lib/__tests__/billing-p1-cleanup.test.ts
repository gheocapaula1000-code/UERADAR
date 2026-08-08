import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const functions = readFileSync("src/lib/billing.functions.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260808160000_ueradar_billing_p1_cleanup.sql",
  "utf8",
);

describe("billing P1: fail-closed DB e cleanup post-deploy", () => {
  it("richiede cardinalità esatta per Customer e pre-binding Price", () => {
    const exactWrites = functions.match(/\.select\("user_id"\)\s*\.single\(\)/g) ?? [];
    expect(exactWrites).toHaveLength(2);
    expect(functions).toContain('throw new Error("CUSTOMER_LINK_FAILED")');
    expect(functions).toContain('code: "SUBSCRIPTION_UPDATE_FAILED"');
  });

  it("le letture dello stato non trasformano errori DB in record assenti", () => {
    expect(functions).toContain("subscriptionError");
    expect(functions).toContain('code: "SUBSCRIPTION_LOOKUP_FAILED"');
    expect(functions).toContain("membersError");
    expect(functions).toContain('code: "MEMBERS_LOOKUP_FAILED"');
    expect(functions).toContain("checkout_available: false");
    expect(functions).toContain("portal_available: false");
  });

  it("l'attach controlla la scadenza prima di scrivere la sessione", () => {
    const expiry = migration.indexOf("_row.expires_at <= now()");
    const update = migration.indexOf("UPDATE public.ueradar_checkout_intents");
    expect(expiry).toBeGreaterThan(0);
    expect(update).toBeGreaterThan(expiry);
    expect(migration).toContain("CHECKOUT_INTENT_EXPIRED");
  });

  it("revoca al service role la firma legacy senza dipendere dalla sua presenza", () => {
    expect(migration).toContain("to_regprocedure");
    expect(migration).toContain(
      "ueradar_billing_claim_event(text,text,text,text,timestamptz,integer)",
    );
    expect(migration).toMatch(/FROM PUBLIC, anon, authenticated, service_role/);
  });
});
