import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ONBOARDING_STEPS, REQUIRED_BY_STEP, missingFields, stepComplete } from "../onboarding";
import type { CompanyProfile } from "../bandocore-types";

const profilo = readFileSync("src/routes/_authenticated/profilo.tsx", "utf8");
const dashboard = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");

const base = {
  ragione_sociale: "",
  partita_iva: "",
  forma_giuridica: "SRL",
  codice_ateco: "",
  regione: "",
  provincia: "",
  comune: "",
  numero_dipendenti: 0,
  fatturato_annuo: 0,
  anno_costituzione: 2020,
} as unknown as CompanyProfile;

describe("profilo guidato", () => {
  it("i passi coprono solo i campi realmente obbligatori", () => {
    expect(ONBOARDING_STEPS.map((s) => s.key)).toEqual(["identita", "sede", "obiettivi"]);
    expect(REQUIRED_BY_STEP.identita).toContain("partita_iva");
    expect(REQUIRED_BY_STEP.sede).toContain("comune");
    expect(REQUIRED_BY_STEP.identita).not.toContain("codice_istat");
  });

  it("un passo incompleto elenca i campi mancanti", () => {
    expect(missingFields(base, "identita")).toEqual(["ragione_sociale", "partita_iva", "codice_ateco"]);
    expect(stepComplete(base, "identita")).toBe(false);
    const ok = { ...base, ragione_sociale: "ACME", partita_iva: "IT01", codice_ateco: "62.01" };
    expect(stepComplete(ok, "identita")).toBe(true);
    expect(stepComplete(ok, "obiettivi")).toBe(true);
  });

  it("i dati facoltativi sono separati e la conferma è persistente", () => {
    expect(profilo).toContain("Dati facoltativi");
    expect(profilo).toContain("Vedi i tuoi Bandi");
    expect(profilo).not.toContain('navigate({ to: "/dashboard" });\n      } catch');
  });
});

describe("dashboard più semplice", () => {
  it("i filtri sono raccolti e azzerabili", () => {
    expect(dashboard).toContain("Azzera filtri");
    expect(dashboard).toContain("activeFilters");
    expect(dashboard).toContain("setFiltersOpen");
  });

  it("l'esito dell'aggiornamento resta a schermo", () => {
    expect(dashboard).toContain("setRefreshNotice");
    expect(dashboard).toContain("nessuna azione richiesta");
  });
});
