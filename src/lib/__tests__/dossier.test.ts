import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Bando, CompanyProfile } from "@/lib/bandocore-types";
import {
  ALLOWED_PROFILE_FIELDS,
  DOSSIER_DISCLAIMER,
  buildDossier,
  missingOfficialData,
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

  it("genera una checklist documenti marcata come suggerita", () => {
    const d = buildDossier(bando, profile, NOW);
    const labels = d.documents.map((doc) => doc.label);
    expect(labels).toContain("Visura camerale aggiornata");
    expect(labels).toContain("DURC in corso di validità");
    expect(labels).toContain("Dichiarazione de minimis / aiuti di Stato ricevuti");
    expect(labels).toContain("Modulistica ufficiale compilata");
    const text = renderDossierText(d);
    expect(text).toContain("CHECKLIST DOCUMENTI (suggerita / da verificare)");
    expect(text).toContain("non sostituisce l'elenco ufficiale del bando");
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
    expect(card).toContain("Genera dossier parziale");
  });
});