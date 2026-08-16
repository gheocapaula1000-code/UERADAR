import { describe, expect, it } from "vitest";
import {
  CORE_SOURCES,
  admitBando,
  admitFeed,
  feedTier,
  sourceForUrl,
  splitFeedTiers,
} from "../feed-admission";
import type { Bando } from "../bandocore-types";

const NOW = Date.parse("2026-08-13T08:00:00Z");

function bando(over: Partial<Bando> = {}): Bando {
  return {
    id: "b1",
    titolo: "Bando digitalizzazione PMI",
    ente: "Regione Veneto",
    descrizione: "Contributo a fondo perduto",
    categoria: "FONDO_PERDUTO",
    scope: "REGIONALE",
    scadenza: "2026-11-30",
    importo_max: 50_000,
    official_url: "https://bandi.regione.veneto.it/Public/Dettaglio?idAtto=1",
    ...over,
  } as Bando;
}

describe("registro fonti core", () => {
  it("copre le fonti obbligatorie nell'ordine richiesto", () => {
    expect(CORE_SOURCES.map((s) => s.id)).toEqual([
      "veneto",
      "invitalia",
      "mimit",
      "eu",
      "padova",
      "cciaa",
      "gal",
      "unioncamere",
      "provincia",
    ]);
  });

  it("riconosce gli host ufficiali e rifiuta il resto", () => {
    expect(sourceForUrl("https://bandi.regione.veneto.it/x")?.id).toBe("veneto");
    expect(sourceForUrl("https://www.invitalia.it/x")?.id).toBe("invitalia");
    expect(sourceForUrl("https://www.incentivi.gov.it/it/x")?.id).toBe("mimit");
    expect(sourceForUrl("https://ec.europa.eu/info/funding-tenders/x")?.id).toBe("eu");
    expect(sourceForUrl("https://www.padovanet.it/x")?.id).toBe("padova");
    expect(sourceForUrl("https://www.pd.camcom.it/x")?.id).toBe("cciaa");
    expect(sourceForUrl("https://www.provincia.pd.it/x")?.id).toBe("provincia");
    expect(sourceForUrl("https://blog-bandi.example.com/x")).toBeNull();
    expect(sourceForUrl("javascript:alert(1)")).toBeNull();
    expect(sourceForUrl(undefined)).toBeNull();
  });
});

describe("ammissione fail-closed", () => {
  it("ammette una scheda solida", () => {
    expect(admitBando(bando(), NOW)).toMatchObject({ ok: true });
  });

  it("ammette senza scadenza e senza importo, segnando i buchi", () => {
    expect(
      admitBando(
        bando({
          scadenza: undefined,
          apertura: undefined,
          importo_max: undefined,
          aid_intensity_percent: undefined,
          eligible_expenses: [],
          scope: "COMUNALE",
          ente: "Comune di Padova",
          official_url: "https://www.padovanet.it/bando",
        }),
        NOW,
      ),
    ).toMatchObject({ ok: true, gaps: { missing_deadline: true, missing_economics: true } });
    expect(
      admitBando(
        bando({
          scadenza: undefined,
          apertura: undefined,
          importo_max: undefined,
          aid_intensity_percent: undefined,
          eligible_expenses: [],
          scope: "NAZIONALE",
          ente: "MIMIT",
          official_url: "https://www.incentivi.gov.it/it/bando",
        }),
        NOW,
      ),
    ).toMatchObject({ ok: true });
  });

  it("accetta apertura dichiarata al posto della scadenza", () => {
    expect(
      admitBando(bando({ scadenza: undefined, apertura: "2026-10-01" }), NOW),
    ).toMatchObject({ ok: true });
  });

  it("scarta scadenza passata", () => {
    expect(admitBando(bando({ scadenza: "2026-01-01" }), NOW)).toMatchObject({
      ok: false,
      reason: "DEADLINE_PAST",
    });
  });

  it("accetta intensita aiuto o spese ammissibili come dato economico", () => {
    expect(admitBando(bando({ importo_max: undefined, aid_intensity_percent: 40 }), NOW)).toMatchObject({ ok: true });
    expect(
      admitBando(bando({ importo_max: undefined, eligible_expenses: ["Macchinari"] }), NOW),
    ).toMatchObject({ ok: true });
  });

  it("ammette schede solide comunali, camerali e provinciali", () => {
    expect(
      admitBando(
        bando({ scope: "COMUNALE", ente: "Comune di Padova", official_url: "https://www.padovanet.it/bando" }),
        NOW,
      ),
    ).toMatchObject({ ok: true });
    expect(
      admitBando(
        bando({ scope: "CAMERALE", ente: "CCIAA Padova", official_url: "https://www.pd.camcom.it/bando" }),
        NOW,
      ),
    ).toMatchObject({ ok: true });
    expect(
      admitBando(
        bando({ scope: "REGIONALE", ente: "Provincia di Padova", official_url: "https://www.provincia.pd.it/bando" }),
        NOW,
      ),
    ).toMatchObject({ ok: true });
  });

  it("scarta fonti fuori registro", () => {
    expect(admitBando(bando({ official_url: "https://example.com/x", notice_url: undefined }), NOW)).toMatchObject({
      ok: false,
      reason: "SOURCE_NOT_CORE",
    });
    expect(
      admitBando(bando({ official_url: "https://news.example.com/x", notice_url: undefined }), NOW),
    ).toMatchObject({ ok: false, reason: "SOURCE_NOT_CORE" });
  });
});

