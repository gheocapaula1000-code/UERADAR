import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const MIGRATION = "supabase/migrations/20260820090000_schedule_trovabandi_digest.sql";
const CONFIG = "supabase/config.toml";
const UERADAR_REF = "fbqjrmhvxxujpzztgvsc";
const FOREIGN_REFS = ["jpunnzgixcghuydstdlt", "egjvullvkwpzyyworeml"];

const sql = readFileSync(MIGRATION, "utf8");
const config = readFileSync(CONFIG, "utf8");

describe("cron di produzione trovabandi-digest", () => {
  it("punta solo al progetto UERADAR in config.toml", () => {
    expect(config).toMatch(new RegExp(`^project_id\\s*=\\s*"${UERADAR_REF}"`, "m"));
    expect(sql).toContain(`https://${UERADAR_REF}.supabase.co/functions/v1/trovabandi-digest`);
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pg_cron");
    for (const ref of FOREIGN_REFS) {
      expect(sql).not.toContain(ref);
      expect(config).not.toContain(ref);
    }
  });

  it("rimuove soltanto i job trovabandi-digest", () => {
    expect(sql).toContain("cron.unschedule");
    expect(sql).toMatch(/jobname LIKE 'trovabandi-digest%'/);
    expect(sql).toContain("trovabandi-digest-morning");
    expect(sql).toContain("trovabandi-digest-urgent");
    expect(sql).toMatch(/'40 4 \* \* \*'/);
    expect(sql).toMatch(/'15 10 \* \* \*'/);
    expect(sql).toContain("invoke_trovabandi_digest('morning')");
    expect(sql).toContain("invoke_trovabandi_digest('urgent')");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+cron\.job/i);
    expect(sql).not.toMatch(/cron\.unschedule\(\s*j\.jobid/i);
    expect(sql).not.toMatch(/WHERE\s+j\.jobname\s+IS\s+NOT\s+NULL/i);
    expect(sql).not.toMatch(/unschedule\([^)]*\*/);
  });

  it("usa il vault e non contiene valori di segreto", () => {
    expect(sql).toContain("vault.decrypted_secrets");
    expect(sql).toContain("TROVABANDI_CRON_SECRET");
    expect(sql).toContain("x-cron-secret");
    expect(sql).toContain("missing from vault");
    expect(sql).not.toMatch(/origin/i);

    const stripped = sql
      .replace(/--[^\n]*/g, "")
      .replace(/TROVABANDI_CRON_SECRET/g, "")
      .replaceAll(UERADAR_REF, "");

    expect(stripped).not.toMatch(/Bearer\s+\S+/);
    expect(stripped).not.toMatch(/sk_(live|test)_/);
    expect(stripped).not.toMatch(/x-cron-secret['"]?\s*[:=]\s*['"][^'"]+['"]/);
    expect(stripped).not.toMatch(/['"][0-9a-fA-F]{32,}['"]/);
    expect(stripped).not.toMatch(/['"][A-Za-z0-9+/]{40,}={0,2}['"]/);
    expect(sql).not.toMatch(/vault\.create_secret\s*\(/);
  });

  it("pagina il digest esistente senza riscriverlo e resta fail-closed", () => {
    expect(sql).toContain("'offset'");
    expect(sql).toContain("'limit'");
    expect(sql).toContain("v_limit constant integer := 10");
    expect(sql).toContain("next_offset");
    expect(sql).toContain("has_more");
    expect(sql).toContain("release_gate");
    expect(sql).toContain("gate_passed");
    expect(sql).toContain("cron_activation_allowed");
    expect(sql).not.toMatch(/stripe/i);
    expect(sql).not.toMatch(/firecrawl/i);
    expect(sql).not.toMatch(/apify/i);
    expect(sql).not.toContain("trovabandi-feed");
  });
});
