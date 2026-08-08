import { describe, expect, it } from "vitest";
import {
  assertTenantScope,
  buildTenantContext,
  resolveTenantOwnerId,
  type MembershipRow,
} from "../tenant";

const OWNER = "11111111-1111-1111-1111-111111111111";
const OWNER_B = "22222222-2222-2222-2222-222222222222";
const MEMBER = "33333333-3333-3333-3333-333333333333";
const STRANGER = "44444444-4444-4444-4444-444444444444";

const accepted = (owner: string, at: string): MembershipRow => ({
  owner_user_id: owner,
  status: "accepted",
  accepted_at: at,
});

describe("risoluzione tenant", () => {
  it("il titolare risolve su se stesso", () => {
    expect(resolveTenantOwnerId(OWNER, [])).toBe(OWNER);
    expect(buildTenantContext(OWNER, null).role).toBe("owner");
  });

  it("il membro accettato risolve sul titolare", () => {
    const ctx = buildTenantContext(MEMBER, [accepted(OWNER, "2026-01-01T00:00:00Z")]);
    expect(ctx.tenant_owner_id).toBe(OWNER);
    expect(ctx.role).toBe("member");
  });

  it("un invito non accettato non crea appartenenza", () => {
    const ctx = buildTenantContext(MEMBER, [
      { owner_user_id: OWNER, status: "invited", accepted_at: null },
    ]);
    expect(ctx.tenant_owner_id).toBe(MEMBER);
    expect(ctx.role).toBe("owner");
  });

  it("mai più di una impresa: vince la membership accettata più antica", () => {
    const ctx = buildTenantContext(MEMBER, [
      accepted(OWNER_B, "2026-05-01T00:00:00Z"),
      accepted(OWNER, "2026-01-01T00:00:00Z"),
    ]);
    expect(ctx.tenant_owner_id).toBe(OWNER);
    expect(ctx.tenant_owner_id).not.toBe(OWNER_B);
  });

  it("il membro non può gestire impresa, piano o fatturazione", () => {
    const ctx = buildTenantContext(MEMBER, [accepted(OWNER, "2026-01-01T00:00:00Z")]);
    expect(ctx.can_manage_company).toBe(false);
    expect(ctx.can_manage_billing).toBe(false);
  });

  it("il titolare mantiene i permessi di gestione", () => {
    const ctx = buildTenantContext(OWNER, []);
    expect(ctx.can_manage_company).toBe(true);
    expect(ctx.can_manage_billing).toBe(true);
  });

  it("fail-closed: righe di una seconda impresa o di estranei sono rifiutate", () => {
    const ctx = buildTenantContext(MEMBER, [accepted(OWNER, "2026-01-01T00:00:00Z")]);
    expect(() => assertTenantScope(ctx, OWNER)).not.toThrow();
    expect(() => assertTenantScope(ctx, OWNER_B)).toThrow("TENANT_SCOPE_VIOLATION");
    expect(() => assertTenantScope(ctx, STRANGER)).toThrow("TENANT_SCOPE_VIOLATION");
    expect(() => assertTenantScope(ctx, MEMBER)).toThrow("TENANT_SCOPE_VIOLATION");
    expect(() => assertTenantScope(ctx, null)).toThrow("TENANT_SCOPE_VIOLATION");
  });

  it("l'estraneo resta sul proprio tenant e non vede l'impresa altrui", () => {
    const ctx = buildTenantContext(STRANGER, []);
    expect(ctx.tenant_owner_id).toBe(STRANGER);
    expect(() => assertTenantScope(ctx, OWNER)).toThrow("TENANT_SCOPE_VIOLATION");
  });
});

describe("superfici tenant applicate nel codice server", () => {
  const read = (p: string) => require("node:fs").readFileSync(p, "utf8") as string;

  it("feed e cache usano il tenant risolto, non l'utente", () => {
    const src = read("src/lib/proxy-core.functions.ts");
    expect(src).toContain("resolveTenantContext");
    expect(src).not.toContain('.eq("user_id", userId)');
    expect(src).not.toContain('.eq("user_id", context.userId)');
  });

  it("billing legge il tenant e blocca i membri sulle operazioni riservate", () => {
    const src = read("src/lib/billing.functions.ts");
    expect(src).toContain("MEMBER_CANNOT_MANAGE_BILLING");
    expect(src).toContain("MEMBER_CANNOT_MANAGE_MEMBERS");
    expect(src).toContain('.eq("user_id", tenant.tenant_owner_id)');
  });

  it("il piano predefinito è quello della prova applicativa", () => {
    const dir = "supabase/migrations";
    const file = require("node:fs")
      .readdirSync(dir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort()
      .reverse()
      .find((f: string) => read(`${dir}/${f}`).includes("plan_code SET DEFAULT"))!;
    const migration = read(`${dir}/${file}`);
    expect(migration).toContain("plan_code SET DEFAULT 'ueradar_trial'");
    expect(migration).toContain("plan_seats SET DEFAULT 1");
  });
});
