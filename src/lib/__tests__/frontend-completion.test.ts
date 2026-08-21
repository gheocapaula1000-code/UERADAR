import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TRIAL_HIGHLIGHT } from "@/lib/coverage";
import { ALERTS_EMPTY, ALERTS_ERROR, ALERTS_HEADING } from "@/lib/alerts";
import { planCompareRows } from "@/lib/pricing";

describe("completamento frontend UEradar.com", () => {
  it("espone pagine legali e prezzi pubbliche", () => {
    for (const path of ["privacy", "termini", "cookie", "prezzi"]) {
      const src = readFileSync(`src/routes/${path}.tsx`, "utf8");
      expect(src).toContain(`createFileRoute("/${path}")`);
      expect(src).toContain("UEradar.com");
    }
  });

  it("dichiara trial di 7 giorni senza carta, dati bancari né disdetta e addebiti disabilitati", () => {
    const pricing = readFileSync("src/routes/prezzi.tsx", "utf8");
    expect(pricing).toContain("TRIAL_HIGHLIGHT");
    expect(TRIAL_HIGHLIGHT).toContain("7 giorni");
    expect(TRIAL_HIGHLIGHT).toContain("senza carta");
    expect(TRIAL_HIGHLIGHT).toContain("dati bancari");
    expect(TRIAL_HIGHLIGHT).toContain("disdetta");
    expect(pricing).toContain('VITE_BILLING_ENABLED === "true"');
    expect(pricing).toContain("Gli addebiti sono disabilitati");
  });

  it("protegge la tabella abbonamenti con RLS e scritture service-role", () => {
    const sql = readFileSync(
      "supabase/migrations/20260807090000_ueradar_subscriptions.sql",
      "utf8",
    );
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all");
    expect(sql).toContain("grant select");
    expect(sql).toContain("service_role");
    expect(sql).toContain("interval '7 days'");
  });

  it("mantiene il gateway feed isolato e coperto dal contratto condiviso", () => {
    const feed = readFileSync("supabase/functions/trovabandi-feed/index.ts", "utf8");
    expect(feed).toContain('from "../_shared/trovabandi-contract.ts"');
    expect(feed).toContain("matchingProfile");
    expect(feed).toContain("sanitizeFeedResponse");
  });

  it("espone avvisi onesti: elenco vuoto, errore e nessun claim di cadenza", () => {
    const dashboard = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
    expect(dashboard).toContain("ALERTS_HEADING");
    expect(dashboard).toContain("ALERTS_EMPTY");
    expect(dashboard).toContain("ALERTS_ERROR");
    expect(ALERTS_HEADING).toBe("Avvisi");
    expect(ALERTS_EMPTY).toContain("Non inventiamo schede");
    expect(ALERTS_ERROR).toContain("I Bandi restano consultabili");
    expect(dashboard).not.toMatch(/Novità di oggi/);
    expect(dashboard).not.toMatch(/notifiche automatiche/i);
  });

  it("non reindirizza a Payment Link live e dichiara addebiti disabilitati", () => {
    const billing = readFileSync("src/routes/_authenticated/abbonamento.tsx", "utf8");
    expect(billing).not.toContain("buy.stripe.com");
    expect(billing).not.toContain("PAYMENT_LINK");
    expect(billing).toContain("Gli addebiti sono disabilitati");
  });

  it("confronta solo Istruttoria e Studio, senza Radar in listino", () => {
    const prezzi = readFileSync("src/routes/prezzi.tsx", "utf8");
    const home = readFileSync("src/routes/index.tsx", "utf8");
    const billing = readFileSync("src/routes/_authenticated/abbonamento.tsx", "utf8");
    expect(prezzi).toContain("planCompareRows");
    expect(prezzi).toContain("Istruttoria");
    expect(prezzi).not.toMatch(/\bPratica\b/);
    expect(prezzi).not.toMatch(/99\s*€/);
    expect(prezzi).not.toContain("€249");
    expect(prezzi).not.toMatch(/offerta lancio/i);
    expect(home).not.toMatch(/99\s*€/);
    expect(billing).not.toMatch(/99\s*€/);
    const rows = planCompareRows();
    expect(rows[0]).not.toHaveProperty("radar");
    expect(rows[0]?.istruttoria).toContain("449");
    expect(rows[0]?.studio).toContain("990");
  });

  it("pagine di errore e README sono in italiano e senza slug Lovable obsoleto", () => {
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    const errorPage = readFileSync("src/lib/error-page.ts", "utf8");
    const readme = readFileSync("README.md", "utf8");
    expect(root).toContain("Pagina non trovata");
    expect(root).toContain("Questa pagina non si è caricata");
    expect(errorPage).toContain('lang="it"');
    expect(errorPage).toContain("Questa pagina non si è caricata");
    expect(readme).toContain("https://ueradar.com");
    expect(readme).toContain("https://ueradar.lovable.app");
    expect(readme).not.toContain("fund-finder-pro-21");
    expect(readme).toContain("CORE_ALLOWED_ORIGINS");
    expect(readme).toContain("test-only");
  });
});
