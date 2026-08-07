import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

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

  it("invia al motore solo i campi necessari al matching", () => {
    const src = readFileSync("supabase/functions/trovabandi-digest/index.ts", "utf8");
    const block = src.match(/const MATCHING_PROFILE_FIELDS = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
    expect(block).toContain('"codice_ateco"');
    expect(block).toContain('"regione"');
    expect(block).not.toContain('"user_id"');
    expect(block).not.toContain('"partita_iva"');
    expect(block).not.toContain('"ragione_sociale"');
    expect(block).not.toContain('"legale_rappresentante"');
    expect(block).not.toContain('"email_referente"');
    expect(block).not.toContain('"telefono"');
    expect(block).not.toContain('"pec"');
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
