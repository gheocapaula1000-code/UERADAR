import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  AVAILABLE_SOURCE_TIER,
  CATALOG,
  ENTERPRISE_FROM_CENTS,
  PRICE_ENV_NAMES,
  checkoutTarget,
  normalizePlanCode,
  planFromCode,
} from "@/lib/catalog";
import {
  ENTERPRISE_PLAN,
  PRICING_FAQ,
  PRODUCT_BOUNDARIES,
  PUBLIC_PLANS,
  TRIAL_TERMS,
  VERIFIED_DEFINITION,
} from "@/lib/pricing";
import { TRIAL_COPY, trialCooldownActive, trialFingerprints } from "@/lib/trial";

const pricingPage = readFileSync("src/routes/prezzi.tsx", "utf8");
const landing = readFileSync("src/routes/index.tsx", "utf8");
const terms = readFileSync("src/routes/termini.tsx", "utf8");
const privacy = readFileSync("src/routes/privacy.tsx", "utf8");
const banner = readFileSync("src/components/bandocore/TrialBanner.tsx", "utf8");
const pricingLib = readFileSync("src/lib/pricing.ts", "utf8");
const catalogLib = readFileSync("src/lib/catalog.ts", "utf8");
const billingFunctions = readFileSync("src/lib/billing.functions.ts", "utf8");
const billingServer = readFileSync("src/lib/billing.server.ts", "utf8");
const usageFunctions = readFileSync("src/lib/usage.functions.ts", "utf8");
const feedFunctions = readFileSync("src/lib/proxy-core.functions.ts", "utf8");
const ALL = [pricingPage, landing, terms, privacy, pricingLib, catalogLib].join("\n");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|json|webmanifest)$/.test(p)) out.push(p);
  }
  return out;
}

const UI_FILES = walk("src")
  .filter((p) => !p.includes("__tests__") && !p.endsWith("routeTree.gen.ts"))
  .filter((p) => p.includes("/routes/") || p.includes("/components/") || p.endsWith("/pricing.ts"))
  .filter((p) => !p.includes("/routes/api/"));

