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
  type CoreOpportunity,
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
  forms_url: "https://example.gov.it/a/modulo.pdf",
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
    ])
      expect(minimized).not.toHaveProperty(forbidden);
  });

  it("la Edge usa la funzione condivisa per feed e refresh", () => {
    const src = readFileSync("supabase/functions/trovabandi-feed/index.ts", "utf8");
    expect(src).toContain('from "../_shared/trovabandi-contract.ts"');
    expect(src).toContain("const minimizedProfile = matchingProfile");
    expect(src).toContain("{ profile: minimizedProfile, limit: PROFILE_FEED_LIMIT }");
    expect(src).not.toContain("{ profile, limit: 250 }");
    expect(src).toContain('callCore("catalog"');
    expect(src).toContain('mode: "catalog"');
    expect(src).toContain("{ limit: CATALOG_LIMIT }");
    expect(src).not.toContain('mode: "catalog", profile');
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
    expect(mapped.application_url).toBe(row.application_url);
    expect(mapped.modulistica_url).toBe(row.forms_url);
  });

  it("mantiene forms_url e application_url nel contratto e non copia official_url", () => {
    const withUrls = sanitizeFeedResponse(
      {
        ok: true,
        bandi: [
          {
            ...row,
            forms_url: "https://ente.it/moduli",
            application_url: "https://ente.it/domanda",
          },
        ],
      },
      200,
    );
    expect(withUrls.ok).toBe(true);
    if (withUrls.ok) {
      expect(withUrls.bandi[0]?.forms_url).toBe("https://ente.it/moduli");
      expect(withUrls.bandi[0]?.application_url).toBe("https://ente.it/domanda");
    }

    const blank = sanitizeFeedResponse(
      { ok: true, bandi: [{ ...row, forms_url: "", application_url: "  " }] },
      200,
    );
    expect(blank.ok).toBe(true);
    if (blank.ok) {
      expect(blank.bandi[0]).not.toHaveProperty("forms_url");
      expect(blank.bandi[0]).not.toHaveProperty("application_url");
      const mapped = mapCoreOpportunity(blank.bandi[0] as typeof row);
      expect(mapped.modulistica_url).toBeUndefined();
      expect(mapped.application_url).toBeUndefined();
      expect(mapped.piattaforma_url).toBeUndefined();
      expect(mapped.official_url).toBe(row.official_url);
    }
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

  it("l'endpoint accetta feed, catalog e request_refresh, con mode solo sul feed", () => {
    const src = readFileSync("supabase/functions/trovabandi-feed/index.ts", "utf8");
    expect(src).toContain('from "../_shared/trovabandi-feed-request.ts"');
    expect(src).toContain("isCatalogRequest");
    expect(src).toContain("fetchOfficialCatalog");
    expect(src).toContain("UPSTREAM_UNAVAILABLE");
  });

  it("il client chiede catalogo con action catalog, feed profilo invariato", () => {
    const src = readFileSync("src/lib/proxy-core.functions.ts", "utf8");
    expect(src).toContain('{ action: "catalog" }');
    expect(src).toContain('{ action: "feed" }');
    expect(src).toContain('data.mode === "profile" ? "profile" : "catalog"');
    expect(src).toContain("pickCachedView");
  });

  it("marca ogni lettura Core riuscita con l'ora server corrente", () => {
    const src = readFileSync("src/lib/proxy-core.functions.ts", "utf8");
    expect(src).toContain("fetchedAt = nowIso");
    expect(src).not.toContain("fetchedAt = envelope.fetched_at");
    expect(src).toContain('source: "central-core"');
    expect(src).toContain("? rawGeneratedAt");
    expect(src).toContain(": nowIso");
  });

  it("controlla gli errori cache e applica la stessa TTL a feed e dettagli", () => {
    const src = readFileSync("src/lib/proxy-core.functions.ts", "utf8");
    expect(src).toContain("CACHE_WRITE_FAILED");
    expect(src).toContain("HIDDEN_CACHE_WRITE_FAILED");
    expect(src).toContain("CACHE_FALLBACK_READ_FAILED");
    expect(src).toContain("HIDDEN_CACHE_READ_FAILED");
    expect(src.match(/\.gte\("fetched_at", cutoff\)/g)).toHaveLength(2);
    expect(src).toContain('.gte("discovered_at", cutoff)');
  });
});

describe("ateco ufficiale dal Core", () => {
  it("mappa eligible_ateco_prefixes su ateco_compatibili senza inventare codici", () => {
    const prefixesOnly = mapCoreOpportunity({
      ...row,
      eligible_ateco_prefixes: ["62", "63"],
    } as CoreOpportunity);
    expect(prefixesOnly.ateco_compatibili).toEqual(["62", "63"]);

    const both = mapCoreOpportunity({
      ...row,
      eligible_ateco_codes: ["62.01.00"],
      eligible_ateco_prefixes: ["62", "62.01.00"],
    } as CoreOpportunity);
    expect(both.ateco_compatibili).toEqual(["62.01.00", "62"]);

    const empty = mapCoreOpportunity(row as CoreOpportunity);
    expect(empty.ateco_compatibili).toEqual([]);
  });

  it("il contratto conserva eligible_ateco_prefixes ufficiali", () => {
    const result = sanitizeFeedResponse(
      { ok: true, bandi: [{ ...row, eligible_ateco_prefixes: ["62"] }] },
      200,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bandi[0]?.eligible_ateco_prefixes).toEqual(["62"]);
      const mapped = mapCoreOpportunity(result.bandi[0] as CoreOpportunity);
      expect(mapped.ateco_compatibili).toEqual(["62"]);
    }
  });
});

describe("coercizione importi Core", () => {
  it("accetta max_grant_amount stringa e lo mappa a numero", () => {
    const result = sanitizeFeedResponse(
      {
        ok: true,
        bandi: [
          {
            ...row,
            max_grant_amount: "150000.00",
            aid_intensity_percent: "40",
            total_budget: "1000000.0",
          },
        ],
      },
      200,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bandi[0]?.max_grant_amount).toBe(150000);
      expect(result.bandi[0]?.aid_intensity_percent).toBe(40);
      expect(result.bandi[0]?.total_budget).toBe(1_000_000);
      const mapped = mapCoreOpportunity(result.bandi[0] as CoreOpportunity);
      expect(mapped.importo_max).toBe(150000);
      expect(mapped.aid_intensity_percent).toBe(40);
      expect(mapped.total_budget).toBe(1_000_000);
    }
  });

  it("mappa sportello dichiarato e non inventa l'importo assente", () => {
    const result = sanitizeFeedResponse(
      { ok: true, bandi: [{ ...row, sportello: true, verification_status: "SPORTELLO" }] },
      200,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const mapped = mapCoreOpportunity(result.bandi[0] as CoreOpportunity);
      expect(mapped.sportello).toBe(true);
      expect(mapped.importo_max).toBeUndefined();
    }
  });
});
