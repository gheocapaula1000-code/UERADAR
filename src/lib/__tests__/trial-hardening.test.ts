import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AVAILABLE_SOURCE_TIER, CATALOG } from "@/lib/catalog";
import {
  canAddMember,
  eventIsApplicable,
  invoiceUpdateAllowed,
  resolveEntitlement,
  seatUsage,
} from "@/lib/billing";
import { usagePeriodKey, trialPeriodKey, periodKey } from "@/lib/usage";
import { mapStartTrialResult } from "@/lib/trial";
import { buildDossier, renderDossierText, TRIAL_WATERMARK } from "@/lib/dossier";
import { dossierPdfModel } from "@/lib/dossier-pdf";
import type { Bando } from "@/lib/bandocore-types";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const sqlAll = readdirSync(MIGRATIONS)
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");
const feed = readFileSync("src/lib/proxy-core.functions.ts", "utf8");
const usageFns = readFileSync("src/lib/usage.functions.ts", "utf8");
const trialFns = readFileSync("src/lib/trial.functions.ts", "utf8");
const webhook = readFileSync("src/routes/api/public/billing-webhook.ts", "utf8");
const profilo = readFileSync("src/routes/_authenticated/profilo.tsx", "utf8");
const bandoPage = readFileSync("src/routes/_authenticated/bando.$id.tsx", "utf8");
const landing = readFileSync("src/routes/index.tsx", "utf8");
const billingServer = readFileSync("src/lib/billing.server.ts", "utf8");

const NOW = "2026-08-08T10:00:00.000Z";

