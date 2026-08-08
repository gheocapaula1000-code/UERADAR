import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
/** Migrazione storica non conforme: documentata in docs/db-testing-policy.md. */
const LEGACY = "20260808112119";

describe("policy test su database", () => {
  it("nessuna migrazione successiva esegue test mutanti su righe reali", () => {
    const offenders: string[] = [];
    for (const f of readdirSync(DIR).filter((n) => n.endsWith(".sql"))) {
      const stamp = f.slice(0, 14);
      if (stamp <= LEGACY) continue;
      const sql = readFileSync(join(DIR, f), "utf8");
      const hasDoBlock = /DO\s+\$\$/i.test(sql);
      const mutatesSubscriptions =
        /UPDATE\s+public\.ueradar_subscriptions/i.test(sql) ||
        /public\.ueradar_start_trial\s*\(/i.test(sql);
      if (hasDoBlock && mutatesSubscriptions) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("la policy è documentata", () => {
    const doc = readFileSync("docs/db-testing-policy.md", "utf8");
    expect(doc).toMatch(/ROLLBACK/);
    expect(doc).toMatch(/plan_seats/);
  });
});
