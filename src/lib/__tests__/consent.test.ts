import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  DEFAULT_CHOICES,
  OPTIONAL_CATEGORIES,
  OPTIONAL_VENDORS,
  createRecord,
  effectiveChoices,
  hasOptionalVendors,
  needsPrompt,
  parseRecord,
  readConsent,
  writeConsent,
} from "@/lib/consent";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    raw: map,
  };
}

describe("consenso cookie — default e rifiuto", () => {
  it("al primo accesso le categorie opzionali sono spente e il banner va mostrato", () => {
    const store = memoryStorage();
    const record = readConsent(store);
    expect(record).toBeNull();
    expect(needsPrompt(record)).toBe(true);
    for (const cat of OPTIONAL_CATEGORIES) expect(effectiveChoices(record)[cat]).toBe(false);
    expect(DEFAULT_CHOICES.necessary).toBe(true);
  });

  it("X / Escape / rifiuto producono lo stesso record senza opzionali", () => {
    const rec = createRecord("reject_optional");
    expect(rec.method).toBe("reject_optional");
    expect(rec.choices).toEqual({ ...DEFAULT_CHOICES });
    for (const cat of OPTIONAL_CATEGORIES) expect(rec.choices[cat]).toBe(false);
  });

  it("un tentativo di consenso implicito viene normalizzato a rifiuto", () => {
    const rec = createRecord("reject_optional", { analytics: true, marketing: true });
    expect(rec.choices.analytics).toBe(false);
    expect(rec.choices.marketing).toBe(false);
  });
});

describe("consenso cookie — accettazione e granularita'", () => {
  it("accetta tutti attiva ogni categoria", () => {
    const rec = createRecord("accept_all");
    for (const cat of OPTIONAL_CATEGORIES) expect(rec.choices[cat]).toBe(true);
  });

  it("la personalizzazione granulare conserva solo le categorie scelte", () => {
    const rec = createRecord("custom", { analytics: true });
    expect(rec.choices.analytics).toBe(true);
    expect(rec.choices.preferences).toBe(false);
    expect(rec.choices.marketing).toBe(false);
    expect(rec.choices.necessary).toBe(true);
  });
});

describe("consenso cookie — persistenza e versione", () => {
  it("scrive versione, timestamp e scelte e non ripropone il banner", () => {
    const store = memoryStorage();
    const rec = createRecord("custom", { preferences: true }, new Date("2026-08-07T10:00:00Z"));
    writeConsent(store, rec);
    const saved = JSON.parse(store.raw.get(CONSENT_STORAGE_KEY)!);
    expect(saved.version).toBe(CONSENT_VERSION);
    expect(saved.timestamp).toBe("2026-08-07T10:00:00.000Z");
    expect(saved.choices.preferences).toBe(true);
    const reread = readConsent(store);
    expect(needsPrompt(reread)).toBe(false);
    expect(reread?.choices.preferences).toBe(true);
  });

  it("una versione diversa richiede una nuova scelta e riporta i default", () => {
    const old = { ...createRecord("accept_all"), version: "2020-01-01" };
    expect(needsPrompt(old)).toBe(true);
    expect(effectiveChoices(old)).toEqual({ ...DEFAULT_CHOICES });
  });

  it("un valore corrotto equivale ad assenza di consenso", () => {
    expect(parseRecord("non-json")).toBeNull();
    expect(parseRecord('{"version":"x"}')).toBeNull();
    expect(parseRecord(JSON.stringify({ ...createRecord("accept_all"), choices: { necessary: false } }))).toBeNull();
    expect(needsPrompt(parseRecord(null))).toBe(true);
  });
});

