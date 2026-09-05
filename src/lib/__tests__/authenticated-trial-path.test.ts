import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveEntitlement } from "../billing";
import { buildDossier, renderDossierText, TRIAL_WATERMARK } from "../dossier";
import { dossierPdfModel } from "../dossier-pdf";
import { decideFeedCache } from "../feed-cache-policy";
import { feedListEmpty, SHOW_CATALOG_LABEL } from "../plain-ux";
import { mapStartTrialResult, trialStartMessage } from "../trial";
import type { Bando, FeedResponse } from "../bandocore-types";

const NOW = "2026-09-05T10:00:00.000Z";

const dashboard = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
const bandoPage = readFileSync("src/routes/_authenticated/bando.$id.tsx", "utf8");
const gate = readFileSync("src/components/bandocore/EntitlementGate.tsx", "utf8");
const authRoute = readFileSync("src/routes/_authenticated/route.tsx", "utf8");
const profilo = readFileSync("src/routes/_authenticated/profilo.tsx", "utf8");
const proxy = readFileSync("src/lib/proxy-core.functions.ts", "utf8");

const trialRow = {
  status: "trialing" as const,
  plan_code: "ueradar_trial",
  plan_seats: 1,
  trial_ends_at: "2026-09-12T10:00:00.000Z",
  current_period_end: null,
  cancel_at_period_end: false,
};

describe("percorso prova autenticato (Radar + dossier)", () => {
  it("senza sessione l'area riservata torna a /auth", () => {
    expect(authRoute).toContain('throw redirect({ to: "/auth" })');
    expect(authRoute).toContain("supabase.auth.getUser()");
  });

  it("la prova attiva abilita Radar e dossier filigranato", () => {
    const entitlement = resolveEntitlement(trialRow, NOW);
    expect(entitlement.entitled).toBe(true);
    expect(entitlement.state).toBe("TRIAL");
    expect(entitlement.limits.watermarkedDossier).toBe(true);
    expect(entitlement.limits.dossiersPerMonth).toBe(1);
  });

  it("il gate lascia passare solo chi è entitled e manda il pending al profilo", () => {
    expect(gate).toContain("if (billing.data?.entitlement.entitled) return <>{children}</>");
    expect(gate).toContain('state === "TRIAL_NOT_STARTED"');
    expect(gate).toContain('to="/profilo"');
    expect(gate).toContain("prova gratuita di 7 giorni");
  });

  it("il profilo avvia la prova al salvataggio e non inventa un esito positivo", () => {
    expect(profilo).toContain("activateTrial");
    expect(profilo).toContain('trial.code === "TRIAL_STARTED"');
    expect(mapStartTrialResult({ ok: true, code: "TRIAL_STARTED", trial_ends_at: NOW }, null).ok)
      .toBe(true);
    expect(trialStartMessage("TRIAL_STARTED")).toMatch(/7 giorni/i);
    expect(trialStartMessage("VAT_REQUIRED")).toMatch(/Partita IVA/i);
  });

  it("Radar: «Per la mia impresa» cerca con skip_reuse e applica il live, non lo snapshot 02/09", () => {
    expect(dashboard).toContain('homeView === "profile"');
    expect(dashboard).toContain("Cerca nuovi Bandi");
    expect(dashboard).toContain("skip_reuse: true");
    expect(dashboard).toContain("clearOfflineFeed(undefined, homeView)");
    expect(dashboard).toContain('queryClient.setQueryData(["bandi-feed", homeView], applied)');
    expect(dashboard).toContain('query.data?.source === "cache"');
    expect(dashboard).toContain("isOffline && !isRefreshing");
    expect(dashboard).toContain("Dati salvati");
    expect(proxy).toContain("skip_reuse");
    expect(proxy).toContain("skipReuse: data.skip_reuse === true");

    const stale: FeedResponse = {
      bandi: [{
        id: "old-02-09",
        titolo: "Bando del 2 settembre",
        ente: "MIMIT",
        descrizione: "Sintesi",
        categoria: "FONDO_PERDUTO",
        scope: "NAZIONALE",
      }],
      fetched_at: "2026-09-02T08:00:00.000Z",
      generated_at: "2026-09-02T08:00:00.000Z",
      source: "cache",
      view: "profile",
    };
    const liveEmpty: FeedResponse = {
      bandi: [],
      fetched_at: NOW,
      generated_at: NOW,
      source: "central-core",
      view: "profile",
    };
    expect(decideFeedCache(stale, liveEmpty, Date.parse(NOW), { skipReuse: true })).toBe("persist");
    expect(liveEmpty.source).not.toBe("cache");
    expect(
      feedListEmpty({
        fetchFailed: false,
        filteredCount: 0,
        activeFilters: 0,
        homeView: "profile",
      })?.actionLabel,
    ).toBe(SHOW_CATALOG_LABEL);
  });

  it("dossier: nessun testo/PDF prima del claim; in prova la filigrana è nell'output", () => {
    expect(bandoPage).toContain("claimDossier({ data: { opportunity_id: bando.id } })");
    expect(bandoPage).toContain("if (!res.allowed)");
    expect(bandoPage).toContain("setDossierOpen(true)");
    expect(bandoPage).toContain("dossierOpen\n    ? renderDossierText(dossier, { watermarked })");
    expect(bandoPage).toContain("Hai esaurito i dossier inclusi nella prova gratuita");

    const bando = {
      id: "b-trial",
      titolo: "Contributo PMI",
      ente: "Regione",
      descrizione: "Avviso aperto",
      categoria: "FONDO_PERDUTO",
      scadenza: "2026-12-01",
      verification_status: "VERIFICATO",
    } as unknown as Bando;
    const dossier = buildDossier(bando, null);
    expect(renderDossierText(dossier, { watermarked: true })).toContain(TRIAL_WATERMARK);
    expect(dossierPdfModel(dossier, true).some((b) => b.text === TRIAL_WATERMARK)).toBe(true);
  });
});