describe("catalogo approvato", () => {
  it("espone tre piani self-service più Enterprise su preventivo", () => {
    expect(PUBLIC_PLANS.map((p) => p.id)).toEqual(["professional", "business", "executive"]);
    expect(PUBLIC_PLANS.map((p) => p.monthly?.replace(/\D/g, ""))).toEqual(["499", "990", "1990"]);
    expect(PUBLIC_PLANS.map((p) => p.annual?.replace(/\D/g, ""))).toEqual([
      "4990",
      "9900",
      "19900",
    ]);
    expect(ENTERPRISE_FROM_CENTS).toBe(399000);
    expect(ENTERPRISE_PLAN.price.replace(/\D/g, "")).toBe("3990");
    expect(CATALOG.enterprise.selfService).toBe(false);
  });

  it("l'annuale vale dieci mensilità (due mesi inclusi)", () => {
    for (const id of ["professional", "business", "executive"] as const) {
      const plan = CATALOG[id];
      expect(plan.prices.year!.amountCents).toBe(plan.prices.month!.amountCents * 10);
    }
  });

  it("gli utenti sono capienza tecnica: 2, 5 e 10", () => {
    expect(PUBLIC_PLANS.map((p) => p.seats)).toEqual([2, 5, 10]);
    for (const p of PUBLIC_PLANS) expect(p.seatsLabel).toContain("capienza tecnica");
    expect(CATALOG.trial.limits.seats).toBe(1);
  });

  it("cadenze interne e dossier rispettano il catalogo", () => {
    expect(CATALOG.professional.limits.fullSearchIntervalMinutes).toBe(720);
    expect(CATALOG.professional.limits.urgentLaneIntervalMinutes).toBeNull();
    expect(CATALOG.professional.limits.dossiersPerMonth).toBe(1);

    expect(CATALOG.business.limits.fullSearchIntervalMinutes).toBe(120);
    expect(CATALOG.business.limits.urgentLaneIntervalMinutes).toBe(15);
    expect(CATALOG.business.limits.dossiersPerMonth).toBe(5);

    expect(CATALOG.executive.limits.fullSearchIntervalMinutes).toBe(60);
    expect(CATALOG.executive.limits.urgentLaneIntervalMinutes).toBe(5);
    expect(CATALOG.executive.limits.dossiersPerMonth).toBe(15);

    expect(CATALOG.enterprise.limits.companies).toBe(-1);
  });

  it("nessun piano dichiara o riceve una copertura fonti non verificabile", () => {
    for (const id of ["trial", "professional", "business", "executive", "enterprise"] as const) {
      expect(CATALOG[id].limits.sourceTier).toBe(AVAILABLE_SOURCE_TIER);
      expect(CATALOG[id].limits.crossVerification).toBe(false);
      expect(CATALOG[id].limits.changeMonitoring).toBe(false);
      expect(CATALOG[id].limits.apiAccess).toBe(false);
    }
    // Nessuna promessa temporale o di copertura differenziata nel copy pubblico.
    for (const file of UI_FILES) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/2 volte al giorno|ogni 2 ore|ogni 15 minuti|ogni 5 minuti/);
      expect(src, file).not.toMatch(/verifica incrociata|monitoraggio delle modifiche/i);
      expect(src, file).not.toMatch(/verifiche approfondite/i);
    }
  });

  it("mappa i vecchi codici piano senza rompere le righe esistenti", () => {
    expect(normalizePlanCode("ueradar_team_monthly")).toBe("ueradar_executive_monthly");
    expect(normalizePlanCode("ueradar_pro_monthly")).toBe("ueradar_trial");
    expect(normalizePlanCode("codice_inesistente")).toBe("ueradar_trial");
    expect(planFromCode("ueradar_business_annual").id).toBe("business");
  });

  it("l'allowlist del checkout esclude prova ed Enterprise", () => {
    expect(checkoutTarget("business", "month")?.amountCents).toBe(99000);
    expect(checkoutTarget("enterprise", "month")).toBeNull();
    expect(checkoutTarget("trial", "month")).toBeNull();
    expect(checkoutTarget("business", "settimana")).toBeNull();
  });

  it("predispone sei env TEST e nessun Price ID hardcoded", () => {
    expect(PRICE_ENV_NAMES).toEqual([
      "STRIPE_PRICE_PROFESSIONAL_MONTHLY_TEST",
      "STRIPE_PRICE_PROFESSIONAL_ANNUAL_TEST",
      "STRIPE_PRICE_BUSINESS_MONTHLY_TEST",
      "STRIPE_PRICE_BUSINESS_ANNUAL_TEST",
      "STRIPE_PRICE_EXECUTIVE_MONTHLY_TEST",
      "STRIPE_PRICE_EXECUTIVE_ANNUAL_TEST",
    ]);
    expect(billingServer).not.toContain("STRIPE_PRICE_TEAM");
    for (const f of [catalogLib, billingServer, billingFunctions])
      expect(f).not.toMatch(/price_[A-Za-z0-9]{6,}/);
  });
});

describe("prova gratuita molto visibile e senza carta", () => {
  it("usa i testi obbligatori nel banner riusato da hero, prezzi e sticky bar", () => {
    expect(TRIAL_COPY.headline).toBe("7 GIORNI COMPLETAMENTE GRATUITI");
    expect(TRIAL_COPY.noCard).toBe(
      "SENZA CARTA DI CREDITO, NÉ DATI BANCARI E NÉ DISDETTA",
    );
    expect(TRIAL_COPY.noCharge).toBe(
      "Al termine non partirà alcun addebito. Sarai tu a decidere se abbonarti.",
    );
    expect(TRIAL_COPY.cta).toBe("INIZIA I 7 GIORNI GRATIS");
    expect(TRIAL_COPY.ctaNote).toContain("Nessun metodo di pagamento");
    expect(TRIAL_COPY.ctaNote).toContain("né disdetta");
    for (const key of ["headline", "noCard", "noCharge", "cta", "ctaNote"] as const)
      expect(banner).toContain(`TRIAL_COPY.${key}`);
    expect(banner).toContain("TrialStickyBar");
    expect(pricingPage).toContain("<TrialStickyBar />");
    expect(pricingPage).toContain("<TrialBanner />");
    expect(landing).toContain("<TrialBanner />");
    expect(pricingPage).toContain("TRIAL_COPY.cta");
  });

  it("è applicativa: nessun checkout, customer o metodo di pagamento all'avvio", () => {
    const t = TRIAL_TERMS.join(" ");
    expect(t).toContain("7 GIORNI COMPLETAMENTE GRATUITI");
    expect(t).toContain("NESSUNA CARTA DI CREDITO");
    expect(t).toContain("dossier in versione filigranata");
    expect(t).toContain("ogni 12 mesi");
    expect(terms).toContain("prova applicativa");
    expect(terms).toMatch(/non viene creata alcuna sottoscrizione/);
    expect(CATALOG.trial.limits.watermarkedDossier).toBe(true);
    expect(Object.keys(CATALOG.trial.prices)).toHaveLength(0);
  });

  it("riconosce una prova per Partita IVA e dominio ogni 12 mesi", () => {
    expect(trialFingerprints({ vat: "IT 05770260288", email: "info@impresa.it" })).toEqual([
      { type: "vat", value: "IT05770260288" },
      { type: "domain", value: "impresa.it" },
    ]);
    expect(trialFingerprints({ email: "tizio@gmail.com" })).toEqual([]);
    expect(trialCooldownActive("2026-01-01T00:00:00.000Z", "2026-08-08T00:00:00.000Z")).toBe(true);
    expect(trialCooldownActive("2024-01-01T00:00:00.000Z", "2026-08-08T00:00:00.000Z")).toBe(false);
    expect(trialCooldownActive("non-una-data", "2026-08-08T00:00:00.000Z")).toBe(true);
  });
});

