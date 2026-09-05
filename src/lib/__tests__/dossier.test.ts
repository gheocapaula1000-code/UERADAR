import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Bando, CompanyProfile } from "@/lib/bandocore-types";
import {
  ALLOWED_PROFILE_FIELDS,
  DOSSIER_DISCLAIMER,
  MISSING_BEFORE_USE_TITLE,
  TRIAL_WATERMARK,
  buildDossier,
  missingOfficialData,
  officialUrl,
  pickAllowedProfile,
  renderDossierText,
} from "@/lib/dossier";
import { dossierPdfModel } from "@/lib/dossier-pdf";

const NOW = Date.parse("2026-01-10T00:00:00.000Z");

const bando = {
  id: "b-1",
  titolo: "Contributi digitalizzazione PMI",
  ente: "Camera di Commercio di Padova",
  descrizione: "Contributi a fondo perduto per progetti di digitalizzazione.",
  categoria: "FONDO_PERDUTO",
  scadenza: "2026-02-10T00:00:00.000Z",
  notice_url: "https://esempio.it/bando",
  official_url: "https://esempio.it/bando",
  modulistica_url: "https://esempio.it/moduli",
  importo_max: 50000,
  verification_status: "VERIFICATO",
  requisiti: ["Sede operativa in provincia", "Iscrizione al registro imprese"],
  evidence: [
    {
      source_url: "https://esempio.it/bando/determina.pdf",
      source_title: "Determina dirigenziale",
      evidence_type: "DETERMINA",
    },
  ],
  match: {
    status: "DA_VERIFICARE",
    score: 62,
    confirmed: ["ATECO ammesso"],
    missing: ["Sede operativa da confermare"],
    blockers: [],
  },
} as unknown as Bando;

const profile = {
  ragione_sociale: "Acme SRL",
  partita_iva: "01234567890",
  forma_giuridica: "SRL",
  codice_ateco: "62.01",
  regione: "Veneto",
  provincia: "PD",
  comune: "Padova",
  anno_costituzione: 2018,
  numero_dipendenti: 8,
  fatturato_annuo: 750000,
  legale_rappresentante: "Mario Rossi",
  email_referente: "mario@acme.it",
  telefono: "0490000000",
  pec: "acme@pec.it",
} as unknown as CompanyProfile;

