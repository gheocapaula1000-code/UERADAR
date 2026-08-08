import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCEPT_MUTABLE_FIELDS,
  buildAcceptUpdate,
  canAcceptInvite,
  isUniqueViolation,
  normalizeEmail,
  trialNeutralization,
  type InviteRow,
} from "../membership";

const OWNER = "11111111-1111-1111-1111-111111111111";
const OWNER_B = "22222222-2222-2222-2222-222222222222";
const MEMBER = "33333333-3333-3333-3333-333333333333";
const STRANGER = "44444444-4444-4444-4444-444444444444";

const invite = (over: Partial<InviteRow> = {}): InviteRow => ({
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  owner_user_id: OWNER,
  email: "collega@impresa.it",
  status: "invited",
  member_user_id: null,
  ...over,
});

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const sqlAll = readdirSync(MIGRATIONS)
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");
const billingFns = readFileSync(join(process.cwd(), "src/lib/billing.functions.ts"), "utf8");

describe("RLS: nessuna scrittura diretta dal client sui membri", () => {
  it("la policy self-accept di UPDATE è rimossa", () => {
    expect(sqlAll).toContain('DROP POLICY IF EXISTS "ueradar_members_self_accept"');
    const created = sqlAll.match(/CREATE POLICY "ueradar_members_self_accept"/g) ?? [];
    const dropped = sqlAll.match(/DROP POLICY IF EXISTS "ueradar_members_self_accept"/g) ?? [];
    expect(dropped.length).toBeGreaterThanOrEqual(created.length);
  });

  it("la policy owner FOR ALL mutante è rimossa", () => {
    expect(sqlAll).toContain('DROP POLICY IF EXISTS "ueradar_members_owner_manage"');
  });

  it("i privilegi di scrittura sono revocati ad authenticated e anon", () => {
    expect(sqlAll).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON public\.ueradar_company_members FROM authenticated/,
    );
    expect(sqlAll).toMatch(/REVOKE ALL ON public\.ueradar_company_members FROM anon/);
  });

  it("le policy finali sui membri sono di sola lettura", () => {
    const tail = sqlAll.slice(sqlAll.lastIndexOf("REVOKE INSERT, UPDATE, DELETE ON public.ueradar_company_members"));
    const policies = tail.match(/CREATE POLICY[\s\S]*?FOR (\w+)/g) ?? [];
    expect(policies.length).toBeGreaterThan(0);
    for (const p of policies) expect(p).toMatch(/FOR SELECT/);
  });
});

describe("accettazione invito fail-closed", () => {
  it("l'update consente solo member_user_id, status e accepted_at", () => {
    const patch = buildAcceptUpdate(MEMBER, "2026-08-08T10:00:00Z");
    expect(Object.keys(patch).sort()).toEqual([...ACCEPT_MUTABLE_FIELDS].sort());
    expect(Object.keys(patch)).not.toContain("owner_user_id");
    expect(Object.keys(patch)).not.toContain("email");
    expect(Object.keys(patch)).not.toContain("role");
  });

  it("un invitato non può impostare un titolare arbitrario", () => {
    const row = invite();
    const patch = buildAcceptUpdate(MEMBER, "2026-08-08T10:00:00Z") as Record<string, unknown>;
    const merged = { ...row, ...patch };
    expect(merged.owner_user_id).toBe(OWNER);
    expect(merged.owner_user_id).not.toBe(OWNER_B);
  });

  it("un estraneo senza invito non accetta", () => {
    expect(canAcceptInvite(null, STRANGER, "estraneo@x.it")).toEqual({
      ok: false,
      code: "INVITE_NOT_AVAILABLE",
    });
  });

  it("email diversa dal token non accetta", () => {
    expect(canAcceptInvite(invite(), STRANGER, "altra@x.it").ok).toBe(false);
    expect(canAcceptInvite(invite(), STRANGER, "altra@x.it")).toMatchObject({
      code: "INVITE_EMAIL_MISMATCH",
    });
  });

  it("senza email nel token si rifiuta", () => {
    expect(canAcceptInvite(invite(), MEMBER, "")).toMatchObject({ code: "EMAIL_NOT_VERIFIABLE" });
  });

  it("un invito già accettato o collegato non è riutilizzabile", () => {
    expect(canAcceptInvite(invite({ status: "accepted" }), MEMBER, "collega@impresa.it").ok).toBe(
      false,
    );
    expect(canAcceptInvite(invite({ member_user_id: STRANGER }), MEMBER, "collega@impresa.it").ok).toBe(
      false,
    );
  });

  it("il titolare non può auto-invitarsi come membro", () => {
    expect(canAcceptInvite(invite(), OWNER, "collega@impresa.it")).toMatchObject({
      code: "OWNER_CANNOT_JOIN_SELF",
    });
  });

  it("email confrontata in forma normalizzata", () => {
    expect(normalizeEmail("  Collega@Impresa.IT ")).toBe("collega@impresa.it");
    expect(canAcceptInvite(invite(), MEMBER, " Collega@Impresa.IT ").ok).toBe(true);
  });

  it("la violazione di unicità diventa ALREADY_MEMBER", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "42501" })).toBe(false);
    expect(billingFns).toContain('"ALREADY_MEMBER"');
  });

  it("un membro già legato non entra in una seconda azienda", () => {
    expect(billingFns).toContain("ALREADY_MEMBER_OF_ANOTHER_COMPANY");
  });
});

describe("gestione posti server-only", () => {
  it("invito, accettazione e rimozione usano il client di servizio dopo l'auth", () => {
    for (const fn of ["inviteCompanyMember", "acceptCompanyInvite", "removeCompanyMember"]) {
      const block = billingFns.slice(billingFns.indexOf(`export const ${fn}`));
      const body = block.slice(0, block.indexOf("\nexport const", 1) === -1 ? undefined : block.indexOf("\nexport const", 1));
      expect(body).toContain("requireSupabaseAuth");
      expect(body).toContain("adminClient");
    }
  });

  it("owner_user_id non è mai un input del client", () => {
    expect(billingFns).not.toMatch(/owner_user_id:\s*data\./);
    expect(billingFns).toContain("owner_user_id: context.userId");
  });

  it("il membro non può invitare né rimuovere", () => {
    expect(billingFns).toContain("MEMBER_CANNOT_MANAGE_MEMBERS");
    expect(billingFns).toContain("tenant.tenant_owner_id !== context.userId");
  });
});

describe("nessun trial doppio dopo l'accettazione", () => {
  it("il trial personale non-provider del membro è neutralizzato in modo tracciato", () => {
    const res = trialNeutralization({ status: "trialing", provider_subscription_id: null });
    expect(res.neutralize).toBe(true);
    if (res.neutralize) {
      expect(res.patch["status"]).toBe("superseded_by_tenant");
      expect(res.patch["trial_consumed"]).toBe(true);
    }
  });

  it("un abbonamento presso il provider non viene mai toccato", () => {
    expect(trialNeutralization({ status: "active", provider_subscription_id: "sub_1" })).toMatchObject(
      { neutralize: false },
    );
    expect(trialNeutralization({ status: "trialing", provider_subscription_id: "sub_1" })).toMatchObject(
      { neutralize: false },
    );
  });

  it("senza abbonamento personale non si scrive nulla", () => {
    expect(trialNeutralization(null)).toMatchObject({ neutralize: false });
  });
});
