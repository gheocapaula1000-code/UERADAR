import { describe, expect, it } from "vitest";
import {
  compareByQuality,
  hasEconomics,
  hasIncompleteCoreData,
  isSportello,
  isVerified,
  qualityRank,
} from "@/lib/bando-status";
import type { Bando } from "@/lib/bandocore-types";

const NOW = Date.parse("2026-08-12T12:00:00Z");
const FUTURE = "2026-12-31";

function bando(over: Partial<Bando> = {}): Bando {
  return {
    id: "b1",
    titolo: "Bando digitalizzazione PMI",
    ente: "Regione Lombardia",
    descrizione: "Contributo a fondo perduto",
    categoria: "FONDO_PERDUTO",
    scope: "REGIONALE",
    scadenza: FUTURE,
    importo_max: 50_000,
    official_url: "https://esempio.regione.it/bando",
    verification_status: "VERIFICATO",
    requisiti: ["Impresa attiva"],
    ...over,
  } as Bando;
}

describe("isVerified (fail-closed)", () => {
  it("bando completo => true", () => {
    expect(isVerified(bando(), NOW)).toBe(true);
  });

  it("senza scadenza => false", () => {
    expect(isVerified(bando({ scadenza: undefined }), NOW)).toBe(false);
  });

  it("senza URL ufficiale => false", () => {
    expect(isVerified(bando({ official_url: undefined, notice_url: undefined }), NOW)).toBe(false);
  });

  it("scaduto => false", () => {
    expect(isVerified(bando({ scadenza: "2026-01-01" }), NOW)).toBe(false);
  });

  it("stato non VERIFICATO => false", () => {
    expect(isVerified(bando({ verification_status: "PARZIALE" }), NOW)).toBe(false);
  });

  it("senza dato economico => false", () => {
    expect(
      isVerified(
        bando({ importo_max: undefined, aid_intensity_percent: undefined, eligible_expenses: [] }),
        NOW,
      ),
    ).toBe(false);
  });

  it("senza requisiti ne evidenza => false", () => {
    expect(isVerified(bando({ requisiti: [], evidence: [] }), NOW)).toBe(false);
  });

  it("evidenza documentale al posto dei requisiti => true", () => {
    expect(
      isVerified(
        bando({
          requisiti: [],
          evidence: [{ source_url: "https://esempio.it/pdf" }] as Bando["evidence"],
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it("intensita aiuto vale come dato economico", () => {
    expect(hasEconomics(bando({ importo_max: undefined, aid_intensity_percent: 40 }))).toBe(true);
  });
});

describe("qualita e ordinamento feed", () => {
  it("segnala dati incompleti quando manca scadenza o importo", () => {
    expect(hasIncompleteCoreData(bando())).toBe(false);
    expect(hasIncompleteCoreData(bando({ scadenza: undefined }))).toBe(true);
    expect(
      hasIncompleteCoreData(
        bando({ importo_max: undefined, aid_intensity_percent: undefined, eligible_expenses: [] }),
      ),
    ).toBe(true);
  });

  it("verificato ha priorita, schede vuote in fondo", () => {
    const verificato = bando({ id: "v" });
    const conScadenza = bando({ id: "s", verification_status: "PARZIALE" });
    const vuoto = bando({
      id: "x",
      verification_status: "DA_VERIFICARE",
      scadenza: undefined,
      importo_max: undefined,
      aid_intensity_percent: undefined,
      eligible_expenses: [],
    });
    expect(qualityRank(verificato, NOW)).toBeLessThan(qualityRank(conScadenza, NOW));
    expect(qualityRank(conScadenza, NOW)).toBeLessThan(qualityRank(vuoto, NOW));
    const ordered = [vuoto, conScadenza, verificato].sort((a, b) => compareByQuality(a, b, NOW));
    expect(ordered.map((b) => b.id)).toEqual(["v", "s", "x"]);
  });

  it("a parita di qualita i rari/nascosti salgono prima, poi la scadenza piu vicina", () => {
    const noto = bando({ id: "n", verification_status: "PARZIALE", scadenza: "2026-10-01" });
    const raro = bando({
      id: "r",
      verification_status: "PARZIALE",
      scadenza: "2026-11-01",
      is_hidden: true,
    });
    const vicino = bando({
      id: "c",
      verification_status: "PARZIALE",
      scadenza: "2026-09-01",
      rarity_score: 4,
    });
    const ordered = [noto, raro, vicino].sort((a, b) => compareByQuality(a, b, NOW));
    expect(ordered.map((b) => b.id)).toEqual(["c", "r", "n"]);
  });
});

describe("bandi a sportello", () => {
  it("sportello + importo non è una scheda incompleta", () => {
    const b = bando({ scadenza: undefined, verification_status: "SPORTELLO" });
    expect(hasIncompleteCoreData(b)).toBe(false);
    expect(isVerified(b, NOW)).toBe(true);
    expect(qualityRank(b, NOW)).toBe(0);
  });

  it("senza data e senza sportello resta incompleto", () => {
    expect(hasIncompleteCoreData(bando({ scadenza: undefined }))).toBe(true);
  });

  it("sportello:true o testo ufficiale «a sportello» completa lo stato-data", () => {
    expect(isSportello(bando({ scadenza: undefined, sportello: true }))).toBe(true);
    expect(hasIncompleteCoreData(bando({ scadenza: undefined, sportello: true }))).toBe(false);
    expect(
      isSportello(
        bando({
          scadenza: undefined,
          verification_status: "PARZIALE",
          titolo: "Voucher digitale a sportello",
        }),
      ),
    ).toBe(true);
    expect(isSportello(bando({ scadenza: undefined, titolo: "Bando ordinario PMI" }))).toBe(false);
  });

  it("importo stringa Postgres conta come dato economico", () => {
    expect(hasEconomics(bando({ importo_max: "150000.00" as unknown as number }))).toBe(true);
    expect(
      hasEconomics(
        bando({
          importo_max: undefined,
          aid_intensity_percent: "40" as unknown as number,
        }),
      ),
    ).toBe(true);
    expect(
      hasEconomics(
        bando({
          importo_max: "no" as unknown as number,
          aid_intensity_percent: undefined,
          eligible_expenses: [],
        }),
      ),
    ).toBe(false);
  });
});
