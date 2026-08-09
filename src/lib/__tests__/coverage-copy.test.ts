import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  COVERAGE_HEADLINE,
  COVERAGE_LEVELS,
  DRAFT_COPY,
  MONITORING_COPY,
  RESEARCH_COPY,
  TRIAL_HIGHLIGHT,
  VALUE_STATEMENT,
} from "@/lib/coverage";

const HOME = readFileSync("src/routes/index.tsx", "utf8");
const PRICING = readFileSync("src/routes/prezzi.tsx", "utf8");
const DASHBOARD = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");

describe("copertura su cinque livelli", () => {
  it("dichiara esattamente i cinque livelli", () => {
    expect(COVERAGE_LEVELS).toEqual([
      "Locale",
      "Provinciale",
      "Regionale",
      "Nazionale",
      "Europeo",
    ]);
    for (const l of COVERAGE_LEVELS) expect(COVERAGE_HEADLINE.toLowerCase()).toContain(l.toLowerCase());
  });

  it("il messaggio principale è quello approvato, senza promesse di tempo reale", () => {
    expect(VALUE_STATEMENT).toContain("miliardi di euro restano inutilizzati o non intercettati");
    expect(VALUE_STATEMENT).toContain(
      "fonti locali, provinciali, regionali, nazionali ed europee",
    );
    expect(VALUE_STATEMENT).toContain("pronta per verifica e invio");
    expect(VALUE_STATEMENT).not.toMatch(/tempo reale/i);
  });

  it("usa monitoraggio continuo e aggiornamenti tempestivi", () => {
    expect(MONITORING_COPY).toMatch(/monitoraggio continuo/i);
    expect(MONITORING_COPY).toMatch(/aggiornamenti tempestivi/i);
    expect(MONITORING_COPY).not.toMatch(/tempo reale/i);
  });

  it("descrive ricerca profonda su fonti ufficiali e specialistiche", () => {
    expect(RESEARCH_COPY).toMatch(/fonti ufficiali e specialistiche/i);
    expect(RESEARCH_COPY).toMatch(/difficili da trovare/i);
  });

  it("la preparazione è una bozza soggetta a verifica, mai invio automatico", () => {
    expect(DRAFT_COPY).toMatch(/bozza/i);
    expect(DRAFT_COPY).toMatch(/verifica/i);
    expect(DRAFT_COPY).toMatch(/non invia domande/i);
  });

  it("home e prezzi mostrano il messaggio una sola volta, senza duplicazioni", () => {
    for (const src of [HOME, PRICING]) {
      expect(src).toContain("VALUE_STATEMENT");
      expect(src.match(/\{VALUE_STATEMENT\}/g) ?? []).toHaveLength(1);
      expect(src).not.toContain("miliardi di euro restano inutilizzati");
      expect(src).toContain("COVERAGE_LEVELS");
      expect(src).toContain("TRIAL_HIGHLIGHT");
    }
  });

  it("la prova gratuita resta evidente", () => {
    expect(TRIAL_HIGHLIGHT).toBe("7 giorni gratuiti, senza carta");
  });

  it("la dashboard dichiara i cinque livelli e il monitoraggio continuo", () => {
    expect(DASHBOARD).toContain("COVERAGE_HEADLINE");
    expect(DASHBOARD).toContain("MONITORING_COPY");
  });

  it("un solo H1 per pagina pubblica", () => {
    for (const src of [HOME, PRICING, DASHBOARD]) {
      expect((src.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    }
  });
});
