import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
/** Allowlist esatta: solo le copie duplicate di agosto vanno rese replay-safe. */
const DUPLICATE_FILES = [
  "20260806043000_company_profile_matching_fields.sql",
  "20260806044000_daily_notifications.sql",
  "20260806081646_4870bcb7-83a2-4536-9544-48e8c1a4aa83.sql",
  "20260806081716_5e33800a-688f-4ca5-b1d3-c8ab071e03ca.sql",
];
const FOUNDING_FILES = [
  "20260723025221_4a7b06d6-c675-4c1a-96ee-b8df0da14b1d.sql",
  "20260723025910_9d52e29d-9730-4234-ab98-f5afdebc732c.sql",
];
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql"));

describe("migrazioni replay-safe", () => {
  it("le quattro copie duplicate sono presenti sul disco", () => {
    for (const f of DUPLICATE_FILES) expect(files).toContain(f);
  });

  it.each(FOUNDING_FILES)("%s resta non modificata (nessun marker replay-safe)", (file) => {
    const sql = readFileSync(join(DIR, file), "utf8");
    expect(sql).not.toMatch(/^-- replay-safe: idempotent/m);
  });

  it.each(DUPLICATE_FILES)("%s è marcata replay-safe e idempotente", (file) => {
    const sql = readFileSync(join(DIR, file), "utf8");
    expect(sql).toMatch(/^-- replay-safe: idempotent/m);
    // Nessun CREATE TABLE/INDEX/TYPE/POLICY non protetto.
    expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(sql).not.toMatch(/CREATE INDEX (?!IF NOT EXISTS)/);
    expect(sql).not.toMatch(/CREATE TRIGGER /);
    for (const m of sql.matchAll(/CREATE TYPE /g)) {
      expect(sql.slice(0, m.index).includes("DO $$ BEGIN")).toBe(true);
    }
    for (const m of sql.matchAll(/CREATE POLICY "([^"]+)"/g)) {
      const before = sql.slice(0, m.index);
      expect(before).toContain("pg_policies");
      expect(before.lastIndexOf("DO $$ BEGIN")).toBeGreaterThan(before.lastIndexOf("END $$;"));
      expect(sql).toContain(`policyname = '${m[1]}'`);
    }
  });
});
