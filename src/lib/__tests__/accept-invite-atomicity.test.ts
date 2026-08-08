import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCEPT_RPC,
  mapAcceptRpcResult,
  personalSubscriptionBlocksAccept,
  PERSONAL_SUBSCRIPTION_BLOCK_CODE,
} from "../membership";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const sqlAll = readdirSync(MIGRATIONS)
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");
const billingFns = readFileSync(join(process.cwd(), "src/lib/billing.functions.ts"), "utf8");
const abbonamento = readFileSync(
  join(process.cwd(), "src/routes/_authenticated/abbonamento.tsx"),
  "utf8",
);

describe("(a) abbonamento personale presso il provider blocca l'accettazione", () => {
  it("subscription id presente => rifiuto", () => {
    expect(
      personalSubscriptionBlocksAccept({ status: "canceled", provider_subscription_id: "sub_1" }),
    ).toBe(true);
  });

  it("provider con stato active/trialing/past_due/unpaid => rifiuto", () => {
    for (const status of ["active", "trialing", "past_due", "unpaid"]) {
      expect(
        personalSubscriptionBlocksAccept({
          status,
          provider_subscription_id: null,
          provider: "stripe",
        }),
      ).toBe(true);
    }
  });

  it("trial locale senza provider non blocca", () => {
    expect(
      personalSubscriptionBlocksAccept({
        status: "trialing",
        provider_subscription_id: null,
        provider: null,
      }),
    ).toBe(false);
    expect(personalSubscriptionBlocksAccept(null)).toBe(false);
  });

  it("il codice è propagato da SQL alla UI", () => {
    expect(PERSONAL_SUBSCRIPTION_BLOCK_CODE).toBe("PERSONAL_SUBSCRIPTION_MUST_BE_MANAGED");
    expect(sqlAll).toContain("PERSONAL_SUBSCRIPTION_MUST_BE_MANAGED");
    expect(abbonamento).toContain("PERSONAL_SUBSCRIPTION_MUST_BE_MANAGED");
    expect(abbonamento).toMatch(/gestiscilo o disdicilo/i);
  });
});

describe("(b) accettazione e neutralizzazione atomiche", () => {
  it("il server usa la RPC transazionale e non più update separati", () => {
    const block = billingFns.slice(billingFns.indexOf("export const acceptCompanyInvite"));
    const body = block.slice(0, block.indexOf("\nexport const", 1));
    expect(body).toContain(".rpc(ACCEPT_RPC");
    expect(body).not.toContain('.from("ueradar_subscriptions")');
    expect(body).not.toContain("buildAcceptUpdate");
  });

  it("la RPC è SECURITY DEFINER e service-only", () => {
    expect(ACCEPT_RPC).toBe("ueradar_accept_invite");
    expect(sqlAll).toMatch(/CREATE OR REPLACE FUNCTION public\.ueradar_accept_invite/);
    expect(sqlAll).toMatch(/SECURITY DEFINER/);
    expect(sqlAll).toMatch(
      /REVOKE ALL ON FUNCTION public\.ueradar_accept_invite\(uuid, uuid, text\) FROM PUBLIC, anon, authenticated/,
    );
    expect(sqlAll).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ueradar_accept_invite\(uuid, uuid, text\) TO service_role/,
    );
  });

  it("il fallimento della neutralizzazione annulla la transazione", () => {
    expect(sqlAll).toContain("TRIAL_NEUTRALIZATION_FAILED");
    expect(sqlAll).toMatch(/RAISE EXCEPTION 'TRIAL_NEUTRALIZATION_FAILED'/);
  });
});

describe("(c) failure injection sugli esiti della RPC", () => {
  it("errore DB generico => fail-closed, mai ok", () => {
    expect(mapAcceptRpcResult({ ok: true, code: "OK" }, { code: "40001" })).toEqual({
      ok: false,
      code: "INVITE_ACCEPT_FAILED",
    });
  });

  it("unique violation => ALREADY_MEMBER", () => {
    expect(mapAcceptRpcResult(null, { code: "23505" })).toEqual({
      ok: false,
      code: "ALREADY_MEMBER",
    });
  });

  it("risposta assente o malformata => fail-closed", () => {
    expect(mapAcceptRpcResult(null, null)).toEqual({ ok: false, code: "INVITE_ACCEPT_FAILED" });
    expect(mapAcceptRpcResult({}, null)).toEqual({ ok: false, code: "INVITE_ACCEPT_FAILED" });
    expect(mapAcceptRpcResult({ ok: true }, null)).toEqual({
      ok: false,
      code: "INVITE_ACCEPT_FAILED",
    });
  });

  it("esito negativo della RPC è propagato senza ok", () => {
    expect(
      mapAcceptRpcResult({ ok: false, code: PERSONAL_SUBSCRIPTION_BLOCK_CODE }, null),
    ).toEqual({ ok: false, code: PERSONAL_SUBSCRIPTION_BLOCK_CODE });
  });

  it("esito positivo passa solo con ok esplicito", () => {
    expect(mapAcceptRpcResult({ ok: true, code: "OK", trial_neutralized: true }, null)).toEqual({
      ok: true,
      code: "OK",
    });
  });
});
