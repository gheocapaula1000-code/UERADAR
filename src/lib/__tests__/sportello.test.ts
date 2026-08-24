import { describe, expect, it } from "vitest";
import { hasOfficialSportelloSentence, isHighPriorityFeed, isSportello } from "@/lib/bando-status";
import type { Bando } from "@/lib/bandocore-types";
import {
  MISSING_OFFICIAL_LINE,
  SPORTELLO_BADGE,
  SPORTELLO_CTA,
  SPORTELLO_URGENCY,
  officialAtecoMentions,
  officialFundsPhrase,
  nextSportelloStep,
  profileFacts,
  readSportelloProgress,
  sportelloSteps,
  writeSportelloProgress,
} from "@/lib/sportello";

const NOW = Date.parse("2026-08-24T08:00:00Z");

function bando(over: Partial<Bando> = {}): Bando {
  return {
    id: "sp-1",
    titolo: "Contributo a sportello",
    ente: "Regione Veneto",
    descrizione: "Procedura a sportello fino a esaurimento fondi.",
    categoria: "FONDO_PERDUTO",
    scope: "REGIONALE",
    official_url: "https://bandi.regione.veneto.it/bando",
    verification_status: "SPORTELLO",
    sportello: true,
    importo_max: 20_000,
    requisiti: ["Impresa attiva"],
    ...over,
  } as Bando;
}

describe("sportello onesto", () => {
  it("badge e urgenza sono le frasi fisse, senza data inventata", () => {
    expect(SPORTELLO_BADGE).toBe("A sportello · fino a esaurimento fondi");
    expect(SPORTELLO_URGENCY).toBe("Meglio fare subito: i soldi possono finire.");
    expect(SPORTELLO_CTA).toBe("Partecipa adesso");
    expect(MISSING_OFFICIAL_LINE).toBe("Non c'è sul bando. Aprendo il sito ufficiale lo vedi.");
  });

  it("legge 'fino ad esaurimento fondi' dal testo ufficiale", () => {
    expect(
      officialFundsPhrase(
        bando({ descrizione: "Domande aperte fino ad esaurimento fondi." }),
      ),
    ).toBe("fino ad esaurimento fondi");
  });

  it("non inventa ATECO: solo righe confirmed che lo citano", () => {
    expect(officialAtecoMentions(bando())).toEqual([]);
    expect(
      officialAtecoMentions(
        bando({
          match: {
            status: "DA_VERIFICARE",
            score: 10,
            confirmed: ["ATECO 62 citato nel bando"],
            missing: [],
            blockers: [],
          },
        }),
      ),
    ).toEqual(["ATECO 62 citato nel bando"]);
  });

  it("i dati profilo sono da copiare, non un giudizio", () => {
    const facts = profileFacts({
      ragione_sociale: "Acme SRL",
      partita_iva: "01234567890",
      codice_ateco: "62.01",
      comune: "Padova",
      provincia: "PD",
      regione: "Veneto",
    });
    expect(facts.some((f) => f.kind === "ateco" && f.value === "62.01")).toBe(true);
    expect(facts.map((f) => f.label).join(" ")).not.toMatch(/COMPATIBILE/);
  });

  it("quattro passi e progresso fatto/da fare", () => {
    const steps = sportelloSteps(bando());
    expect(steps.map((s) => s.n)).toEqual([1, 2, 3, 4]);
    const store: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
    };
    expect(nextSportelloStep(steps, readSportelloProgress("sp-1", storage))).toBe("official");
    writeSportelloProgress("sp-1", { official: true }, storage);
    expect(nextSportelloStep(steps, readSportelloProgress("sp-1", storage))).toBe("dossier");
  });
});

describe("riconoscimento sportello", () => {
  it("flag o stato SPORTELLO bastano", () => {
    expect(isSportello({ verification_status: "SPORTELLO" })).toBe(true);
    expect(isSportello({ sportello: true })).toBe(true);
  });

  it("frase ufficiale + data vuota è sportello; data vuota da sola no", () => {
    expect(
      hasOfficialSportelloSentence({
        descrizione: "Presentazione a sportello fino ad esaurimento fondi",
      }),
    ).toBe(true);
    expect(
      isSportello({
        descrizione: "Presentazione a sportello fino ad esaurimento fondi",
        scadenza: undefined,
      }),
    ).toBe(true);
    expect(isSportello({ descrizione: "Contributo a fondo perduto", scadenza: undefined })).toBe(
      false,
    );
    expect(
      isSportello({
        descrizione: "a sportello fino a esaurimento fondi",
        scadenza: "2026-12-31",
      }),
    ).toBe(false);
  });
});

describe("fascia vetrina sportello", () => {
  it("sportello ufficiale resta in alta priorità anche senza importo", () => {
    const gap = bando({
      scadenza: undefined,
      importo_max: undefined,
      aid_intensity_percent: undefined,
      eligible_expenses: [],
    });
    expect(isHighPriorityFeed(gap, NOW)).toBe(true);
  });

  it("senza data e senza sportello resta da verificare", () => {
    expect(
      isHighPriorityFeed(
        bando({
          verification_status: "DA_VERIFICARE",
          sportello: false,
          scadenza: undefined,
          apertura: undefined,
          descrizione: "Contributo a fondo perduto",
        }),
        NOW,
      ),
    ).toBe(false);
  });
});