describe("valore, limiti e affermazioni verificabili", () => {
  it("non limita mai il numero di opportunità pertinenti", () => {
    expect(PRODUCT_BOUNDARIES[0]).toContain("non è mai limitato");
    expect(ALL).toContain("non è mai limitato");
  });

  it("definisce Verificato con tutti gli elementi richiesti", () => {
    const v = VERIFIED_DEFINITION.join(" ").toLowerCase();
    for (const token of [
      "fonte ufficiale",
      "versione",
      "stato",
      "scadenza",
      "beneficiari",
      "territorio",
      "intensità",
      "spese",
      "documenti",
    ])
      expect(v).toContain(token);
  });

  it("dichiara che il dossier non invia e non sostituisce il professionista", () => {
    const b = PRODUCT_BOUNDARIES.join(" ");
    expect(b).toContain("non invia nulla agli enti");
    expect(b).toContain("non sostituisce");
    expect(terms).toContain("non sostituisce il professionista incaricato");
  });

  it("mantiene una FAQ coerente con il catalogo", () => {
    const faq = PRICING_FAQ.map((f) => `${f.q} ${f.a}`).join(" ");
    expect(faq).toContain("senza carta di credito");
    expect(faq).toContain("15 con Executive");
    expect(faq).not.toMatch(/verifiche approfondite/i);
    expect(PRICING_FAQ.length).toBeGreaterThanOrEqual(6);
  });

  it("non lascia in giro prezzi o piani legacy nel copy pubblico", () => {
    for (const file of UI_FILES) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toContain("€299,00");
      expect(src, file).not.toContain("€599,00");
      expect(src, file).not.toMatch(/piano TEAM|utenti nominativi/i);
      expect(src, file).not.toMatch(/tutto illimitato/i);
    }
  });
});

describe("enforcement lato server, non solo nella UI", () => {
  it("il feed applica entitlement, profondità e cadenza del piano", () => {
    expect(feedFunctions).toContain("entitlementForTenant");
    // La cadenza è riservata una sola volta, dentro la Edge Function invocabile
    // direttamente con un JWT: qui resta solo il gate di entitlement.
    expect(feedFunctions).not.toContain("claimSearchLane");
    expect(feedFunctions).toContain("FEED_NOT_ENTITLED");
    expect(feedFunctions).toContain("AVAILABLE_SOURCE_TIER");
    // Il gate vale anche su refresh e cache, non solo sul fetch.
    expect(feedFunctions.match(/FEED_NOT_ENTITLED/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("i dossier consumano quota lato server, in modo idempotente", () => {
    expect(usageFunctions).toContain("consumeQuotaOnce");
    expect(usageFunctions).toContain("requireSupabaseAuth");
    expect(usageFunctions).toContain("opportunity_id");
    expect(usageFunctions).toContain("EXPORT_NOT_INCLUDED");
    expect(readFileSync("src/routes/_authenticated/bando.$id.tsx", "utf8")).toContain(
      "claimDossier",
    );
  });

  it("il checkout valida il Price remoto e resta in modalità test", () => {
    expect(billingFunctions).toContain("validateRemotePrice");
    expect(billingFunctions).toContain("fetchRemotePrice");
    expect(billingFunctions).toContain("billingConfigured");
    expect(billingServer).toContain("PORTAL_NOT_CONFIGURED");
    expect(billingServer).toContain("PRICES_NOT_CONFIGURED");
    expect(billingServer).toContain("LIVE_MODE_BLOCKED");
  });
});
