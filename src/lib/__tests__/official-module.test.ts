import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import type { Bando, CompanyProfile, PdfFieldMapping } from "@/lib/bandocore-types";
import { DOSSIER_DISCLAIMER } from "@/lib/dossier";
import {
  classifyFetchedDocument,
  classifyModulisticaHint,
  countRealApplyLinks,
  DRAFT_DISCLAIMER,
  fetchOfficialDocument,
  hasOfficialModulistica,
  isPublicHttpsUrl,
  matchOfficialFieldTarget,
  planOfficialPdfFill,
  realApplicationUrl,
  renderOfficialModuleText,
  resolveModulisticaFetchTarget,
} from "@/lib/official-module";
import { fillOfficialPdf, inspectOfficialPdf } from "@/lib/official-module-pdf";

const PAGE = readFileSync("src/routes/_authenticated/bando.$id.tsx", "utf8");

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
  imprenditoria_femminile: false,
  email_referente: "mario@acme.it",
  telefono: "0490000000",
  pec: "acme@pec.it",
} as unknown as CompanyProfile;

const htmlBando = {
  id: "b-html",
  titolo: "Nuove imprese a tasso zero",
  ente: "Invitalia",
  modulistica_url: "https://www.invitalia.it/incentivi-e-strumenti/ON-nuove-imprese-tasso-zero",
} as unknown as Bando;

const LIVE_HTML_URLS = [
  "https://www.invitalia.it/incentivi-e-strumenti/contratto-di-sviluppo",
  "https://www.invitalia.it/incentivi-e-strumenti/ON-nuove-imprese-tasso-zero",
  "https://www.pariopportunita.gov.it/it/politiche-e-attivita/parita-di-genere-ed-empowerment-femminile/sostegno-allimprenditoria-femminile/",
  "https://www.gse.it/",
  "https://politichegiovanili.gov.it/politiche-giovanili/avvisi-pubblici-e-progetti-di-politiche-giovanili/bando-fermenti/modulistica",
];

async function makeFillablePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  const form = doc.getForm();
  form.createTextField("RagioneSociale");
  form.createTextField("Partita_IVA");
  form.createTextField("CampoSconosciuto");
  form.createTextField("Firma");
  form.createTextField("Email");
  form.createTextField("DichiarazioneSostitutiva");
  form.createTextField("Data");
  form.createTextField("ImportoRichiesto");
  return doc.save();
}