describe("dossier candidatura", () => {
  it("applica l'allowlist privacy escludendo contatti personali", () => {
    const picked = pickAllowedProfile(profile) as Record<string, unknown>;
    expect(Object.keys(picked).every((k) => (ALLOWED_PROFILE_FIELDS as readonly string[]).includes(k))).toBe(true);
    expect(picked["email_referente"]).toBeUndefined();
    expect(picked["telefono"]).toBeUndefined();
    expect(picked["pec"]).toBeUndefined();
  });

  it("non riporta email, telefono o PEC personali nel testo del dossier", () => {
    const text = renderDossierText(buildDossier(bando, profile, NOW));
    expect(text).not.toContain("mario@acme.it");
    expect(text).not.toContain("0490000000");
    expect(text).not.toContain("acme@pec.it");
  });

  it("è COMPLETO con dati ufficiali e profilo minimi", () => {
    const d = buildDossier(bando, profile, NOW);
    expect(d.readiness).toBe("COMPLETO");
    expect(d.missing_official).toHaveLength(0);
    expect(d.missing_profile).toHaveLength(0);
  });

  it("è PARZIALE e segnala i dati mancanti su opportunità incomplete", () => {
    const partiale = {
      ...bando,
      scadenza: undefined,
      notice_url: undefined,
      official_url: undefined,
    } as unknown as Bando;
    expect(missingOfficialData(partiale, NOW)).toEqual([
      "Data di scadenza",
      "Finestra di presentazione (scadenza, apertura o sportello)",
      "URL della fonte ufficiale (official_url / notice_url)",
    ]);
    const d = buildDossier(partiale, null, NOW);
    expect(d.readiness).toBe("PARZIALE");
    expect(d.missing_profile).toContain("Partita IVA");
    expect(d.missing_before_use.some((m) => m.startsWith("Dato ufficiale mancante"))).toBe(true);
  });

  it("non promuove a COMPLETO un bando PARZIALE anche con scadenza e URL validi", () => {
    for (const stato of ["PARZIALE", "DA_VERIFICARE", undefined]) {
      const b = { ...bando, verification_status: stato } as unknown as Bando;
      const d = buildDossier(b, profile, NOW);
      expect(d.readiness).toBe("PARZIALE");
      expect(d.missing_official.join(" ")).toMatch(/[Vv]erifica/);
      expect(d.missing_before_use.join(" ")).toMatch(/[Vv]erifica/);
    }
  });

  it("richiede almeno un requisito e almeno una evidenza ufficiale", () => {
    const senzaRequisiti = { ...bando, requisiti: [] } as unknown as Bando;
    expect(buildDossier(senzaRequisiti, profile, NOW).readiness).toBe("PARZIALE");
    expect(missingOfficialData(senzaRequisiti, NOW)).toContain("Elenco requisiti del bando");

    const senzaEvidence = { ...bando, evidence: [] } as unknown as Bando;
    expect(buildDossier(senzaEvidence, profile, NOW).readiness).toBe("PARZIALE");
    expect(missingOfficialData(senzaEvidence, NOW)).toContain("Evidenza documentale ufficiale");
  });

  it("non considera application_url/piattaforma_url come fonte ufficiale primaria", () => {
    const soloCanali = {
      ...bando,
      official_url: undefined,
      notice_url: undefined,
      application_url: "https://portale.it/domanda",
      piattaforma_url: "https://portale.it/domanda",
    } as unknown as Bando;
    expect(missingOfficialData(soloCanali, NOW)).toContain(
      "URL della fonte ufficiale (official_url / notice_url)",
    );
    expect(buildDossier(soloCanali, profile, NOW).readiness).toBe("PARZIALE");

    const conOfficial = { ...bando, notice_url: undefined } as unknown as Bando;
    expect(officialUrl(conOfficial)).toBe("https://esempio.it/bando");
  });

  it("un bando scaduto non è mai COMPLETO", () => {
    const scaduto = { ...bando, scadenza: "2025-12-01T00:00:00.000Z" } as unknown as Bando;
    const d = buildDossier(scaduto, profile, NOW);
    expect(d.readiness).toBe("SCADUTO");
    expect(d.missing_official).toContain("Termine di presentazione già superato");
    expect(d.missing_before_use.join(" ")).toContain("Termine di presentazione già superato");
  });

  it("elenca solo allegati citati dal testo ufficiale, senza inventarli", () => {
    const conAllegati = {
      ...bando,
      requisiti: [
        "Sede operativa in provincia",
        "Allegato A - domanda di contributo",
        "Modulo dichiarazione spese",
      ],
    } as unknown as Bando;
    const d = buildDossier(conAllegati, profile, NOW);
    const labels = d.documents.map((doc) => doc.label);
    expect(labels).toEqual(["Allegato A - domanda di contributo", "Modulo dichiarazione spese"]);
    const text = renderDossierText(d);
    expect(text).not.toMatch(/Visura camerale|DURC|de minimis|documento d'identità/i);
    expect(text).not.toContain("suggerita / da verificare");
    expect(text).toContain("ALLEGATI UFFICIALI DEL BANDO");
  });

  it("omette del tutto la checklist documenti quando il bando non pubblica allegati", () => {
    const d = buildDossier(bando, profile, NOW);
    expect(d.documents).toHaveLength(0);
    expect(renderDossierText(d)).not.toContain("ALLEGATI UFFICIALI DEL BANDO");
  });

  it("non mostra «Da verificare» né la completezza del dossier", () => {
    const d = buildDossier(bando, profile, NOW);
    expect(d.compatibility.visible).toBe(false);
    const text = renderDossierText(d);
    expect(text).not.toContain("Da verificare:");
    expect(text).not.toContain("COMPATIBILITÀ PROFILO");
    expect(text).not.toContain("Completezza dossier");
    expect(text).not.toContain("PARZIALE");
    expect(text).not.toContain("dato non disponibile");
    const pdf = dossierPdfModel(d)
      .map((b) => b.text)
      .join("\n");
    expect(pdf).not.toContain("Da verificare:");
    expect(pdf).not.toContain("Compatibilità profilo");
    expect(pdf).not.toContain("Completezza dossier");
  });

  it("stampa la modulistica ufficiale solo se il bando pubblica un URL", () => {
    const con = buildDossier(bando, profile, NOW);
    expect(renderDossierText(con)).toContain("Modulistica ufficiale: https://esempio.it/moduli");
    const senza = buildDossier(
      { ...bando, modulistica_url: undefined } as unknown as Bando,
      profile,
      NOW,
    );
    expect(renderDossierText(senza)).not.toContain("Modulistica ufficiale");
  });


  it("costruisce una timeline che arriva alla scadenza", () => {
    const d = buildDossier(bando, profile, NOW);
    expect(d.timeline.at(-1)?.label).toBe("Scadenza presentazione");
    expect(d.timeline.at(-1)?.note).toContain("giorni residui");
  });

  it("include il disclaimer nel TXT e nel modello PDF", () => {
    const d = buildDossier(bando, profile, NOW);
    expect(renderDossierText(d)).toContain(DOSSIER_DISCLAIMER);
    const pdfText = dossierPdfModel(d)
      .map((b) => b.text)
      .join("\n");
    expect(pdfText).toContain("bozza informativa");
    expect(pdfText.toLowerCase()).toContain("non è una domanda");
    expect(pdfText).toContain("fonte ufficiale");
  });

  it("non espone azioni di invio (mailto/submit) nelle superfici dossier", () => {
    for (const path of [
      "src/routes/_authenticated/bando.$id.tsx",
      "src/components/bandocore/BandoCard.tsx",
    ]) {
      const src = readFileSync(path, "utf8");
      expect(src).not.toContain("mailto:");
      expect(src).not.toMatch(/<form[\s>]/);
      expect(src).not.toMatch(/type="submit"/);
      expect(src).not.toMatch(/invia\s+domanda/i);
    }
  });

  it("mostra nelle card la CTA dossier e lo stato parziale", () => {
    const card = readFileSync("src/components/bandocore/BandoCard.tsx", "utf8");
    expect(card).toContain("Genera dossier candidatura");
    expect(card).toContain("matchPreview");
    expect(card).toContain('to="/bando/$id"');
  });

  it("filigrana la prova nel TXT e nel PDF, e la UI la dichiara prima dell'apertura", () => {
    const d = buildDossier(bando, profile, NOW);
    const text = renderDossierText(d, { watermarked: true });
    expect(text).toContain(TRIAL_WATERMARK);
    const pdf = dossierPdfModel(d, true)
      .map((block) => block.text)
      .join("\n");
    expect(pdf).toContain(TRIAL_WATERMARK);
    const page = readFileSync("src/routes/_authenticated/bando.$id.tsx", "utf8");
    expect(page).toContain("watermarked");
    expect(page).toContain("filigranat");
  });

  it("elenca i dati da completare prima dell'uso su schermo, TXT e PDF", () => {
    const parziale = { ...bando, requisiti: [] } as unknown as Bando;
    const d = buildDossier(parziale, profile, NOW);
    expect(d.missing_before_use.length).toBeGreaterThan(0);
    expect(renderDossierText(d)).toContain(MISSING_BEFORE_USE_TITLE.toUpperCase());
    expect(dossierPdfModel(d).map((b) => b.text).join("\n")).toContain(MISSING_BEFORE_USE_TITLE);
    const page = readFileSync("src/routes/_authenticated/bando.$id.tsx", "utf8");
    expect(page).toContain("MISSING_BEFORE_USE_TITLE");
    expect(page).toContain("Bozza incompleta");
  });

  it("scarta le evidenze senza URL invece di stampare undefined", () => {
    const sporco = {
      ...bando,
      evidence: [
        { source_title: "Senza link", evidence_type: "DETERMINA" },
        { source_url: "  ", source_title: "Vuoto", evidence_type: "DETERMINA" },
        ...(bando.evidence ?? []),
      ],
    } as unknown as Bando;
    const d = buildDossier(sporco, profile, NOW);
    expect(d.evidence).toHaveLength(1);
    expect(renderDossierText(d)).not.toContain("undefined");
  });

  it("usa etichette italiane nel dossier e nella scheda", () => {
    const d = buildDossier(bando, profile, NOW);
    expect(d.cover.some((f) => f.label === "Riferimento / codice programma")).toBe(true);
    const page = readFileSync("src/routes/_authenticated/bando.$id.tsx", "utf8");
    expect(page).not.toContain("Piattaforma di sottomissione");
    expect(page).not.toMatch(/utofill/);
    expect(page).not.toContain('label="Blocker"');
  });

  it("il PDF non riuscito ricade sempre sul TXT, anche offline", () => {
    const page = readFileSync("src/routes/_authenticated/bando.$id.tsx", "utf8");
    const fn = page.slice(page.indexOf("const downloadPdf"), page.indexOf("const instanceText"));
    expect(fn).toContain("downloadDossierTxt()");
    expect(fn).not.toMatch(/onLine === false\s*\)\s*\{\s*toast/);
  });

  it("la modulistica ufficiale è protetta dalla stessa quota del dossier", () => {
    const src = readFileSync("src/lib/official-module.functions.ts", "utf8");
    expect(src).toContain("exportsEnabled");
    expect(src).toContain("consumeQuotaOnce");
    expect(src).toContain('kind: "dossiers"');
  });
});
