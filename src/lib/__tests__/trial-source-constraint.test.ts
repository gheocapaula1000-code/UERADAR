import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regressione P0: ueradar_start_trial aveva scritto trial_source='app_no_card',
 * valore non ammesso dal CHECK constraint, facendo fallire in rollback ogni
 * attivazione. Il test non confronta stringhe a caso: estrae i valori ammessi
 * dal constraint effettivamente definito nelle migrazioni e li confronta con il
 * valore scritto dall'ULTIMA definizione applicata della funzione.
 */
const DIR = join(process.cwd(), "supabase/migrations");
const files = readdirSync(DIR).sort();
const sql = files.map((f) => readFileSync(join(DIR, f), "utf8")).join("\n");

function allowedTrialSources(): string[] {
  const checks = sql.match(/trial_source_check[\s\S]*?;/g) ?? [];
  const last = checks[checks.length - 1] ?? "";
  return [...last.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]!);
}

function lastAppliedTrialSource(): string {
  let value = "";
  for (const f of files) {
    const body = readFileSync(join(DIR, f), "utf8");
    if (!/FUNCTION public\.ueradar_start_trial/.test(body)) continue;
    const m = [...body.matchAll(/trial_source\s*=\s*'([a-z_]+)'/g)].pop();
    if (m) value = m[1]!;
  }
  return value;
}

describe("avvio prova: coerenza fra funzione e vincolo DB", () => {
  it("il vincolo definisce un insieme chiuso di origini ammesse", () => {
    const allowed = allowedTrialSources();
    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed).toContain("app_vat_verified");
    expect(allowed).not.toContain("app_no_card");
  });

  it("la funzione scrive un'origine ammessa dal vincolo", () => {
    const applied = lastAppliedTrialSource();
    expect(applied).toBe("app_vat_verified");
    expect(allowedTrialSources()).toContain(applied);
  });

  it("esiste un test SQL eseguito sul database per la transizione pending -> trialing", () => {
    // Il DO block asserisce stato, origine e durata: se fallisce, la migrazione
    // va in rollback e non può essere applicata.
    expect(sql).toContain("TRIAL_TEST_FAILED");
    expect(sql).toMatch(/status\s*=\s*'pending'/);
    expect(sql).toMatch(/trial_ends_at - _after\.trial_started_at <> interval '168 hours'/);
  });
});