describe("modulistica ufficiale: assenza URL", () => {
  it("non inventa un modulo da official_url", () => {
    const bando = {
      titolo: "X",
      ente: "Y",
      official_url: "https://www.gse.it/",
      notice_url: "https://www.gse.it/",
      piattaforma_url: "https://www.gse.it/",
    } as Bando;
    expect(hasOfficialModulistica(bando)).toBe(false);
    expect(realApplicationUrl(bando)).toBeUndefined();
    expect(classifyModulisticaHint(undefined)).toBe("missing");
    expect(resolveModulisticaFetchTarget(bando)).toEqual({ ok: false, kind: "missing" });
    expect(PAGE).toContain("officialModuleHref ?");
    expect(PAGE).not.toMatch(/safeOfficialHref\(bando\.official_url, "platform"\)/);
    expect(PAGE).not.toMatch(/pdf_field_mapping\?\.length \?\s*\n\s*<div className="mt-8 rounded-xl border border-primary/);
  });

  it("mostra il blocco se c'è solo application_url", () => {
    const bando = {
      official_url: "https://www.gse.it/",
      application_url: "https://portale.gse.it/domanda",
    } as Bando;
    expect(hasOfficialModulistica(bando)).toBe(true);
    expect(realApplicationUrl(bando)).toBe("https://portale.gse.it/domanda");
    expect(resolveModulisticaFetchTarget(bando)).toEqual({
      ok: true,
      url: "https://portale.gse.it/domanda",
    });
  });
});

describe("canali apply sui 74 live", () => {
  it("conta solo forms/application veri: sui 74 restano 63–68 dossier-only", () => {
    const withFormsOnly = Array.from({ length: 5 }, () => ({
      modulistica_url: "https://ente.it/moduli",
      official_url: "https://ente.it/",
    }));
    const withApplyOnly = Array.from({ length: 6 }, () => ({
      application_url: "https://ente.it/domanda",
      official_url: "https://ente.it/",
    }));
    const rest = Array.from({ length: 63 }, () => ({ official_url: "https://ente.it/" }));
    const disjoint = countRealApplyLinks([...withFormsOnly, ...withApplyOnly, ...rest]);
    expect(disjoint).toMatchObject({ total: 74, withForms: 5, withApply: 6, withEither: 11, dossierOnly: 63 });

    const overlap = countRealApplyLinks([
      ...Array.from({ length: 5 }, () => ({
        modulistica_url: "https://ente.it/moduli",
        application_url: "https://ente.it/domanda",
        official_url: "https://ente.it/",
      })),
      ...Array.from({ length: 1 }, () => ({
        application_url: "https://ente.it/domanda",
        official_url: "https://ente.it/",
      })),
      ...Array.from({ length: 68 }, () => ({ official_url: "https://ente.it/" })),
    ]);
    expect(overlap).toMatchObject({ total: 74, withForms: 5, withApply: 6, withEither: 6, dossierOnly: 68 });
  });
});

describe("modulistica ufficiale: URL HTML", () => {
  it("tratta i 5 URL live come pagine da aprire, non come PDF compilabili", () => {
    for (const url of LIVE_HTML_URLS) {
      expect(classifyModulisticaHint(url)).toBe("likely_html");
    }
    expect(hasOfficialModulistica(htmlBando)).toBe(true);
    const text = renderOfficialModuleText(htmlBando, profile);
    expect(text).toContain("Campi da inserire nel modulo ufficiale");
    expect(text).toContain(htmlBando.modulistica_url);
    expect(PAGE).toContain("non compila e non invia nulla sul portale");
    expect(PAGE).not.toMatch(/solo firma/i);
    expect(PAGE).not.toContain("Attiva Istruttoria");
  });

  it("classifica un body HTML senza pretendere un fill", () => {
    const html = new TextEncoder().encode("<!doctype html><html><body>portale</body></html>");
    expect(classifyFetchedDocument("text/html; charset=utf-8", html)).toBe("html");
  });
});

describe("modulistica ufficiale: PDF compilabile", () => {
  it("precompila solo i campi con etichetta chiara e lascia vuoti gli altri", async () => {
    const bytes = await makeFillablePdf();
    const inspected = await inspectOfficialPdf(bytes);
    expect(inspected.fillable).toBe(true);
    expect(inspected.fields.map((f) => f.name)).toContain("RagioneSociale");

    const plan = planOfficialPdfFill({ fields: inspected.fields, profile });
    const filledNames = plan.fills.map((f) => f.fieldName).sort();
    expect(filledNames).toEqual(["Partita_IVA", "RagioneSociale"]);
    expect(plan.fills.find((f) => f.fieldName === "RagioneSociale")?.value).toBe("Acme SRL");
    expect(plan.leftEmpty.map((f) => f.fieldName)).toEqual(
      expect.arrayContaining(["CampoSconosciuto", "Firma", "Email", "DichiarazioneSostitutiva", "Data", "ImportoRichiesto"]),
    );

    const out = await fillOfficialPdf(bytes, plan);
    const again = await PDFDocument.load(out);
    const form = again.getForm();
    expect(form.getTextField("RagioneSociale").getText()).toBe("Acme SRL");
    expect(form.getTextField("Partita_IVA").getText()).toBe("01234567890");
    expect(form.getTextField("CampoSconosciuto").getText() || "").toBe("");
    expect(form.getTextField("Firma").getText() || "").toBe("");
    expect(form.getTextField("Email").getText() || "").toBe("");
    expect(form.getTextField("DichiarazioneSostitutiva").getText() || "").toBe("");
    expect(form.getTextField("Data").getText() || "").toBe("");
    expect(form.getTextField("ImportoRichiesto").getText() || "").toBe("");
  });

  it("riconosce i nomi AcroForm nidificati della PA", () => {
    expect(matchOfficialFieldTarget("topmostSubform[0].Page1[0].RagioneSociale[0]")).toEqual({
      kind: "profile",
      field: "ragione_sociale",
    });
    expect(matchOfficialFieldTarget("txtPartitaIVA")).toEqual({ kind: "profile", field: "partita_iva" });
  });

  it("ignora mappature su firma e data odierna", () => {
    const mapping: PdfFieldMapping[] = [
      { pdf_label: "Firma", profile_field: "firma" },
      { pdf_label: "Data", profile_field: "data_odierna" },
      { pdf_label: "RagioneSociale", profile_field: "ragione_sociale" },
    ];
    const plan = planOfficialPdfFill({
      fields: [
        { name: "Firma", type: "text" },
        { name: "Data", type: "text" },
        { name: "RagioneSociale", type: "text" },
      ],
      profile,
      mapping,
    });
    expect(plan.fills.map((f) => f.fieldName)).toEqual(["RagioneSociale"]);
    expect(plan.leftEmpty.map((f) => f.fieldName)).toEqual(["Firma", "Data"]);
  });
});

describe("modulistica ufficiale: privacy e disclaimer", () => {
  it("esclude email, telefono e PEC dal payload del modulo", () => {
    const text = renderOfficialModuleText(htmlBando, profile);
    expect(text).not.toContain("mario@acme.it");
    expect(text).not.toContain("0490000000");
    expect(text).not.toContain("acme@pec.it");
    expect(text.toLowerCase()).not.toContain("email_referente");
    expect(PAGE).not.toContain("email_referente");
    expect(matchOfficialFieldTarget("Email")).toBeUndefined();
    expect(matchOfficialFieldTarget("PEC")).toBeUndefined();
    expect(matchOfficialFieldTarget("Telefono")).toBeUndefined();
  });

  it("riporta il disclaimer di bozza non inviata e non pronta alla firma", () => {
    const text = renderOfficialModuleText(htmlBando, profile);
    expect(text).toContain(DRAFT_DISCLAIMER);
    expect(text).toContain("bozza informativa");
    expect(text.toLowerCase()).toContain("non è una domanda");
    expect(text.toLowerCase()).toContain("non è pronta alla firma");
    expect(PAGE).toContain("BOZZA INFORMATIVA");
    expect(PAGE).toMatch(/dichiarazione sostitutiva/i);
    expect(DOSSIER_DISCLAIMER).toContain("fonte ufficiale");
  });
});

describe("modulistica ufficiale: fetch prudente", () => {
  it("blocca URL non pubblici", () => {
    expect(isPublicHttpsUrl("http://www.invitalia.it/x")).toBe(false);
    expect(isPublicHttpsUrl("https://127.0.0.1/modulo.pdf")).toBe(false);
    expect(isPublicHttpsUrl("https://localhost/modulo.pdf")).toBe(false);
    expect(isPublicHttpsUrl("https://www.invitalia.it/x.pdf")).toBe(true);
  });

  it("riconosce un PDF scaricato e una pagina HTML", async () => {
    const pdf = await makeFillablePdf();
    const pdfRes = await fetchOfficialDocument("https://ente.esempio.it/modulo.pdf", async () => {
      const body = new Uint8Array(pdf.byteLength);
      body.set(pdf);
      return new Response(body, { status: 200, headers: { "content-type": "application/pdf" } });
    });
    expect(pdfRes.kind).toBe("pdf");

    const htmlRes = await fetchOfficialDocument("https://www.invitalia.it/on", async () =>
      new Response("<!doctype html><html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    expect(htmlRes.kind).toBe("html");
  });
});
