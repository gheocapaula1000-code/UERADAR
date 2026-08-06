#!/usr/bin/env node
/**
 * Verifica statica PWA: manifest valido, icone PNG reali con dimensioni corrette,
 * variante maskable, service worker presente e registrato solo con guardie di
 * produzione, e assenza della vecchia CTA "Genera Istanza".
 * Nessuna rete, nessun browser, nessuna pubblicazione.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const errors = [];
const ok = (m) => console.log(`  ok  ${m}`);
const fail = (m) => errors.push(m);

function pngSize(path) {
  const buf = readFileSync(path);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(sig)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// 1. manifest
const manifestPath = "public/manifest.webmanifest";
if (!existsSync(manifestPath)) fail("manifest.webmanifest mancante");
let manifest = null;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  ok("manifest JSON valido");
} catch (e) {
  fail(`manifest JSON non valido: ${e.message}`);
}

if (manifest) {
  for (const key of ["name", "short_name", "start_url", "scope", "display", "theme_color"]) {
    if (!manifest[key]) fail(`manifest: campo "${key}" mancante`);
  }
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const pngIcons = icons.filter((i) => i.type === "image/png");
  const need = [
    ["192x192", "any"],
    ["512x512", "any"],
    ["512x512", "maskable"],
  ];
  for (const [sizes, purpose] of need) {
    const entry = pngIcons.find(
      (i) => i.sizes === sizes && String(i.purpose ?? "any").split(/\s+/).includes(purpose),
    );
    if (!entry) {
      fail(`manifest: manca icona PNG ${sizes} purpose="${purpose}"`);
      continue;
    }
    const file = join("public", entry.src.replace(/^\//, ""));
    if (!existsSync(file)) {
      fail(`icona dichiarata ma assente sul disco: ${file}`);
      continue;
    }
    const dim = pngSize(file);
    if (!dim) fail(`${file} non è un PNG reale`);
    else if (`${dim.width}x${dim.height}` !== sizes)
      fail(`${file} è ${dim.width}x${dim.height}, atteso ${sizes}`);
    else ok(`icona ${sizes} purpose=${purpose} → ${file}`);
  }
}

// 2. service worker + guardie
if (!existsSync("public/sw.js")) fail("public/sw.js mancante");
else ok("public/sw.js presente");
const root = readFileSync("src/routes/__root.tsx", "utf8");
if (!root.includes("/manifest.webmanifest")) fail("manifest non referenziato in __root.tsx");
else ok("manifest referenziato in __root.tsx");
if (!root.includes("serviceWorker.register")) fail("service worker non registrato in __root.tsx");
else if (!root.includes("import.meta.env.PROD") || !root.includes("id-preview--"))
  fail("registrazione SW senza le guardie di produzione esistenti");
else ok("registrazione SW protetta dalle guardie di produzione");

// 3. vecchia CTA
const stale = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if ([".ts", ".tsx", ".json", ".html"].includes(extname(p))) {
      if (readFileSync(p, "utf8").includes("Genera Istanza")) stale.push(p);
    }
  }
}
walk("src");
if (stale.length) fail(`CTA obsoleta "Genera Istanza" ancora presente in: ${stale.join(", ")}`);
else ok('nessuna occorrenza della CTA obsoleta "Genera Istanza"');

if (errors.length) {
  console.error("\nPWA check FALLITO:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nPWA check OK");
