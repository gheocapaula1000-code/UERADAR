import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ARCHITECTURE_NOTES,
  CUSTOM_PLAN,
  PRICING_FAQ,
  PUBLIC_PLANS,
  TRIAL_TERMS,
  UNLIMITED_FEATURES,
} from "@/lib/pricing";

const pricingPage = readFileSync("src/routes/prezzi.tsx", "utf8");
const landing = readFileSync("src/routes/index.tsx", "utf8");
const terms = readFileSync("src/routes/termini.tsx", "utf8");
const privacy = readFileSync("src/routes/privacy.tsx", "utf8");
const pricingLib = readFileSync("src/lib/pricing.ts", "utf8");
const ALL = [pricingPage, landing, terms, privacy, pricingLib].join("\n");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|json|webmanifest)$/.test(p)) out.push(p);
  }
  return out;
}

/** Copy pubblico dell'app, escludendo test e file generati. */
const UI_FILES = walk("src")
  .filter((p) => !p.includes("__tests__") && !p.endsWith("routeTree.gen.ts"))
  .filter((p) => p.includes("/routes/") || p.includes("/components/") || p.endsWith("/pricing.ts"))
  .filter((p) => !p.includes("/routes/api/"));

describe("piani pubblici UEradar", () => {
  it("espone esattamente i due piani con prezzi 299/599 IVA esclusa", () => {
    expect(PUBLIC_PLANS.map((p) => p.name)).toEqual(["BUSINESS", "TEAM"]);
    expect(PUBLIC_PLANS[0]!.price).toBe("€299,00");
    expect(PUBLIC_PLANS[1]!.price).toBe("€599,00");
    for (const p of PUBLIC_PLANS) {
      expect(p.vatNote).toContain("+ IVA");
      expect(p.vatNote).toContain("IVA esclusa");
    }
    expect(terms).toContain("€299,00");
    expect(terms).toContain("€599,00");
    expect(terms).toContain("IVA esclusa");
  });

  it("limita gli utenti nominativi a 3 e 10 su una sola impresa verificata", () => {
    expect(PUBLIC_PLANS[0]!.seats).toBe(3);
    expect(PUBLIC_PLANS[1]!.seats).toBe(10);
    for (const p of PUBLIC_PLANS) {
      expect(p.features).toContain("1 impresa verificata");
      expect(p.features).toContain(p.seatsLabel);
    }
    expect(ALL.toLowerCase()).not.toContain("multi-azienda");
    expect(ALL.toLowerCase()).not.toContain("più aziende");
  });

  it("dichiara tutto illimitato in entrambi i piani", () => {
    for (const p of PUBLIC_PLANS) {
      for (const f of UNLIMITED_FEATURES) expect(p.features).toContain(f);
      expect(p.features).toContain("Tutto illimitato: nessuna quota e nessun credito");
    }
    expect(TRIAL_TERMS.join(" ")).toContain("Tutto illimitato");
    expect(terms).toContain("nessuna quota, nessun credito");
    expect(landing).toContain("illimitat");
    expect(PRICING_FAQ.some((f) => /illimitat/i.test(f.a))).toBe(true);
  });

  it("nessuna quota, credito, fair use o soglia di uso corretto nel copy pubblico", () => {
    const hits: string[] = [];
    const FORBIDDEN: RegExp[] = [
      /\bfair\s*use\b/i,
      /uso corretto/i,
      /\d+\s*(dossier|pratiche|ricerche|export|analisi)\s*\/?\s*(al\s+)?mese/i,
      /limite mensile/i,
      /quota mensile/i,
      /crediti (inclusi|residui|disponibili|mensili)/i,
      /consumo di crediti/i,
      /pacchetto crediti/i,
      /\boverage\b(?!\s+(e|né|o)\s+nessun)/i,
    ];
    for (const f of UI_FILES) {
      const src = readFileSync(f, "utf8");
      for (const re of FORBIDDEN) {
        const m = src.match(re);
        // "nessun overage" e formule negative sono ammesse
        if (m && !/nessun\s+overage/i.test(m[0])) hits.push(`${f} :: ${re} :: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("descrive costi API inclusi senza overage né addebiti automatici", () => {
    const t = TRIAL_TERMS.join(" ");
    expect(t).toContain("Costi API inclusi nel canone.");
    expect(t).toContain("Nessun overage e nessun costo extra automatico.");
    expect(terms).toContain("I costi API sono inclusi nel canone");
    expect(terms).toContain("non sono previsti overage né costi extra automatici");
  });

  it("spiega l'architettura cost-efficient senza condividere dati privati", () => {
    const notes = ARCHITECTURE_NOTES.map((n) => `${n.t} ${n.d}`).join(" ");
    expect(notes).toMatch(/dedupl/i);
    expect(notes).toMatch(/TTL/);
    expect(notes).toMatch(/versione/i);
    expect(notes).toMatch(/invalidazione/i);
    expect(notes).toMatch(/idempotent/i);
    expect(notes).toMatch(/cache/i);
    expect(notes).toMatch(/rate limit/i);
    expect(notes).toMatch(/circuit breaker/i);
    expect(notes).toMatch(/isolat/i);
    expect(notes).toMatch(/cross-tenant/i);
    expect(privacy).toContain("cross-tenant");
    // le protezioni interne non devono mai essere presentate come quote o addebiti
    expect(notes).toMatch(/non sono quote commerciali/i);
  });

  it("offre una soluzione su misura oltre 10 utenti senza form di invio", () => {
    expect(CUSTOM_PLAN.headline).toBe("Soluzione su misura");
    expect(CUSTOM_PLAN.cta).toBe("Contattaci");
    expect(pricingPage).not.toMatch(/<form[\s>]/);
    expect(pricingPage).not.toMatch(/type="submit"/);
  });

  it("dichiara prova 7 giorni senza carta e senza dati bancari", () => {
    const t = TRIAL_TERMS.join(" ");
    expect(t).toContain("Prova gratuita 7 giorni");
    expect(t).toContain("Nessuna carta di credito e nessun dato bancario");
    expect(terms).toContain("non richiede carta di credito né dati bancari");
  });

  it("esclude addebiti automatici a fine prova senza attivazione volontaria", () => {
    expect(TRIAL_TERMS.join(" ")).toContain(
      "Nessun addebito automatico alla fine della prova: il servizio a pagamento parte solo con attivazione volontaria.",
    );
    expect(terms).toContain("attivazione volontaria");
    expect(PRICING_FAQ.some((f) => /nessun addebito automatico/i.test(f.a))).toBe(true);
  });

  it("consente cancellazione online senza disdetta scritta e senza PEC", () => {
    expect(TRIAL_TERMS.join(" ")).toContain(
      "Cancellazione online, senza disdetta scritta e senza PEC.",
    );
    expect(terms).toContain("senza disdetta scritta e senza PEC");
  });

  it("non contiene prezzi legacy né checkout/Stripe/billing reale", () => {
    const hits: string[] = [];
    for (const f of UI_FILES) {
      const src = readFileSync(f, "utf8");
      for (const re of [/39\s*€/, /€\s*39\b/, /stripe/i, /paypal/i, /payment_link/i, /\bcheck-?out\b/i]) {
        if (re.test(src)) hits.push(`${f} :: ${re}`);
      }
    }
    expect(hits).toEqual([]);
    // le CTA della prova puntano solo al percorso auth esistente
    expect(pricingPage).toContain('to="/auth"');
    expect(pricingPage).not.toMatch(/href="https?:\/\/(?!ueradar)/);
  });

  it("non promette funzionalità Team inesistenti", () => {
    for (const re of [
      /ruoli avanzati/i,
      /workflow approvativ/i,
      /approvazion/i,
      /commenti/i,
      /assegnazion/i,
      /realtime|in tempo reale/i,
      /tutti i bandi/i,
      /domanda (pronta|inviata)/i,
    ]) {
      expect(ALL).not.toMatch(re);
    }
  });
});
