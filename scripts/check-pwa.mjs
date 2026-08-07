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

/** Dimensioni di ogni frame di un file ICO reale (mime image/x-icon). */
function icoFrames(path) {
  const buf = readFileSync(path);
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  const count = buf.readUInt16LE(4);
  const frames = [];
  for (let i = 0; i < count; i += 1) {
    const off = 6 + i * 16;
    frames.push({ width: buf[off] || 256, height: buf[off + 1] || 256 });
  }
  return frames;
}

/** Decoder PNG minimale: restituisce i pixel RGBA di una riga/colonna campionata. */
function pngPixels(path) {
  // usa il decoder nativo via ImageData non disponibile in node puro: leggiamo i chunk IDAT
  // e li decomprimiamo con zlib, gestendo solo PNG truecolor+alpha (colorType 6, bitDepth 8).
  const buf = readFileSync(path);
  const bitDepth = buf[24];
  const colorType = buf[25];
  if (bitDepth !== 8 || colorType !== 6) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  let pos = 8;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    if (type === "IDAT") idat.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += len + 12;
    if (type === "IEND") break;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rp];
    rp += 1;
    const line = raw.subarray(rp, rp + stride);
    rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  return { width, height, data: out };
}

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
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

const sw = readFileSync("public/sw.js", "utf8");
for (const route of ["/auth", "/prezzi", "/privacy", "/termini", "/cookie"]) {
  if (!sw.includes(`"${route}"`)) fail(`shell offline: manca ${route}`);
  else ok(`shell offline include ${route}`);
}

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
