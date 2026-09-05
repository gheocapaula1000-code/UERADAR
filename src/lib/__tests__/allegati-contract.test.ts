import { describe, expect, it } from "vitest";
import {
  sanitizeAllegati,
  sanitizeFeedResponse,
} from "../../../supabase/functions/_shared/trovabandi-contract";
import { buildDossier, hasOfficialChannel, missingOfficialData, officialAttachments } from "../dossier";
import type { Bando } from "../bandocore-types";

const baseRow = {
  id: "b1",
  title: "Bando test",
  authority_name: "Regione Veneto",
  authority_level: "REGIONALE",
  category: "FONDO_PERDUTO",
  summary: "Sintesi ufficiale",
  official_url: "https://bandi.regione.veneto.it/x",
};

describe("contratto allegati", () => {
  it("tiene solo gli allegati ben formati", () => {
    const out = sanitizeAllegati([
      { nome: "  Modulo A  ", url: "https://ente.it/a.pdf", obbligatorio: true },
      { nome: "Allegato B" },
      { nome: "", obbligatorio: true },
      { nome: "Con url finto", url: "javascript:alert(1)" },
      "stringa",
      null,
    ]);
    expect(out).toEqual([
      { nome: "Modulo A", obbligatorio: true, url: "https://ente.it/a.pdf" },
      { nome: "Allegato B", obbligatorio: false },
      { nome: "Con url finto", obbligatorio: false },
    ]);
  });

  it("limita a 20 allegati e rifiuta nomi troppo lunghi", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ nome: `All ${i}`, obbligatorio: false }));
    expect(sanitizeAllegati(many)).toHaveLength(20);
    expect(sanitizeAllegati([{ nome: "x".repeat(301) }])).toEqual([]);
  });

  it("fail-soft sul campo: allegati malformati non scartano la scheda", () => {
    const result = sanitizeFeedResponse(
      { ok: true, bandi: [{ ...baseRow, allegati: "non-un-array" }] },
      200,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bandi).toHaveLength(1);
    expect(result.bandi[0]!.allegati).toBeUndefined();
  });

  it("propaga gli allegati validi nell'envelope sanificato", () => {
    const result = sanitizeFeedResponse(
      { ok: true, bandi: [{ ...baseRow, allegati: [{ nome: "Modulo 1", obbligatorio: true }] }] },
      200,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bandi[0]!.allegati).toEqual([{ nome: "Modulo 1", obbligatorio: true }]);
  });
});

const bando: Bando = {
  id: "b1",
  titolo: "Bando test",
  ente: "Regione Veneto",
  descrizione: "Sintesi",
  categoria: "FONDO_PERDUTO",
  scope: "REGIONALE",
  official_url: "https://bandi.regione.veneto.it/x",
  scadenza: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  importo_max: 50_000,
  requisiti: ["Modulo di domanda firmato"],
  evidence: [{ source_url: "https://bandi.regione.veneto.it/x", evidence_type: "AVVISO" }],
  verification_status: "VERIFICATO",
  piattaforma_url: "https://bandi.regione.veneto.it/apply",
  allegati: [{ nome: "Allegato A — domanda", url: "https://ente.it/a.pdf", obbligatorio: true }],
};

const profile = {
  ragione_sociale: "Acme Srl",
  partita_iva: "01234567890",
  forma_giuridica: "SRL" as const,
  codice_ateco: "62.01",
  regione: "Veneto",
  provincia: "PD",
  comune: "Padova",
  numero_dipendenti: 4,
  fatturato_annuo: 300_000,
  anno_costituzione: 2015,
  imprenditoria_femminile: false,
  legale_rappresentante: "Mario Rossi",
};

describe("readiness dossier con contratto Core", () => {
  it("elenca gli allegati ufficiali con url e obbligatorietà", () => {
    const docs = officialAttachments(bando);
    expect(docs[0]).toMatchObject({
      label: "Allegato A — domanda",
      url: "https://ente.it/a.pdf",
      obbligatorio: true,
    });
  });

  it("è COMPLETO quando ci sono canale, economici e scadenza", () => {
    expect(hasOfficialChannel(bando)).toBe(true);
    expect(buildDossier(bando, profile).readiness).toBe("COMPLETO");
  });

  it("non è COMPLETO senza canale ufficiale, anche se VERIFICATO", () => {
    const senzaCanale: Bando = { ...bando, piattaforma_url: undefined };
    expect(hasOfficialChannel(senzaCanale)).toBe(false);
    expect(missingOfficialData(senzaCanale)).toContain(
      "Canale ufficiale di presentazione (piattaforma, modulistica o PEC)",
    );
    expect(buildDossier(senzaCanale, profile).readiness).toBe("PARZIALE");
  });

  it("non è COMPLETO senza dato economico ufficiale", () => {
    const senzaImporto: Bando = { ...bando, importo_max: undefined };
    expect(buildDossier(senzaImporto, profile).readiness).toBe("PARZIALE");
  });

  it("non è COMPLETO senza finestra di presentazione", () => {
    const senzaDate: Bando = { ...bando, scadenza: undefined };
    expect(missingOfficialData(senzaDate)).toContain(
      "Finestra di presentazione (scadenza, apertura o sportello)",
    );
  });
});
