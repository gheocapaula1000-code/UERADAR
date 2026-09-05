import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CORE_ATTESTED_SOURCE,
  CORE_OFFICIAL_DOMAINS,
  CORE_SOURCES,
  admitBando,
  admitFeed,
  feedTier,
  sourceForBando,
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

/**
 * official_domain delle trovabandi_sources abilitate su Core.
 * Contratto: ammettere questi host (o un sottodominio), senza inventarne altri.
 */
const LIVE_CORE_OFFICIAL_DOMAINS = [
  "padovanet.it",
  "camcom.it",
  "europa.eu",
  "eurekanetwork.org",
  "bur.regione.emilia-romagna.it",
  "bur.regione.fvg.it",
  "bur.regione.veneto.it",
  "burl.it",
  "regione.abruzzo.it",
  "regione.basilicata.it",
  "regione.calabria.it",
  "regione.campania.it",
  "regione.emilia-romagna.it",
  "regione.fvg.it",
  "regione.lazio.it",
  "regione.liguria.it",
  "regione.lombardia.it",
  "regione.marche.it",
  "regione.molise.it",
  "regione.piemonte.it",
  "regione.puglia.it",
  "regione.sardegna.it",
  "regione.sicilia.it",
  "regione.toscana.it",
  "regione.umbria.it",
  "regione.vda.it",
  "regione.veneto.it",
  "pd.camcom.it",
  "aa.camcom.it",
  "ao.camcom.it",
  "as.camcom.it",
  "bg.camcom.it",
  "bs.camcom.it",
  "cn.camcom.it",
  "cmp.camcom.it",
  "dl.camcom.it",
  "emilia.camcom.it",
  "fera.camcom.it",
  "lg.camcom.it",
  "milomb.camcom.it",
  "mo.camcom.it",
  "pno.camcom.it",
  "pnud.camcom.it",
  "ptpo.camcom.it",
  "romagna.camcom.it",
  "so.camcom.it",
  "tn.camcom.it",
  "tno.camcom.it",
  "to.camcom.it",
  "va.camcom.it",
  "vg.camcom.it",
  "vi.camcom.it",
  "vr.camcom.it",
  "comolecco.camcom.it",
  "bo.camcom.gov.it",
  "fi.camcom.gov.it",
  "ge.camcom.gov.it",
  "rivlig.camcom.gov.it",
  "tb.camcom.gov.it",
  "camcom.bz.it",
  "ag.camcom.it",
  "ba.camcom.it",
  "basilicata.camcom.it",
  "brta.camcom.it",
  "caor.camcom.it",
  "cameracommercio.cl.it",
  "ce.camcom.it",
  "czkrvv.camcom.it",
  "chpe.camcom.it",
  "cs.camcom.gov.it",
  "fg.camcom.it",
  "frlt.camcom.it",
  "cameragransasso.camcom.it",
  "irpiniasannio.camcom.it",
  "le.camcom.it",
  "marche.camcom.it",
  "me.camcom.it",
  "molise.camcom.gov.it",
  "na.camcom.gov.it",
  "nu.camcom.it",
  "paen.camcom.gov.it",
  "rc.camcom.gov.it",
  "rivt.camcom.it",
  "rm.camcom.it",
  "sa.camcom.it",
  "ss.camcom.it",
  "ctrgsr.camcom.gov.it",
  "tp.camcom.it",
  "umbria.camcom.it",
  "bur.regione.marche.it",
  "bur.regione.umbria.it",
  "bura.regione.abruzzo.it",
  "burc.regione.campania.it",
  "burp.regione.puglia.it",
  "buras.regione.sardegna.it",
  "provincia.perugia.it",
  "provincia.benevento.it",
  "provincia.fermo.it",
  "casadivetro.provincia.pu.it",
  "cittametropolitanacagliari.it",
  "provincia.vicenza.it",
  "galcasacastra.it",
  "galcilento.it",
  "sentieridelbuonvivere.it",
  "galpartenio.it",
  "galterraevita.eu",
  "galvesuvioverde.it",
  "inail.it",
  "ice.it",
  "fondimpresa.it",
  "simest.it",
  "gse.it",
  "unioncamere.gov.it",
  "unioncamereveneto.it",
  "agenziaentrate.gov.it",
  "incentivi.gov.it",
  "invitalia.it",
  "italiadomani.gov.it",
  "mimit.gov.it",
  "padigitale2026.gov.it",
  "gazzettaufficiale.it",
  "mase.gov.it",
  "ministeroturismo.gov.it",
  "mur.gov.it",
  "pariopportunita.gov.it",
  "politichecoesione.governo.it",
  "politichegiovanili.gov.it",
  "ec.europa.eu",
  "agriculture.ec.europa.eu",
  "cinea.ec.europa.eu",
  "commission.europa.eu",
  "culture.ec.europa.eu",
  "digital-strategy.ec.europa.eu",
  "eic.ec.europa.eu",
  "eismea.ec.europa.eu",
  "european-social-fund-plus.ec.europa.eu",
  "funding-tenders.ec.europa.eu",
  "interregeurope.eu",
  "research-and-innovation.ec.europa.eu",
  "amministrazionetrasparente.provincia.pc.it",
  "amministrazionetrasparente.provincia.treviso.it",
  "ammtrasp.provincia.livorno.it",
  "at.provincia.brescia.it",
  "cittametropolitana.fi.it",
  "cittametropolitana.mi.it",
  "cittametropolitana.ve.it",
  "dati.cittametropolitana.genova.it",
  "provincia.arezzo.it",
  "provincia.bz.it",
  "provincia.como.it",
  "provincia.cremona.it",
  "provincia.cuneo.it",
  "provincia.imperia.it",
  "provincia.lecco.it",
  "provincia.mantova.it",
  "provincia.padova.it",
  "provincia.pd.it",
  "provincia.ra.it",
  "provincia.savona.it",
  "provincia.tn.it",
  "provinciams.etrasparenza.it",
  "provinciasondrio.it",
  "trasparenza.cittametropolitana.torino.it",
  "trasparenza.provincia.pistoia.it",
  "web.provincia.vr.it",
  "baldolessinia.it",
  "farmaremma.it",
  "gal-start.it",
  "galadige.it",
  "galaltamarca.tv.it",
  "galaltobellunese.com",
  "galaretino.it",
  "galdeltapo.it",
  "galpatavino.it",
  "galprealpidolomiti.it",
  "galterretrusche.com",
  "leadersiena.it",
  "montagnappennino.it",
  "montagnavicentina.com",
  "sviluppolunigiana.it",
  "vegal.net",
] as const;

