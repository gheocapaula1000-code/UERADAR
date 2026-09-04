import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DOSSIER_CTA_LABEL,
  OFFICIAL_CTA_LABEL,
  PROFILE_CTA_LABEL,
  RETRY_LABEL,
  SHOW_CATALOG_LABEL,
  cardPrimaryCta,
  feedListEmpty,
  profileMissingCopy,
} from "../plain-ux";

describe("plain-ux: passi successivi su vuoto/errore", () => {
  it("delega la copia degli empty state al feed: mai vicoli ciechi", () => {
    expect(
      feedListEmpty({
        fetchFailed: true,
        filteredCount: 0,
        activeFilters: 0,
        homeView: "catalog",
      })?.actionLabel,
    ).toBe(RETRY_LABEL);
    expect(
      feedListEmpty({
        fetchFailed: false,
        filteredCount: 0,
        activeFilters: 0,
        homeView: "profile",
      })?.actionLabel,
    ).toBe(SHOW_CATALOG_LABEL);
  });

  it("profilo mancante → un solo passo: completa il profilo", () => {
    const copy = profileMissingCopy();
    expect(copy.actionLabel).toBe(PROFILE_CTA_LABEL);
    expect(copy.title).toMatch(/profilo/i);
  });
});

describe("plain-ux: una sola CTA primaria per scheda", () => {
  const base = {
    sportello: false,
    esito: false,
    parziale: false,
    compatibile: null as boolean | null,
    officialHref: "https://ente.example/bando",
    entitled: true,
  };

  it("compatibile e accesso attivo → dossier", () => {
    const cta = cardPrimaryCta({ ...base, compatibile: true });
    expect(cta.kind).toBe("dossier");
    expect(cta.label).toBe(DOSSIER_CTA_LABEL);
  });

  it("parziale o non compatibile → Apri il bando ufficiale", () => {
    expect(cardPrimaryCta({ ...base, parziale: true }).kind).toBe("official");
    expect(cardPrimaryCta({ ...base, compatibile: false }).kind).toBe("official");
    expect(cardPrimaryCta({ ...base, compatibile: false }).label).toBe(OFFICIAL_CTA_LABEL);
  });

  it("senza accesso attivo la primaria è il bando ufficiale", () => {
    expect(cardPrimaryCta({ ...base, entitled: false }).kind).toBe("official");
  });

  it("graduatoria/esito → mai dossier, solo ufficiale (o niente)", () => {
    expect(cardPrimaryCta({ ...base, esito: true }).kind).toBe("official");
    expect(cardPrimaryCta({ ...base, esito: true, officialHref: null }).kind).toBe("none");
  });

  it("link ufficiale assente → ripiega sul dossier, mai vicolo cieco", () => {
    expect(cardPrimaryCta({ ...base, parziale: true, officialHref: null }).kind).toBe("dossier");
  });

  it("sportello → un'unica azione guidata, niente scelta multipla", () => {
    const cta = cardPrimaryCta({ ...base, sportello: true, parziale: true });
    expect(cta.kind).toBe("sportello");
  });
});

describe("plain-ux: le superfici usano il modulo condiviso", () => {
  it("dashboard, card e dettaglio importano da plain-ux", () => {
    const dashboard = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
    const card = readFileSync("src/components/bandocore/BandoCard.tsx", "utf8");
    const detail = readFileSync("src/routes/_authenticated/bando.$id.tsx", "utf8");
    expect(dashboard).toContain("@/lib/plain-ux");
    expect(dashboard).toContain("feedListEmpty");
    expect(card).toContain("cardPrimaryCta");
    expect(detail).toContain("@/lib/plain-ux");
  });
});