describe("nessun vendor opzionale caricato", () => {
  it("la lista vendor e' vuota finche' non viene integrato uno strumento reale", () => {
    expect(OPTIONAL_VENDORS).toHaveLength(0);
    expect(hasOptionalVendors()).toBe(false);
  });

  it("il codice non carica script di terze parti di analytics o marketing", () => {
    const files = [
      "src/components/bandocore/CookieConsent.tsx",
      "src/components/bandocore/SiteFooter.tsx",
      "src/routes/__root.tsx",
      "src/lib/consent.ts",
    ];
    const forbidden =
      /googletagmanager|google-analytics|gtag\(|fbq\(|hotjar|clarity\.ms|matomo|plausible|segment\.com|doubleclick/i;
    for (const f of files) {
      expect(readFileSync(f, "utf8")).not.toMatch(forbidden);
    }
  });
});

describe("UI banner e footer — requisiti normativi statici", () => {
  const banner = readFileSync("src/components/bandocore/CookieConsent.tsx", "utf8");
  const footer = readFileSync("src/components/bandocore/SiteFooter.tsx", "utf8");
  const cookiePage = readFileSync("src/routes/cookie.tsx", "utf8");

  it("il dialog ha semantica accessibile, focus trap e ripristino del focus", () => {
    expect(banner).toContain('role="dialog"');
    expect(banner).toContain("aria-modal");
    expect(banner).toContain("aria-labelledby");
    expect(banner).toContain("aria-describedby");
    expect(banner).toContain('e.key === "Escape"');
    expect(banner).toContain("restoreRef");
  });

  it("Accetta e' il pulsante primario, con rifiuto sempre visibile e area di tocco >= 44px", () => {
    expect(banner).toContain("Accetta tutti");
    expect(banner).toContain("Rifiuta opzionali");
    expect(banner).toContain("Personalizza");
    expect(banner).toMatch(/data-testid="consent-accept-all"[\s\S]{0,200}bg-primary/);
    expect(banner).toMatch(/data-testid="consent-reject"[\s\S]{0,200}border-border/);
    expect(banner).toContain("min-h-11");
  });

  it("il bottom-sheet rispetta le safe-area iOS", () => {
    expect(banner).toContain("fixed inset-x-0 bottom-0");
    expect(banner).toContain("safe-bottom");
    expect(banner).toContain("safe-x");
  });

  it("la X e' dichiarata come chiusura senza accettazione", () => {
    expect(banner).toContain("Chiudi senza accettare gli strumenti opzionali");
    expect(banner).toContain("dismissAsRefusal");
  });

  it("il footer espone i link legali e la revoca del consenso", () => {
    for (const s of ["Termini e Condizioni", "Privacy", "Cookie", "Gestisci cookie"]) {
      expect(footer).toContain(s);
    }
    expect(footer).toContain("CONSENT_OPEN_EVENT");
  });

  it("le pagine legali linkano le fonti ufficiali", () => {
    expect(cookiePage).toContain("docweb/9677876");
    expect(cookiePage).toContain("eur-lex.europa.eu/eli/reg/2016/679/oj");
    expect(readFileSync("src/routes/privacy.tsx", "utf8")).toContain("docweb/9677876");
  });

  it("le pagine legali riportano i dati legali reali senza placeholder", () => {
    const files = [
      "src/routes/privacy.tsx",
      "src/routes/termini.tsx",
      "src/routes/cookie.tsx",
      "src/routes/contatti.tsx",
      "src/components/bandocore/SiteFooter.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toContain("da completare prima della pubblicazione");
    }
    const legal = readFileSync("src/lib/legal.ts", "utf8");
    expect(legal).toContain("Pi.Gi Service di Gheoca Paula");
    expect(legal).toContain("05770260288");
    expect(legal).toContain("info@pigiservice.com");
    expect(legal).toContain("pigiservice@pec.it");
    expect(legal).toContain("+39 352 0966114");
    expect(legal).toContain("tel:+393520966114");
  });

  it("non compaiono il vecchio numero, dati inventati o provider di hosting non verificati", () => {
    const files = [
      "src/lib/legal.ts",
      "src/routes/privacy.tsx",
      "src/routes/termini.tsx",
      "src/routes/cookie.tsx",
      "src/routes/contatti.tsx",
      "src/components/bandocore/SiteFooter.tsx",
    ]
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    expect(files).not.toMatch(/347\s?6373956/);
    expect(files).not.toMatch(/paulagheoca@pec\.it/i);
    expect(files).toMatch(/pigiservice@pec\.it/);
    expect(files).not.toMatch(/\bREA\b/);
    expect(files).not.toMatch(/Registro Imprese/i);
    expect(files).not.toMatch(/Netlify|Vercel|Cloudflare|Aruba/i);
    expect(files).not.toMatch(/Codice Fiscale/i);
  });

  it("i termini riportano prezzi, prova e pagamenti online live", () => {
    const terms = readFileSync("src/routes/termini.tsx", "utf8");
    expect(terms).not.toContain("€249");
    expect(terms).toContain("€449");
    expect(terms).toContain("€990");
    expect(terms).toMatch(/non richiede carta di credito/);
    expect(terms).toContain("senza PEC");
    expect(terms).not.toMatch(/disattivata fino al collaudo/i);
    expect(terms).toMatch(/modalità live/i);
  });
});