describe("P0 prova gratuita: nessun entitlement automatico", () => {
  it("la registrazione crea una riga pending, non una prova", () => {
    expect(sqlAll).toMatch(/values \(new\.id, 'ueradar_trial', 1, 'pending', null, null\)/);
    const denied = resolveEntitlement(
      {
        status: "pending",
        trial_ends_at: null,
        current_period_end: null,
        cancel_at_period_end: false,
        plan_code: "ueradar_trial",
        plan_seats: 1,
      },
      NOW,
    );
    expect(denied.entitled).toBe(false);
    expect(denied.state).toBe("TRIAL_NOT_STARTED");
  });

  it("la prova dura esattamente 168 ore ed è transazionale e service-only", () => {
    expect(sqlAll).toContain("interval '168 hours'");
    expect(sqlAll).toMatch(/CREATE OR REPLACE FUNCTION public\.ueradar_start_trial/);
    expect(sqlAll).toMatch(/pg_advisory_xact_lock\(hashtextextended\('ueradar_trial_vat/);
    expect(sqlAll).toMatch(
      /REVOKE ALL ON FUNCTION public\.ueradar_start_trial\(uuid, text, text\) FROM PUBLIC, anon, authenticated/,
    );
    expect(sqlAll).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.ueradar_start_trial\(uuid, text, text\) TO service_role/,
    );
  });

  it("blocca una seconda prova entro 12 mesi e riapre con update atomico", () => {
    expect(sqlAll).toContain("TRIAL_COOLDOWN_ACTIVE");
    expect(sqlAll).toContain("interval '12 months'");
    expect(sqlAll).toMatch(
      /ON CONFLICT \(fingerprint_type, fingerprint_value\)\s*\n\s*DO UPDATE SET user_id = EXCLUDED\.user_id, started_at = EXCLUDED\.started_at/,
    );
  });

  it("una prova già in corso non viene interrotta", () => {
    expect(sqlAll).toContain("TRIAL_ALREADY_ACTIVE");
  });

  it("il dominio è derivato server-side e la P.IVA dal profilo salvato", () => {
    expect(trialFns).toContain("normalizeDomainFingerprint");
    expect(trialFns).toContain("context.claims");
    expect(trialFns).toContain("partita_iva");
    expect(trialFns).toContain("VAT_REQUIRED");
    // L'avvio avviene dopo il salvataggio del profilo, non alla registrazione.
    expect(profilo).toContain("activateTrial");
  });

  it("l'esito è fail-closed su risposta assente o malformata", () => {
    expect(mapStartTrialResult(null, null)).toEqual({ ok: false, code: "TRIAL_START_FAILED" });
    expect(mapStartTrialResult({ ok: true }, { code: "x" })).toEqual({
      ok: false,
      code: "TRIAL_START_FAILED",
    });
    expect(mapStartTrialResult({ ok: false, code: "TRIAL_COOLDOWN_ACTIVE" }, null).ok).toBe(false);
    expect(mapStartTrialResult({ ok: true, code: "TRIAL_STARTED", trial_ends_at: NOW }, null)).toEqual(
      { ok: true, code: "TRIAL_STARTED", trial_ends_at: NOW },
    );
  });
});

describe("P0 quota della prova valida per l'intera prova", () => {
  it("non si azzera al cambio del mese solare", () => {
    const start = "2026-01-28T00:00:00.000Z";
    const inJanuary = usagePeriodKey({ isTrial: true, trialStartedAt: start, nowIso: start });
    const inFebruary = usagePeriodKey({
      isTrial: true,
      trialStartedAt: start,
      nowIso: "2026-02-02T00:00:00.000Z",
    });
    expect(inJanuary).toBe(inFebruary);
    expect(inJanuary).toBe(trialPeriodKey(start));
    expect(periodKey(start)).not.toBe(periodKey("2026-02-02T00:00:00.000Z"));
  });

  it("fuori dalla prova resta il mese solare", () => {
    expect(usagePeriodKey({ isTrial: false, trialStartedAt: null, nowIso: NOW })).toBe(
      periodKey(NOW),
    );
  });
});

describe("P0 entitlement su feed, refresh e cache", () => {
  it("fetch, refresh e lettura cache applicano lo stesso gate", () => {
    expect(feed.match(/FEED_NOT_ENTITLED/g)?.length).toBeGreaterThanOrEqual(3);
    const cached = feed.slice(feed.indexOf("export const loadCachedFeed"));
    expect(cached).toContain("entitlementForTenant");
    expect(cached).toContain("FEED_NOT_ENTITLED");
    const refresh = feed.slice(
      feed.indexOf("export const requestFeedRefresh"),
      feed.indexOf("export const loadCachedFeed"),
    );
    expect(refresh).toContain("entitlementForTenant");
    expect(refresh).toContain("claimSearchLane");
  });

  it("le fonti sono fail-closed sul set realmente disponibile", () => {
    expect(feed).toContain("AVAILABLE_SOURCE_TIER");
    for (const id of ["professional", "business", "executive"] as const)
      expect(CATALOG[id].limits.sourceTier).toBe(AVAILABLE_SOURCE_TIER);
  });
});

describe("P0 dossier: claim idempotente e filigrana nell'output", () => {
  const bando = {
    id: "b-1",
    titolo: "Bando prova",
    ente: "Comune",
    descrizione: "",
    scadenza: "2030-01-01",
    importo_max: 10000,
    categoria: "ALTRO",
    compatibilita: "DA_VERIFICARE",
    verification_status: "DA_VERIFICARE",
  } as unknown as Bando;

  it("il consumo è per opportunità e periodo, con ledger dedicato", () => {
    expect(sqlAll).toMatch(/CREATE TABLE IF NOT EXISTS public\.ueradar_usage_ledger/);
    expect(sqlAll).toMatch(/UNIQUE \(tenant_id, period_ym, kind, opportunity_id\)/);
    expect(sqlAll).toContain("ALREADY_CLAIMED");
    expect(usageFns).toContain("consumeQuotaOnce");
    expect(usageFns).toContain("opportunityId: data.opportunity_id");
  });

  it("il ledger non è raggiungibile dall'app", () => {
    expect(sqlAll).toMatch(/REVOKE ALL ON public\.ueradar_usage_ledger FROM anon, authenticated, PUBLIC/);
    expect(sqlAll).toMatch(
      /REVOKE ALL ON FUNCTION public\.ueradar_consume_quota_once\(uuid, text, text, text, integer\) FROM PUBLIC, anon, authenticated/,
    );
  });

  it("la filigrana è dentro TXT/clipboard e PDF, non solo nella UI", () => {
    const dossier = buildDossier(bando, null);
    expect(renderDossierText(dossier, { watermarked: true })).toContain(TRIAL_WATERMARK);
    expect(renderDossierText(dossier)).not.toContain(TRIAL_WATERMARK);
    const pdf = dossierPdfModel(dossier, true).map((b) => b.text);
    expect(pdf.filter((t) => t === TRIAL_WATERMARK).length).toBeGreaterThanOrEqual(2);
    expect(dossierPdfModel(dossier, false).some((b) => b.text === TRIAL_WATERMARK)).toBe(false);
  });

  it("nessun output è prodotto prima del claim server", () => {
    expect(bandoPage).toContain("dossierOpen\n    ? renderDossierText(dossier, { watermarked })");
    expect(bandoPage).toContain("if (!dossierOpen) return;");
    expect(bandoPage).toContain("downloadDossierPdf(dossier, `dossier-${bando.id}.pdf`, watermarked)");
  });
});

describe("P0 capienza utenti con il titolare incluso", () => {
  const entitlementFor = (planCode: string) =>
    resolveEntitlement(
      {
        status: "active",
        trial_ends_at: null,
        current_period_end: "2026-09-08T10:00:00.000Z",
        cancel_at_period_end: false,
        plan_code: planCode,
        plan_seats: 0,
      },
      NOW,
    );

  it("Professional 1 collaboratore, Business 4, Executive 9", () => {
    const cases: [string, number][] = [
      ["ueradar_professional_monthly", 1],
      ["ueradar_business_monthly", 4],
      ["ueradar_executive_monthly", 9],
    ];
    for (const [code, extra] of cases) {
      const e = entitlementFor(code);
      expect(seatUsage(0, e).used).toBe(1);
      expect(seatUsage(extra, e).used).toBe(e.seats);
      expect(canAddMember(extra - 1, e).allowed).toBe(true);
      expect(canAddMember(extra, e).reason).toBe("SEATS_EXCEEDED");
    }
  });

  it("mostra il totale comprensivo del titolare", () => {
    const e = entitlementFor("ueradar_business_monthly");
    expect(seatUsage(2, e).label).toBe("3 / 5 utenti");
  });
});

describe("P0 webhook: ordine, livemode e fatture coerenti", () => {
  it("richiede livemode esplicitamente false", () => {
    expect(webhook).toContain('event["livemode"] !== false');
  });

  it("un evento più vecchio non retrocede lo stato", () => {
    const older = eventIsApplicable(1_700_000_000, "2026-08-08T10:00:00.000Z");
    expect(older.ok).toBe(false);
    expect(older.code).toBe("EVENT_OUT_OF_ORDER");
    expect(eventIsApplicable(undefined, null).code).toBe("EVENT_WITHOUT_TIMESTAMP");
    const newer = eventIsApplicable(Math.floor(Date.parse("2026-09-01T00:00:00Z") / 1000), NOW);
    expect(newer.ok).toBe(true);
    expect(webhook).toContain("last_event_created_at");
  });

  it("una fattura con Price manomesso o subscription diversa non cambia stato", () => {
    const priceMap = { "business:month": "price_test_business" };
    expect(
      invoiceUpdateAllowed({
        invoiceSubscriptionId: "sub_1",
        invoicePriceId: "price_sconosciuto",
        recordSubscriptionId: "sub_1",
        priceMap,
      }).code,
    ).toBe("PRICE_NOT_ALLOWLISTED");
    expect(
      invoiceUpdateAllowed({
        invoiceSubscriptionId: "sub_2",
        invoicePriceId: "price_test_business",
        recordSubscriptionId: "sub_1",
        priceMap,
      }).code,
    ).toBe("SUBSCRIPTION_MISMATCH");
    expect(
      invoiceUpdateAllowed({
        invoiceSubscriptionId: "sub_1",
        invoicePriceId: "price_test_business",
        recordSubscriptionId: "sub_1",
        priceMap,
      }).ok,
    ).toBe(true);
  });
});

describe("P0 billing fail-closed e Portal reale", () => {
  it("il Portal richiede un ID bpc_ verificato presso il provider", () => {
    expect(billingServer).toContain("isPortalConfigurationId");
    expect(billingServer).toMatch(/\^bpc_/);
    expect(billingServer).toContain("fetchPortalConfiguration");
    expect(readFileSync("src/lib/billing.functions.ts", "utf8")).toContain(
      "fetchPortalConfiguration",
    );
  });
});

describe("P1 sticky bar della prova sulla home mobile", () => {
  it("è presente e non copre il contenuto né la safe area", () => {
    expect(landing).toContain("<TrialStickyBar />");
    expect(landing).toContain("pb-44");
    expect(readFileSync("src/components/bandocore/TrialBanner.tsx", "utf8")).toContain(
      "env(safe-area-inset-bottom)",
    );
  });
});
