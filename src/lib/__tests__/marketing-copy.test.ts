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
];

/** Ignora import e path di modulo: il test verifica il copy, non i nomi tecnici interni. */
function copyOnly(src: string): string {
  return src
    .split("\n")
    .filter((l) => !/^\s*import\s/.test(l) && !/^\s*\/\//.test(l) && !/^\s*\*/.test(l))
    .join("\n");
}

describe("copy pubblico e autenticato", () => {
  it("non contiene claim non dimostrabili né riferimenti al fornitore tecnico", () => {
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
    const statLines = src.split("\n").filter((l) => l.includes("query.isLoading ?"));
    expect(statLines.length).toBeGreaterThanOrEqual(6);
    for (const l of statLines) expect(l).toMatch(/"—"|`—`/);
  });
});