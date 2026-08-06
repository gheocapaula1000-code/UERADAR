import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql"));

describe("migrazioni replay-safe", () => {
  it("ci sono file di migrazione da controllare", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s è marcata replay-safe e idempotente", (file) => {
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