describe("rendiconto feed", () => {
  it("porta: ufficiale senza data e senza importo entra, scadenza passata ed example.com no", () => {
    expect(
      admitBando(
        bando({ scadenza: undefined, apertura: undefined, importo_max: undefined }),
        NOW,
      ),
    ).toMatchObject({ ok: true, gaps: { missing_deadline: true, missing_economics: true } });
    expect(admitBando(bando({ scadenza: "2020-01-01" }), NOW)).toMatchObject({ ok: false });
    expect(
      admitBando(bando({ official_url: "https://example.com/x", notice_url: undefined }), NOW),
    ).toMatchObject({ ok: false, reason: "SOURCE_NOT_CORE" });
  });

  it("conta validi, scartati e fonti attive", () => {
    const report = admitFeed(
      [
        bando({ id: "1" }),
        bando({
          id: "2",
          ente: "MIMIT",
          scope: "NAZIONALE",
          official_url: "https://www.incentivi.gov.it/it/bando",
        }),
        bando({ id: "3", scadenza: "2026-01-01" }),
        bando({ id: "4", official_url: "https://news.example.com/bando", notice_url: undefined }),
      ],
      NOW,
    );
    expect(report.admitted_count).toBe(2);
    expect(report.rejected_count).toBe(2);
    expect(report.rejected_by_reason).toMatchObject({ DEADLINE_PAST: 1, SOURCE_NOT_CORE: 1 });
    expect(report.active_sources.map((s) => s.id)).toEqual(["veneto", "mimit"]);
  });
});

describe("fasce vetrina", () => {
  const strong = (): NonNullable<Bando["match"]> => ({
    status: "COMPATIBILE",
    score: 90,
    confirmed: [],
    missing: [],
    blockers: [],
  });

  it("alta priorita con data e dato economico, indipendente dal match", () => {
    expect(feedTier(bando({ match: strong() }), NOW)).toBe("ALTA_PRIORITA");
    expect(feedTier(bando(), NOW)).toBe("ALTA_PRIORITA");
    expect(feedTier(bando({ match: strong(), importo_max: undefined, eligible_expenses: [] }), NOW)).toBe(
      "DA_VERIFICARE",
    );
    expect(
      feedTier(bando({ match: strong(), scadenza: undefined, apertura: undefined }), NOW),
    ).toBe("DA_VERIFICARE");
    expect(feedTier(bando({ scadenza: undefined, apertura: undefined }), NOW)).toBe("DA_VERIFICARE");
  });

  it("non nasconde nulla: le due fasce coprono tutto il feed", () => {
    const list = [
      bando({ id: "a", match: strong() }),
      bando({ id: "b", scadenza: undefined, apertura: undefined }),
    ];
    const { high, review } = splitFeedTiers(list, NOW);
    expect(high.map((b) => b.id)).toEqual(["a"]);
    expect(review.map((b) => b.id)).toEqual(["b"]);
  });
});
