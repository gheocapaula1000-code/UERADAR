import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CUSTOM_PLAN, PRICING_FAQ, PUBLIC_PLANS, TRIAL_TERMS } from "@/lib/pricing";

const pricingPage = readFileSync("src/routes/prezzi.tsx", "utf8");
const landing = readFileSync("src/routes/index.tsx", "utf8");
const terms = readFileSync("src/routes/termini.tsx", "utf8");
const pricingLib = readFileSync("src/lib/pricing.ts", "utf8");
const ALL = [pricingPage, landing, terms, pricingLib].join("\n");

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

  it("include i costi API e vieta overage automatici", () => {
    const t = TRIAL_TERMS.join(" ");
    expect(t).toContain("Costi API inclusi entro un uso corretto del servizio.");
    expect(t).toContain("Nessun overage o costo extra automatico.");
    expect(terms).toContain("non sono previsti overage né costi extra automatici");
  });

  it("non contiene prezzi legacy né checkout/Stripe/billing reale", () => {
    expect(ALL).not.toMatch(/39\s*€/);
    expect(ALL).not.toMatch(/€\s*39\b/);
    expect(ALL).not.toMatch(/stripe/i);
    expect(ALL).not.toMatch(/checkout/i);
    expect(ALL).not.toMatch(/paypal|payment_link|buy\.stripe/i);
    expect(pricingPage).not.toMatch(/href="https?:\/\/(?!ueradar)/);
    // le CTA della prova puntano solo al percorso auth esistente
    expect(pricingPage).toContain('to="/auth"');
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
