import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|json|webmanifest)$/.test(p)) out.push(p);
  }
  return out;
}

const FILES = walk("src")
  .filter((p) => !p.includes("__tests__"))
  .filter((p) => !p.endsWith("routeTree.gen.ts"));

const UI_FILES = FILES.filter(
  (p) => p.includes("/routes/") || p.includes("/components/"),
).filter((p) => !p.includes("/routes/api/"));

/** Claim non dimostrabili o riferimenti al fornitore tecnico: vietati nella UI. */
const FORBIDDEN: RegExp[] = [
  /20\s+Regioni/i,
  /Regioni monitorate/i,
  /Ogni mattina/i,
  /zero rumore/i,
  /Ogni giorno di ritardo/i,
  /in 2 minuti/i,
  /Replit/i,
  /\bcron\b/i,
  /Central Core/i,
  /Proxy[- ]Core/i,
  /Sommers[ae]/i,
  /Click Day Fantasma/i,
  // Cadenze, invii e verifiche non dimostrabili: fail-closed sul copy.
  /aggiornamenti programmati/i,
  /avvisi automatici/i,
  /notifiche automatiche/i,
  /verifiche approfondite/i,
  /ogni ora/i,
  /24\/7/,
  /quotidian[ao]/i,
  /tempi di notifica/i,
  /ti avvisiamo/i,
  // Automatismi non dimostrabili lato prodotto.
  /aggiorna in automatico/i,
  /automaticamente aggiornat/i,
  // Terminologia vietata nella UI.
  /\bAI\b/,
  /\bIA\b/,
  /\bML\b/,
  /\bsmart\b/i,
  /\bCore\b/,
];

/**
 * Ignora import e path di modulo e normalizza gli spazi: il copy in JSX va a
 * capo, quindi senza normalizzazione una frase vietata sfugge al controllo.
 */
function copyOnly(src: string): string {
  return src
    .split("\n")
    .filter((l) => !/^\s*import\s/.test(l) && !/^\s*\/\//.test(l) && !/^\s*\*/.test(l))
    .join(" ")
    .replace(/\s+/g, " ");
}

describe("copy pubblico e autenticato", () => {
  it("descrive la prova con il perimetro reale, senza rimandi a un piano a pagamento", async () => {
    const { TRIAL_SCOPE } = await import("@/lib/trial");
    const joined = TRIAL_SCOPE.join(" | ");
    expect(joined).not.toMatch(/Business/i);
    expect(joined).toMatch(/1 impresa/i);
    expect(joined).toMatch(/2 obiettivi/i);
    expect(joined).toMatch(/filigranat/i);
  });

  it("non contiene claim non dimostrabili né riferimenti al fornitore tecnico", () => {
    // La scansione legge davvero i file dell'HEAD: nessun elenco parziale.
    expect(UI_FILES.length).toBeGreaterThan(10);
    expect(UI_FILES).toContain("src/routes/index.tsx");
    expect(UI_FILES).toContain("src/routes/_authenticated/dashboard.tsx");
    const hits: string[] = [];
    for (const f of UI_FILES) {
      const src = copyOnly(readFileSync(f, "utf8"));
      for (const re of FORBIDDEN) {
        if (re.test(src)) hits.push(`${f} :: ${re}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("non contiene statistiche numeriche promozionali hard-coded nella landing", () => {
    const src = readFileSync("src/routes/index.tsx", "utf8");
    // nessun literal tipo "1.200+", "20", "98%" usato come metrica di marketing
    expect(src).not.toMatch(/"\s*\d[\d.,]*\s*\+?\s*%?\s*"/);
  });

  it("le statistiche autenticate derivano dal feed e mostrano — durante il caricamento", () => {
    const src = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
    const flat = src.replace(/\s+/g, " ");
    const guarded = flat.match(/v: query\.isLoading \? "—"/g) ?? [];
    const allStats = flat.match(/v: query\.isLoading/g) ?? [];
    expect(allStats.length).toBeGreaterThanOrEqual(6);
    expect(guarded.length).toBe(allStats.length);
    // nessun valore numerico d'esempio hard-coded nelle card statistiche
    expect(src).not.toMatch(/v:\s*\d+\s*,/);
  });
});