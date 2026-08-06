import { describe, expect, it } from "vitest";

/** Copia della logica pura del gate in supabase/functions/trovabandi-digest/index.ts */
function evaluateReleaseGate(payload: unknown, status: number) {
  if (status !== 200) return { allowed: false, reason: `GATE_HTTP_${status}` };
  const body = (payload ?? {}) as Record<string, unknown>;
  if (body.ok !== true) return { allowed: false, reason: "GATE_NOT_OK" };
  if (body.gate_passed !== true) return { allowed: false, reason: "GATE_NOT_PASSED" };
  if (body.cron_activation_allowed !== true)
    return { allowed: false, reason: "CRON_ACTIVATION_NOT_ALLOWED" };
  return { allowed: true, reason: "GATE_PASSED" };
}

const OK = { ok: true, gate_passed: true, cron_activation_allowed: true };

describe("release gate", () => {
  it("consente solo con 200 e tutti i flag true", () => {
    expect(evaluateReleaseGate(OK, 200).allowed).toBe(true);
  });

  it("blocca su status diverso da 200", () => {
    expect(evaluateReleaseGate(OK, 503).allowed).toBe(false);
    expect(evaluateReleaseGate(OK, 403).reason).toBe("GATE_HTTP_403");
  });

  it("blocca se manca uno dei flag", () => {
    expect(evaluateReleaseGate({ ...OK, ok: false }, 200).reason).toBe("GATE_NOT_OK");
    expect(evaluateReleaseGate({ ...OK, gate_passed: false }, 200).reason).toBe("GATE_NOT_PASSED");
    expect(evaluateReleaseGate({ ...OK, cron_activation_allowed: "true" }, 200).reason).toBe(
      "CRON_ACTIVATION_NOT_ALLOWED",
    );
  });

  it("blocca su body assente o non valido", () => {
    expect(evaluateReleaseGate(null, 200).allowed).toBe(false);
    expect(evaluateReleaseGate({}, 200).allowed).toBe(false);
  });
});
