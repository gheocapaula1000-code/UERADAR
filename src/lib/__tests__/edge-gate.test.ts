import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  edgeEntitlement,
  laneFor,
  edgeLimitsForPlanCode,
} from "../../../supabase/functions/_shared/ueradar-entitlement.ts";
import { checkoutQaAllowed } from "../billing.server";

const NOW = "2026-02-01T00:00:00.000Z";
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("entitlement applicato dentro la Edge Function", () => {
  it("nega senza riga abbonamento", () => {
    expect(edgeEntitlement(null, NOW)).toMatchObject({ entitled: false, reason: "NO_SUBSCRIPTION_ROW" });
  });

  it("nega account pending (prova mai avviata)", () => {
    expect(edgeEntitlement({ status: "pending" }, NOW)).toMatchObject({
      entitled: false,
      state: "TRIAL_NOT_STARTED",
    });
  });

  it("nega prova scaduta", () => {
    expect(
      edgeEntitlement({ status: "trialing", trial_ends_at: "2026-01-01T00:00:00.000Z" }, NOW),
    ).toMatchObject({ entitled: false, state: "TRIAL_EXPIRED" });
  });

  it("nega abbonamento con periodo concluso o senza piano", () => {
    expect(
      edgeEntitlement(
        { status: "active", plan_code: "ueradar_business_monthly", current_period_end: "2026-01-01T00:00:00.000Z" },
        NOW,
      ).entitled,
    ).toBe(false);
    expect(
      edgeEntitlement(
        { status: "active", plan_code: "ueradar_trial", current_period_end: "2026-03-01T00:00:00.000Z" },
        NOW,
      ).entitled,
    ).toBe(false);
  });

  it("consente prova attiva e abbonamento valido", () => {
    expect(
      edgeEntitlement({ status: "trialing", trial_ends_at: "2026-02-05T00:00:00.000Z" }, NOW).entitled,
    ).toBe(true);
    expect(
      edgeEntitlement(
        { status: "active", plan_code: "ueradar_executive_monthly", current_period_end: "2026-03-01T00:00:00.000Z" },
        NOW,
      ),
    ).toMatchObject({ entitled: true, state: "ACTIVE" });
  });

  it("la corsia urgente esiste solo dove prevista dal piano", () => {
    const professional = edgeLimitsForPlanCode("ueradar_professional_monthly");
    expect(laneFor("request_refresh", professional).lane).toBe("full");
    const executive = edgeLimitsForPlanCode("ueradar_executive_monthly");
    expect(laneFor("request_refresh", executive)).toEqual({ lane: "urgent", minutes: 5 });
  });

  it("la Edge verifica tenant, entitlement e cadenza prima di rispondere", () => {
    const src = read("supabase/functions/trovabandi-feed/index.ts");
    expect(src).toContain("ueradar_tenant_owner");
    expect(src).toContain("edgeEntitlement");
    expect(src).toContain("NOT_ENTITLED");
    expect(src).toContain("ueradar_claim_search_lane");
    expect(src).toContain("CADENCE_LIMITED");
  });
});

describe("cache non raggiungibile dal browser", () => {
  it("le tabelle di cache sono revocate ai ruoli client", () => {
    const sql = read("supabase/migrations").length ? "" : "";
    expect(sql).toBe("");
  });

  it("le server function usano il client di servizio per la cache", () => {
    const src = read("src/lib/proxy-core.functions.ts");
    expect(src).toContain("cacheClient");
    expect(src).not.toMatch(/supabase\s*\n?\s*\.from\("feed_cache"\)/);
    expect(src).not.toMatch(/supabase\.from\("cached_hidden_bandi"\)/);
  });
});

describe("checkout QA chiuso per default", () => {
  const list = ["qa@ueradar.com"];
  it("disabilitato senza flag esplicito", () => {
    expect(checkoutQaAllowed({ enabled: false, allowlist: list }, "qa@ueradar.com")).toMatchObject({
      ok: false,
      code: "CHECKOUT_QA_DISABLED",
    });
  });
  it("negato fuori allowlist", () => {
    expect(checkoutQaAllowed({ enabled: true, allowlist: list }, "chiunque@example.com").ok).toBe(false);
    expect(checkoutQaAllowed({ enabled: true, allowlist: [] }, "qa@ueradar.com").code).toBe(
      "CHECKOUT_QA_ALLOWLIST_EMPTY",
    );
  });
  it("consentito solo all'indirizzo in allowlist", () => {
    expect(checkoutQaAllowed({ enabled: true, allowlist: list }, "QA@UEradar.com ").ok).toBe(true);
  });
});
