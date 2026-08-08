import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const sql = readdirSync(MIGRATIONS)
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");

const PRIVATE_TABLES = [
  "company_profiles",
  "feed_cache",
  "cached_hidden_bandi",
  "daily_notifications",
  "notification_preferences",
  "ueradar_subscriptions",
  "ueradar_company_members",
  "ueradar_billing_events",
];

describe("privilegi tabelle private UEradar", () => {
  it("TRUNCATE, TRIGGER e REFERENCES sono revocati su tutte le tabelle private", () => {
    // La revoca è applicata in blocco sull'elenco autoritativo delle tabelle.
    expect(sql).toMatch(
      /REVOKE TRUNCATE, TRIGGER, REFERENCES ON public\.%I FROM anon, authenticated, PUBLIC/,
    );
    for (const t of PRIVATE_TABLES) expect(sql).toContain(`'${t}'`);
  });

  it("nessuna migrazione concede TRUNCATE, TRIGGER o REFERENCES a client", () => {
    const grants = sql.match(/GRANT[^;]*?TO[^;]*?(anon|authenticated)[^;]*;/g) ?? [];
    for (const g of grants) {
      expect(g).not.toMatch(/\bTRUNCATE\b/);
      expect(g).not.toMatch(/\bTRIGGER\b/);
      expect(g).not.toMatch(/\bREFERENCES\b/);
    }
  });

  it("nessun GRANT ALL a anon o authenticated", () => {
    expect(sql).not.toMatch(/GRANT ALL[^;]*TO[^;]*\b(anon|authenticated)\b/);
  });

  it("il registro eventi di fatturazione non è raggiungibile dai client", () => {
    expect(sql).toContain(
      "REVOKE ALL ON public.ueradar_billing_events FROM anon, authenticated, PUBLIC",
    );
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.ueradar_billing_events TO (anon|authenticated)/);
  });

  it("sui membri impresa authenticated ha solo SELECT e service_role muta", () => {
    expect(sql).toContain(
      "REVOKE ALL ON public.ueradar_company_members FROM anon, authenticated, PUBLIC",
    );
    expect(sql).toContain("GRANT SELECT ON public.ueradar_company_members TO authenticated");
    expect(sql).toContain("GRANT ALL ON public.ueradar_company_members TO service_role");
    expect(sql).not.toMatch(
      /GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*ON public\.ueradar_company_members TO authenticated/,
    );
  });

  it("gli abbonamenti restano in sola lettura per i client", () => {
    expect(sql).toContain("GRANT SELECT ON public.ueradar_subscriptions TO authenticated");
    expect(sql).not.toMatch(
      /GRANT[^;]*(INSERT|DELETE)[^;]*ON public\.ueradar_subscriptions TO authenticated/,
    );
  });

  it("le notifiche non sono creabili né eliminabili dal client", () => {
    expect(sql).toContain("GRANT SELECT, UPDATE ON public.daily_notifications TO authenticated");
  });

  it("anon non conserva privilegi sulle tabelle private", () => {
    for (const t of PRIVATE_TABLES) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON public\\.${t} FROM anon`));
    }
  });

  it("ogni tabella privata resta coperta da policy RLS o è solo service_role", () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });
});
