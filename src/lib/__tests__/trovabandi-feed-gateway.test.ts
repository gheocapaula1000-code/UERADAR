import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  matchingProfile,
  opportunityIsValid,
  sanitizeFeedResponse,
} from "../../../supabase/functions/_shared/trovabandi-contract.ts";
import {
  mapCoreOpportunity,
  parseGatewayEnvelope,
  parseGatewayFeed,
} from "../proxy-core.server";

const row = {
  id: "a",
  title: "Bando A",
  authority_name: "MIMIT",
  authority_level: "NAZIONALE",
  category: "FONDO_PERDUTO",
  summary: "Sintesi",
  official_url: "https://example.gov.it/a",
  application_url: "https://example.gov.it/a/domanda",
  requirements: ["PMI"],
  eligible_expenses: ["Macchinari"],
  match: {
    status: "COMPATIBILE",
    score: 82,
    confirmed: ["ATECO"],
    missing: [],
    blockers: [],
  },
};
const good = {
  ok: true,
  bandi: [row],
  generated_at: "2026-08-07T08:00:00Z",
  fetched_at: "2026-08-07T08:01:00Z",
};

describe("profilo minimizzato trovabandi-feed", () => {
  it("invia solo campi matching e scarta identificativi e contatti", () => {
    const minimized = matchingProfile({
      user_id: "u",
      ragione_sociale: "ACME Srl",
      partita_iva: "IT123",
      legale_rappresentante: "Mario Rossi",
      email_referente: "mario@example.com",
      telefono: "123",
      pec: "acme@pec.example",
      forma_giuridica: "SRL",
      codice_ateco: "62.01",
      regione: "Lazio",
      provincia: "RM",
      comune: "Roma",
    });
    expect(minimized).toMatchObject({
      forma_giuridica: "SRL",
      codice_ateco: "62.01",
      regione: "Lazio",
    });
    for (const forbidden of [
      "user_id",
      "ragione_sociale",
      "partita_iva",
      "legale_rappresentante",
      "email_referente",
      "telefono",
      "pec",
    ]) expect(minimized).not.toHaveProperty(forbidden);
  });

  it("la Edge usa la funzione condivisa per feed e refresh", () => {
    const src = readFileSync("supabase/functions/trovabandi-feed/index.ts", "utf8");
    expect(src).toContain('from "../_shared/trovabandi-contract.ts"');
    expect(src).toContain("const minimizedProfile = matchingProfile");
    expect(src).toContain('{ profile: minimizedProfile, limit: 250 }');
    expect(src).not.toContain('{ profile, limit: 250 }');
  });
});

describe("contratto upstream rigoroso", () => {
  it("accetta un envelope valido e preserva timestamp e fonte dettaglio", () => {
    const envelope = parseGatewayEnvelope(good);
    expect(envelope?.generated_at).toBe("2026-08-07T08:00:00Z");
    expect(envelope?.fetched_at).toBe("2026-08-07T08:01:00Z");
    const mapped = mapCoreOpportunity(envelope!.bandi[0]);
    expect(mapped.id).toBe("a");
    expect(mapped.notice_url).toBe(row.official_url);
    expect(mapped.piattaforma_url).toBe(row.application_url);
  });

  it("rifiuta categoria, scope, URL, match e tipi fuori contratto", () => {
    const invalid = [
      { ...row, category: "QUALSIASI" },
      { ...row, authority_level: "MONDIALE" },
      { ...row, official_url: "javascript:alert(1)" },
      { ...row, official_url: "/relativo" },
      { ...row, requirements: "PMI" },
      { ...row, max_grant_amount: Number.NaN },
      { ...row, match: { ...row.match, score: 101 } },
      { ...row, match: { ...row.match, status: "FORSE" } },
    ];
    for (const candidate of invalid) {
      expect(opportunityIsValid(candidate)).toBe(false);
      expect(sanitizeFeedResponse({ ok: true, bandi: [candidate] }, 200)).toMatchObject({
        ok: false,
        code: "UPSTREAM_INVALID_ROW",
      });
    }
  });

  it("fallisce l'intero payload se una sola riga è invalida", () => {
    expect(parseGatewayFeed({ ok: true, bandi: [row, { ...row, id: "" }] })).toBeNull();
    expect(parseGatewayFeed({ ok: true, bandi: [row, null] })).toBeNull();
  });

  it("rimuove campi upstream non usati dalle card o dal dettaglio", () => {
    const result = sanitizeFeedResponse(
      { ok: true, bandi: [{ ...row, internal_secret: "no", user_id: "no" }] },
      200,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bandi[0]).not.toHaveProperty("internal_secret");
      expect(result.bandi[0]).not.toHaveProperty("user_id");
    }
  });

  it("richiede 200, ok=true e bandi array", () => {
    expect(sanitizeFeedResponse(good, 500)).toMatchObject({ ok: false, code: "UPSTREAM_STATUS" });
    expect(sanitizeFeedResponse({ ok: false, bandi: [] }, 200)).toMatchObject({
      ok: false,
      code: "UPSTREAM_NOT_OK",
    });
    expect(sanitizeFeedResponse({ ok: true }, 200)).toMatchObject({
      ok: false,
      code: "UPSTREAM_NO_BANDI",
    });
  });
});

describe("gateway isolato", () => {
  it("il browser non contiene secret del Core", () => {
    const sources = [
      readFileSync("src/lib/proxy-core.functions.ts", "utf8"),
      readFileSync("src/lib/proxy-core.server.ts", "utf8"),
    ].join("\n");
    expect(sources).not.toMatch(/CENTRAL_CORE_API_URL/);
    expect(sources).not.toMatch(/CENTRAL_CORE_API_KEY/);
    expect(sources).not.toMatch(/process\.env/);
  });

  it("l'endpoint accetta dal browser solo feed e request_refresh senza campi extra", () => {
    const src = readFileSync("supabase/functions/trovabandi-feed/index.ts", "utf8");
    expect(src).toContain('const ALLOWED_ACTIONS = ["feed", "request_refresh"]');
    expect(src).toContain('key !== "action"');
    expect(src).toContain("UPSTREAM_UNAVAILABLE");
  });
});
