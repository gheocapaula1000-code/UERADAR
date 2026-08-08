import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveEntitlement } from "../billing";
import { trialStartMessage } from "../trial";

const profilo = readFileSync("src/routes/_authenticated/profilo.tsx", "utf8");
const gate = readFileSync("src/components/bandocore/EntitlementGate.tsx", "utf8");

describe("onboarding di un account pending", () => {
  it("un account appena registrato non è abilitato ma non è nemmeno scaduto", () => {
    const entitlement = resolveEntitlement(
      {
        status: "pending",
        plan_code: "ueradar_trial",
        plan_seats: 1,
        trial_started_at: null,
        trial_ends_at: null,
        current_period_end: null,
        provider: null,
        provider_subscription_id: null,
        cancel_at_period_end: false,
        trial_consumed: false,
      },
      new Date().toISOString(),
    );
    expect(entitlement.entitled).toBe(false);
    expect(entitlement.state).toBe("TRIAL_NOT_STARTED");
  });

  it("/profilo resta raggiungibile senza entitlement, altrimenti la prova non parte mai", () => {
    expect(profilo).toContain("<AppShell requireEntitlement={false}>");
    expect(profilo).not.toMatch(/<AppShell>\s/);
  });

  it("il gate indica il percorso esplicito verso il profilo", () => {
    expect(gate).toContain('state === "TRIAL_NOT_STARTED"');
    expect(gate).toContain("Completa profilo e attiva i 7 giorni");
    expect(gate).toContain('to="/profilo"');
  });

  it("il salvataggio non porta al dashboard se la prova non parte", () => {
    const save = profilo.slice(profilo.indexOf("const save ="), profilo.indexOf("const save =") + 2600);
    const failureBranch = save.slice(save.indexOf("trialStartMessage(trial.code)"));
    expect(failureBranch).toContain("return;");
    expect(save.indexOf("return;")).toBeLessThan(save.indexOf('navigate({ to: "/dashboard" })'));
    expect(save).toContain('toast.error(trialStartMessage("TRIAL_START_FAILED"))');
  });

  it("ogni esito di avvio prova ha un messaggio comprensibile", () => {
    for (const code of [
      "TRIAL_STARTED",
      "TRIAL_ALREADY_ACTIVE",
      "VAT_REQUIRED",
      "TRIAL_COOLDOWN_ACTIVE",
      "TRIAL_ALREADY_USED",
      "TRIAL_START_FAILED",
    ]) {
      expect(trialStartMessage(code).length).toBeGreaterThan(10);
    }
  });
});