function coveredByLiveCatalog(host: string): boolean {
  return LIVE_CORE_OFFICIAL_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
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
      "bur",
      "regionale",
      "nazionale",
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

  it("ammette ogni official_domain live Core e i sottodomini, senza inventare siti", () => {
    for (const domain of LIVE_CORE_OFFICIAL_DOMAINS) {
      expect(sourceForUrl(`https://${domain}/bando`), domain).not.toBeNull();
      expect(sourceForUrl(`https://www.${domain}/bando`), `www.${domain}`).not.toBeNull();
    }
    for (const host of CORE_OFFICIAL_DOMAINS) {
      expect(coveredByLiveCatalog(host), host).toBe(true);
    }
    expect(sourceForUrl("https://comune.milano.it/albo")).toBeNull();
    expect(sourceForUrl("https://comune.firenze.it/albo")).toBeNull();
    expect(sourceForUrl("https://random-bandi.example.com/x")).toBeNull();
  });

  it("ammette i nuovi official_domain Core (camere, BUR, province, GAL, nazionali)", () => {
    expect(sourceForUrl("https://www.cs.camcom.gov.it/bando")?.id).toBe("cciaa");
    expect(sourceForUrl("https://www.cameracommercio.cl.it/bando")?.id).toBe("cciaa");
    expect(sourceForUrl("https://www.na.camcom.gov.it/bando")?.id).toBe("cciaa");
    expect(sourceForUrl("https://bur.regione.marche.it/bando")?.id).toBe("bur");
    expect(sourceForUrl("https://bura.regione.abruzzo.it/bando")?.id).toBe("bur");
    expect(sourceForUrl("https://www.provincia.perugia.it/bando")?.id).toBe("provincia");
    expect(sourceForUrl("https://www.cittametropolitanacagliari.it/bando")?.id).toBe("provincia");
    expect(sourceForUrl("https://www.galcilento.it/bando")?.id).toBe("gal");
    expect(sourceForUrl("https://www.inail.it/bando")?.id).toBe("nazionale");
    expect(sourceForUrl("https://www.gse.it/bando")?.id).toBe("nazionale");
  });

  it("Core official_source attesta un host non ancora nel catalogo locale", () => {
    const futureOfficial = {
      official_url: "https://nuova-fonte.core-catalog.test/bando",
      official_source: true,
    };
    expect(sourceForUrl(futureOfficial.official_url)).toBeNull();
    expect(sourceForBando(futureOfficial)?.id).toBe("core");
    expect(sourceForBando({ official_url: futureOfficial.official_url })).toBeNull();
    expect(CORE_ATTESTED_SOURCE.hosts).toEqual([]);
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
    expect(admitBando(bando({ scadenza: undefined, apertura: "2026-10-01" }), NOW)).toMatchObject({
      ok: true,
    });
  });

  it("scarta scadenza passata", () => {
    expect(admitBando(bando({ scadenza: "2026-01-01" }), NOW)).toMatchObject({
      ok: false,
      reason: "DEADLINE_PAST",
    });
  });

  it("accetta intensita aiuto o spese ammissibili come dato economico", () => {
    expect(
      admitBando(bando({ importo_max: undefined, aid_intensity_percent: 40 }), NOW),
    ).toMatchObject({ ok: true });
    expect(
      admitBando(bando({ importo_max: undefined, eligible_expenses: ["Macchinari"] }), NOW),
    ).toMatchObject({ ok: true });
  });

  it("ammette schede solide comunali, camerali e provinciali", () => {
    expect(
      admitBando(
        bando({
          scope: "COMUNALE",
          ente: "Comune di Padova",
          official_url: "https://www.padovanet.it/bando",
        }),
        NOW,
      ),
    ).toMatchObject({ ok: true });
    expect(
      admitBando(
        bando({
          scope: "CAMERALE",
          ente: "CCIAA Padova",
          official_url: "https://www.pd.camcom.it/bando",
        }),
        NOW,
      ),
    ).toMatchObject({ ok: true });
    expect(
      admitBando(
        bando({
          scope: "REGIONALE",
          ente: "Provincia di Padova",
          official_url: "https://www.provincia.pd.it/bando",
        }),
        NOW,
      ),
    ).toMatchObject({ ok: true });
  });

  it("ammette Camera toscana, BUR, provincia e GAL già in Core", () => {
    expect(
      admitBando(
        bando({
          scope: "CAMERALE",
          ente: "Camera di Commercio di Firenze",
          official_url: "https://www.fi.camcom.gov.it/bandi/1",
        }),
        NOW,
      ),
    ).toMatchObject({ ok: true });
    expect(sourceForUrl("https://www.ptpo.camcom.it/bando")?.id).toBe("cciaa");
    expect(
      admitBando(
        bando({
          scope: "REGIONALE",
          ente: "Regione Emilia-Romagna",
          official_url: "https://bur.regione.emilia-romagna.it/bur/dettaglio/1",
        }),
        NOW,
      ),
    ).toMatchObject({ ok: true });
    expect(
      admitBando(
        bando({
          scope: "REGIONALE",
          ente: "Provincia di Arezzo",
          official_url: "https://www.provincia.arezzo.it/bando",
        }),
        NOW,
      ),
    ).toMatchObject({ ok: true });
    expect(
      admitBando(
        bando({
          scope: "COMUNALE",
          ente: "GAL Far Maremma",
          official_url: "https://www.farmaremma.it/bando",
        }),
        NOW,
      ),
    ).toMatchObject({ ok: true });
    expect(
      admitBando(
        bando({ official_url: "https://random-bandi.example.com/x", notice_url: undefined }),
        NOW,
      ),
    ).toMatchObject({ ok: false, reason: "SOURCE_NOT_CORE" });
  });

  it("ammette Camera, BUR, provincia, GAL e nazionali del catalogo 186", () => {
    expect(
      admitBando(
        bando({
          scope: "CAMERALE",
          ente: "Camera di Commercio di Cosenza",
          official_url: "https://www.cs.camcom.gov.it/bandi/1",
        }),
        NOW,
      ),
    ).toMatchObject({ ok: true, source: { id: "cciaa" } });
    expect(
      admitBando(
        bando({
          scope: "REGIONALE",
          ente: "Regione Marche",
          official_url: "https://bur.regione.marche.it/bur/dettaglio/1",
        }),
        NOW,
      ),
    ).toMatchObject({ ok: true, source: { id: "bur" } });
    expect(
      admitBando(
        bando({
          scope: "REGIONALE",
          ente: "Provincia di Perugia",
          official_url: "https://www.provincia.perugia.it/bando",
        }),
        NOW,
      ),
    ).toMatchObject({ ok: true, source: { id: "provincia" } });
    expect(
      admitBando(
        bando({
          scope: "COMUNALE",
          ente: "GAL Cilento",
          official_url: "https://www.galcilento.it/bando",
        }),
        NOW,
      ),
    ).toMatchObject({ ok: true, source: { id: "gal" } });
    expect(
      admitBando(
        bando({
          scope: "NAZIONALE",
          ente: "INAIL",
          official_url: "https://www.inail.it/bandi/1",
        }),
        NOW,
      ),
    ).toMatchObject({ ok: true, source: { id: "nazionale" } });
  });

  it("ammette official_source Core anche se l'host non è nel catalogo locale", () => {
    expect(
      admitBando(
        bando({
          official_url: "https://nuova-fonte.core-catalog.test/bando",
          notice_url: undefined,
          official_source: true,
        }),
        NOW,
      ),
    ).toMatchObject({ ok: true, source: { id: "core" } });
    expect(
      admitBando(
        bando({
          official_url: "https://nuova-fonte.core-catalog.test/bando",
          notice_url: undefined,
        }),
        NOW,
      ),
    ).toMatchObject({ ok: false, reason: "SOURCE_NOT_CORE" });
  });

  it("scarta fonti fuori registro", () => {
    expect(
      admitBando(bando({ official_url: "https://example.com/x", notice_url: undefined }), NOW),
    ).toMatchObject({
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
      admitBando(bando({ scadenza: undefined, apertura: undefined, importo_max: undefined }), NOW),
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
    expect(report.attested_hosts).toEqual([]);
  });

  it("conteggia le schede attestate da Core tra le fonti attive", () => {
    const report = admitFeed(
      [
        bando({ id: "1" }),
        bando({
          id: "2",
          official_url: "https://nuova-fonte.core-catalog.test/bando",
          notice_url: undefined,
          official_source: true,
        }),
      ],
      NOW,
    );
    expect(report.admitted_count).toBe(2);
    expect(report.active_sources.map((s) => s.id)).toEqual(["veneto", "core"]);
    expect(report.attested_hosts).toEqual(["nuova-fonte.core-catalog.test"]);
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
    expect(
      feedTier(bando({ match: strong(), importo_max: undefined, eligible_expenses: [] }), NOW),
    ).toBe("DA_VERIFICARE");
    expect(
      feedTier(bando({ match: strong(), scadenza: undefined, apertura: undefined }), NOW),
    ).toBe("DA_VERIFICARE");
    expect(feedTier(bando({ scadenza: undefined, apertura: undefined }), NOW)).toBe(
      "DA_VERIFICARE",
    );
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

  it("importo Postgres stringa conta come dato economico, senza inventare", () => {
    expect(feedTier(bando({ importo_max: "150000.00" as unknown as number }), NOW)).toBe(
      "ALTA_PRIORITA",
    );
    expect(
      feedTier(bando({ importo_max: "no" as unknown as number, eligible_expenses: [] }), NOW),
    ).toBe("DA_VERIFICARE");
  });

  it("sportello senza scadenza non è un buco di data", () => {
    expect(
      feedTier(
        bando({ scadenza: undefined, apertura: undefined, verification_status: "SPORTELLO" }),
        NOW,
      ),
    ).toBe("ALTA_PRIORITA");
    expect(
      feedTier(
        bando({
          scadenza: undefined,
          apertura: undefined,
          sportello: true,
          titolo: "Contributo a sportello PMI",
        }),
        NOW,
      ),
    ).toBe("ALTA_PRIORITA");
  });

  it("la UI non usa slogan Scheda incompleta / Da verificare come fascia", () => {
    const dashboard = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
    const card = readFileSync("src/components/bandocore/BandoCard.tsx", "utf8");
    const scheda = readFileSync("src/routes/_authenticated/bando.$id.tsx", "utf8");
    expect(dashboard).not.toContain("Scheda incompleta");
    expect(dashboard).not.toContain("incompleteFieldsHeading");
    expect(dashboard).not.toContain("{reviewHeading}");
    expect(dashboard).not.toContain("Nessuna scheda incompleta");
    expect(dashboard).not.toContain("Nessuna scheda da verificare");
    expect(dashboard).not.toMatch(/segnalate come «Da verificare»/);
    expect(card).not.toContain("INCOMPLETE_FIELDS_HEADING");
    expect(card).not.toContain("Scheda incompleta");
    expect(card).not.toMatch(/<p className="font-semibold">Da verificare<\/p>/);
    expect(card).not.toContain("MATCH_UNKNOWN_PROFILE_LABEL");
    expect(card).not.toContain("showUnknownAteco");
    expect(scheda).not.toContain("Dati incompleti");
    expect(scheda).not.toContain("Scheda incompleta");
    expect(dashboard).toContain("nessuna data e nessun importo viene stimato");
  });
});
