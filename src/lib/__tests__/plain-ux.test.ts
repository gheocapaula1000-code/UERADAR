import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CATALOG_LIMIT } from "../../../supabase/functions/_shared/trovabandi-feed-request.ts";
import type { Bando } from "../bandocore-types";
import {
  BACK_TO_LIST_LABEL,
  CATALOG_SWITCH_HINT,
  CATALOG_SWITCH_LABEL,
  OPEN_CARD_LABEL,
  OPEN_OFFICIAL_LABEL,
  PROFILE_SWITCH_HINT,
  PROFILE_SWITCH_LABEL,
  RESET_FILTERS_LABEL,
  RETRY_LABEL,
  SHOW_CATALOG_LABEL,
  VERIFY_OK_LABEL,
  VERIFY_PARTIAL_LABEL,
  VERIFY_PARTIAL_MEANING,
  VERIFY_PARTIAL_NOT_INELIGIBLE,
  cardPrimaryAction,
  catalogEmptyCopy,
  fetchErrorCopy,
  filtersEmptyCopy,
  homeFlashEmpty,
  homeListEmpty,
  lastKnownCountMessage,
  mayShowOfficialCompatible,
  profileEmptyCopy,
  publicVerifyStatus,
  readLastFeedCount,
  safePublicHref,
  saveLastFeedCount,
} from "../plain-ux";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

function bando(over: Partial<Bando> = {}): Bando {
  return {
    id: "b1",
    titolo: "Bando test",
    ente: "Ente",
    descrizione: "Descrizione",
    categoria: "FONDO_PERDUTO",
    scope: "REGIONALE",
    ...over,
  } as Bando;
}

describe("stato pubblico della card: solo data e importo ufficiali", () => {
  it("è Verificato solo con scadenza e importo massimo ufficiali", () => {
    expect(publicVerifyStatus({ scadenza: "2026-10-01", importo_max: 10_000 })).toBe("VERIFICATO");
    expect(publicVerifyStatus({ scadenza: "2026-10-01" })).toBe("DA_VERIFICARE");
    expect(publicVerifyStatus({ importo_max: 10_000 })).toBe("DA_VERIFICARE");
    expect(publicVerifyStatus({ scadenza: "  ", importo_max: 0 })).toBe("DA_VERIFICARE");
    expect(publicVerifyStatus({})).toBe("DA_VERIFICARE");
  });

  it("non inventa Compatibile e non usa il match come stato della card", () => {
    expect(mayShowOfficialCompatible(undefined)).toBe(false);
    expect(
      mayShowOfficialCompatible({
        status: "DA_VERIFICARE",
        score: 10,
        confirmed: [],
        missing: [],
        blockers: [],
      }),
    ).toBe(false);
    expect(
      mayShowOfficialCompatible({
        status: "NON_COMPATIBILE",
        score: 0,
        confirmed: [],
        missing: [],
        blockers: [],
      }),
    ).toBe(false);
    expect(
      mayShowOfficialCompatible({
        status: "COMPATIBILE",
        score: 80,
        confirmed: ["ATECO"],
        missing: [],
        blockers: [],
      }),
    ).toBe(true);
  });

  it("sulle schede parziali il tap principale è il bando ufficiale, se c'è", () => {
    const withUrl = cardPrimaryAction(
      bando({ official_url: "https://ente.gov.it/bando", scadenza: undefined }),
    );
    expect(withUrl).toEqual({
      kind: "official",
      label: OPEN_OFFICIAL_LABEL,
      href: "https://ente.gov.it/bando",
    });
    const complete = cardPrimaryAction(
      bando({
        official_url: "https://ente.gov.it/bando",
        scadenza: "2026-10-01",
        importo_max: 5_000,
      }),
    );
    expect(complete).toEqual({ kind: "detail", label: OPEN_CARD_LABEL, href: null });
    const noUrl = cardPrimaryAction(bando({ scadenza: undefined }));
    expect(noUrl).toEqual({ kind: "detail", label: OPEN_CARD_LABEL, href: null });
    expect(safePublicHref("https://ente.gov.it/bando")).toBe("https://ente.gov.it/bando");
    expect(safePublicHref("javascript:alert(1)")).toBeNull();
    expect(safePublicHref("/relativo")).toBeNull();
  });
});

