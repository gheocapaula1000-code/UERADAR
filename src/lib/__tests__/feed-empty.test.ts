import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  RESET_FILTERS_LABEL,
  RETRY_LABEL,
  SHOW_CATALOG_LABEL,
  catalogEmptyCopy,
  feedListEmpty,
  fetchErrorCopy,
  filtersEmptyCopy,
  flashEmptyCopy,
  profileEmptyCopy,
} from "../feed-empty";
import { feedUpdatedIso } from "../feed-updated";

describe("passi successivi sugli empty/error del feed", () => {
  it("filtri a zero → Azzera filtri", () => {
    const copy = feedListEmpty({
      fetchFailed: false,
      filteredCount: 0,
      activeFilters: 2,
      homeView: "catalog",
    });
    expect(copy?.kind).toBe("filters");
    expect(copy?.actionLabel).toBe(RESET_FILTERS_LABEL);
    expect(RESET_FILTERS_LABEL).toBe("Azzera filtri");
  });

  it("Per la mia impresa vuoto → Vedi tutti i Bandi", () => {
    const copy = feedListEmpty({
      fetchFailed: false,
      filteredCount: 0,
      activeFilters: 0,
      homeView: "profile",
    });
    expect(copy?.kind).toBe("profile");
    expect(copy?.actionLabel).toBe(SHOW_CATALOG_LABEL);
    expect(SHOW_CATALOG_LABEL).toBe("Vedi tutti i Bandi");
    expect(copy?.body).toMatch(/non vuol dire che la tua impresa è esclusa/i);
  });

  it("catalogo vuoto o fetch fallito → Riprova, senza zero inventato", () => {
    expect(feedListEmpty({
      fetchFailed: false,
      filteredCount: 0,
      activeFilters: 0,
      homeView: "catalog",
    })?.actionLabel).toBe(RETRY_LABEL);
    const failed = fetchErrorCopy(12);
    expect(failed.actionLabel).toBe(RETRY_LABEL);
    expect(failed.body).toContain("12 Bandi");
    expect(failed.body).not.toMatch(/\b0 Bandi\b/);
    expect(fetchErrorCopy(null).body).toContain("Non inventiamo schede");
    expect(catalogEmptyCopy().title).toMatch(/Nessun Bando ufficiale/i);
  });

  it("lista con risultati non produce empty, salvo errore di rete", () => {
    expect(
      feedListEmpty({
        fetchFailed: false,
        lastKnownCount: 4,
        filteredCount: 3,
        activeFilters: 1,
        homeView: "profile",
      }),
    ).toBeNull();
    const failed = feedListEmpty({
      fetchFailed: true,
      lastKnownCount: 4,
      filteredCount: 3,
      activeFilters: 1,
      homeView: "profile",
    });
    expect(failed?.kind).toBe("fetch-error");
    expect(failed?.actionLabel).toBe(RETRY_LABEL);
    expect(failed?.body).toContain("4 Bandi");
  });

  it("flash vuoto con elenco sotto invita a scorrere, senza inventare scadenze", () => {
    const withList = flashEmptyCopy(true);
    expect(withList.body).toMatch(/Scorri l'elenco sotto/i);
    expect(withList.title).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
  });

  it("i copy restano quelli usati dalla dashboard", () => {
    const dashboard = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
    expect(dashboard).toContain("feedListEmpty");
    expect(dashboard).toContain("flashEmptyCopy");
    expect(dashboard).toContain("RESET_FILTERS_LABEL");
    expect(dashboard).toContain("SHOW_CATALOG_LABEL");
    expect(dashboard).toContain("RETRY_LABEL");
    expect(dashboard).toContain("lastKnownCount");
    expect(dashboard).toContain("feedUpdatedIso");
    expect(filtersEmptyCopy().actionLabel).toBe("Azzera filtri");
    expect(profileEmptyCopy().actionLabel).toBe("Vedi tutti i Bandi");
  });
});

describe("timestamp generated_at visibile", () => {
  it("preferisce generated_at a fetched_at e non inventa date", () => {
    expect(
      feedUpdatedIso({
        generated_at: "2026-08-27T08:00:00.000Z",
        fetched_at: "2026-08-27T09:00:00.000Z",
      }),
    ).toBe("2026-08-27T08:00:00.000Z");
    expect(feedUpdatedIso({ fetched_at: "2026-08-27T09:00:00.000Z" })).toBe("2026-08-27T09:00:00.000Z");
    expect(feedUpdatedIso({ fetched_at: "non-una-data" })).toBeNull();
    expect(feedUpdatedIso(null)).toBeNull();
  });

  it("la dashboard mostra Aggiornato il quando Per la mia impresa è accesa", () => {
    const dashboard = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
    expect(dashboard).toContain("homeView === \"profile\"");
    expect(dashboard).toContain("Aggiornato il");
    expect(dashboard).toContain("generated_at");
  });
});
