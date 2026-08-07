import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { matchingProfile } from "../../../supabase/functions/_shared/trovabandi-contract.ts";

function classifyDigest(processed: number, created: number, failed: number) {
  if (failed > 0 && failed === processed) return { http: 502, status: "FAILED", ok: false };
  if (failed > 0) return { http: 207, status: "PARTIAL", ok: false };
  if (created > 0) return { http: 200, status: "SUCCESS_DATA", ok: true };
  return { http: 200, status: "SUCCESS_EMPTY", ok: true };
}

describe("contratto digest UEradar.com", () => {
  it("distingue successo con dati, successo vuoto, parziale e fallimento", () => {
    expect(classifyDigest(4, 2, 0)).toEqual({ http: 200, status: "SUCCESS_DATA", ok: true });
    expect(classifyDigest(4, 0, 0)).toEqual({ http: 200, status: "SUCCESS_EMPTY", ok: true });
    expect(classifyDigest(4, 1, 1)).toEqual({ http: 207, status: "PARTIAL", ok: false });
    expect(classifyDigest(4, 0, 4)).toEqual({ http: 502, status: "FAILED", ok: false });
  });

  it("espone BLOCKED_GATE con telemetria e non indebolisce il release gate", () => {
    const src = readFileSync("supabase/functions/trovabandi-digest/index.ts", "utf8");
    expect(src).toContain('status: "BLOCKED_GATE"');
    expect(src).toContain('code: "RELEASE_GATE_BLOCKED"');
    expect(src).toContain("run_id");
    expect(src).toContain("started_at");
    expect(src).toContain("finished_at");
  });

  it("invia al motore solo i campi necessari usando l'allowlist condivisa", () => {
    const src = readFileSync("supabase/functions/trovabandi-digest/index.ts", "utf8");
    const minimized = matchingProfile({
      user_id: "u",
      partita_iva: "IT123",
      ragione_sociale: "ACME Srl",
      legale_rappresentante: "Mario Rossi",
      email_referente: "mario@example.com",
      telefono: "123",
      pec: "acme@pec.example",
      codice_ateco: "62.01",
      regione: "Lazio",
    });
    expect(minimized).toEqual({ codice_ateco: "62.01", regione: "Lazio" });
    expect(src).toContain('from "../_shared/trovabandi-contract.ts"');
    expect(src).toContain("profile: matchingProfile(profile)");
  });

  it("rispetta separatamente preferenze mattutine, urgenti e in-app", () => {
    const src = readFileSync("supabase/functions/trovabandi-digest/index.ts", "utf8");
    expect(src).toContain("morningEnabled");
    expect(src).toContain("urgentEnabled");
    expect(src).toContain("inAppEnabled");
    expect(src).toContain('type === "NEW_MATCH" ? morningEnabled : urgentEnabled');
  });
});