describe("stati vuoti Home: un motivo, un tap", () => {
  it("in errore mostra Riprova e l'ultimo conteggio noto, mai uno zero muto", () => {
    const copy = homeListEmpty({
      fetchFailed: true,
      lastKnownCount: 128,
      bandiCount: 0,
      filteredCount: 0,
      activeFilters: 0,
      homeView: "catalog",
    });
    expect(copy?.actionKind).toBe("retry");
    expect(copy?.actionLabel).toBe(RETRY_LABEL);
    expect(copy?.lastKnownCount).toBe(128);
    expect(copy?.body).toContain("128");
    expect(copy?.title).not.toMatch(/0/);
    expect(lastKnownCountMessage(null)).toBe("Non abbiamo un elenco salvato.");
    expect(fetchErrorCopy(null).body).toContain("Riprova");
  });

  it("filtri a zero → Azzera filtri, anche in vista impresa", () => {
    const copy = homeListEmpty({
      fetchFailed: false,
      bandiCount: 40,
      filteredCount: 0,
      activeFilters: 2,
      homeView: "profile",
    });
    expect(copy).toEqual(filtersEmptyCopy());
    expect(copy?.actionLabel).toBe(RESET_FILTERS_LABEL);
  });

  it("vista impresa vuota senza filtri → Vedi tutti i bandi", () => {
    const copy = homeListEmpty({
      fetchFailed: false,
      bandiCount: 0,
      filteredCount: 0,
      activeFilters: 0,
      homeView: "profile",
    });
    expect(copy).toEqual(profileEmptyCopy());
    expect(copy?.actionLabel).toBe(SHOW_CATALOG_LABEL);
    expect(copy?.body.toLowerCase()).toContain("ateco");
    expect(copy?.body).not.toMatch(/non sei compatibile/i);
  });

  it("catalogo vuoto dopo un aggiornamento riuscito → Riprova", () => {
    const copy = homeListEmpty({
      fetchFailed: false,
      bandiCount: 0,
      filteredCount: 0,
      activeFilters: 0,
      homeView: "catalog",
    });
    expect(copy).toEqual(catalogEmptyCopy());
    expect(copy?.actionLabel).toBe(RETRY_LABEL);
  });

  it("con risultati non mostra uno stato vuoto", () => {
    expect(
      homeListEmpty({
        fetchFailed: false,
        bandiCount: 10,
        filteredCount: 3,
        activeFilters: 1,
        homeView: "catalog",
      }),
    ).toBeNull();
  });

  it("flash vuoto con elenco sotto invita a scorrere, non è un vicolo cieco", () => {
    const copy = homeFlashEmpty({
      fetchFailed: false,
      flashCount: 0,
      listHasItems: true,
    });
    expect(copy?.actionKind).toBe("show-catalog");
    expect(homeFlashEmpty({ fetchFailed: false, flashCount: 0, listHasItems: false })).toBeNull();
    expect(
      homeFlashEmpty({ fetchFailed: true, lastKnownCount: 9, flashCount: 0, listHasItems: false })
        ?.actionKind,
    ).toBe("retry");
  });
});

describe("ultimo conteggio noto", () => {
  it("salva catalogo e profilo su chiavi separate e sopravvive a una rilettura", () => {
    const storage = memory();
    saveLastFeedCount("catalog", 40, storage);
    saveLastFeedCount("profile", 3, storage);
    expect(readLastFeedCount("catalog", storage)).toBe(40);
    expect(readLastFeedCount("profile", storage)).toBe(3);
  });

  it("storage assente o rotto non blocca", () => {
    expect(readLastFeedCount("catalog", null)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveLastFeedCount("catalog", 2, broken)).not.toThrow();
    expect(readLastFeedCount("catalog", broken)).toBeNull();
  });
});

describe("Home, card e dettaglio usano il copy per non esperti", () => {
  const dashboard = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
  const card = readFileSync("src/components/bandocore/BandoCard.tsx", "utf8");
  const detail = readFileSync("src/routes/_authenticated/bando.$id.tsx", "utf8");

  it("la Home ha interruttore in parole piane e stati vuoti con un tap", () => {
    expect(dashboard).toContain("CATALOG_SWITCH_LABEL");
    expect(dashboard).toContain("PROFILE_SWITCH_LABEL");
    expect(dashboard).toContain("CATALOG_SWITCH_HINT");
    expect(dashboard).toContain("PROFILE_SWITCH_HINT");
    expect(dashboard).toContain("homeListEmpty");
    expect(dashboard).toContain("homeFlashEmpty");
    expect(dashboard).toContain("fetchErrorCopy");
    expect(dashboard).toContain("saveLastFeedCount");
    expect(dashboard).toContain("readLastFeedCount");
    expect(dashboard).toContain("query.refetch");
    expect(dashboard).not.toContain("non sei compatibile");
    expect(CATALOG_SWITCH_LABEL).toBe("Catalogo");
    expect(PROFILE_SWITCH_LABEL).toBe("Per la mia impresa");
    expect(CATALOG_SWITCH_HINT).toContain("bandi ufficiali aperti");
    expect(PROFILE_SWITCH_HINT).toContain("ATECO");
  });

  it("card e dettaglio spiegano Da verificare e aprono il testo ufficiale", () => {
    expect(card).toContain("VERIFY_PARTIAL_MEANING");
    expect(card).toContain("cardPrimaryAction");
    expect(card).toContain("OPEN_OFFICIAL_LABEL");
    expect(card).not.toContain("Non compatibile");
    expect(card).not.toContain("non sei compatibile");
    expect(card).not.toContain("Genera dossier parziale");
    expect(detail).toContain("VERIFY_PARTIAL_MEANING");
    expect(detail).toContain("OPEN_OFFICIAL_LABEL");
    expect(detail).toContain("VERIFY_PARTIAL_NOT_INELIGIBLE");
    expect(detail).not.toContain("Non compatibile con il tuo profilo");
    expect(detail).not.toContain("non sei compatibile");
    expect(VERIFY_PARTIAL_MEANING).toBe("Mancano ancora data o importo sul testo ufficiale.");
    expect(VERIFY_OK_LABEL).toBe("Verificato");
    expect(VERIFY_PARTIAL_LABEL).toBe("Da verificare");
    expect(VERIFY_PARTIAL_NOT_INELIGIBLE).toContain("Non vuol dire");
    expect(OPEN_OFFICIAL_LABEL).toBe("Apri il bando ufficiale");
    expect(BACK_TO_LIST_LABEL).toBe("Torna ai bandi");
  });

  it("non tocca il tetto catalogo 5000 e non aggiunge badge Compatibile finti", () => {
    expect(CATALOG_LIMIT).toBe(5000);
    expect(card).not.toContain('status: "COMPATIBILE"');
    expect(card).toContain("mayShowOfficialCompatible");
    expect(dashboard).toContain('homeView === "catalog"');
    expect(dashboard).toContain('homeView === "profile"');
  });
});
