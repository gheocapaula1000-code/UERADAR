#!/usr/bin/env node
/**
 * Verifica statica PWA: manifest valido, icone PNG reali con dimensioni corrette,
 * variante maskable, service worker presente e registrato solo con guardie di
 * produzione, e assenza della vecchia CTA "Genera Istanza".
 * Nessuna rete, nessun browser, nessuna pubblicazione.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { inflateSync } from "node:zlib";

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

// 1b. asset icone: presenza, dimensioni reali, mime dichiarato
const rootHead = readFileSync("src/routes/__root.tsx", "utf8");

const rasterExpectations = [
  ["public/icons/favicon-16.png", 16],
  ["public/icons/favicon-32.png", 32],
  ["public/icons/apple-touch-icon-180.png", 180],
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/icon-512-maskable.png", 512],
];
for (const [file, size] of rasterExpectations) {
  if (!existsSync(file)) {
    fail(`asset icona mancante: ${file}`);
    continue;
  }
  const dim = pngSize(file);
  if (!dim) fail(`${file} non è un PNG reale (mime image/png atteso)`);
  else if (dim.width !== size || dim.height !== size)
    fail(`${file} è ${dim.width}x${dim.height}, atteso ${size}x${size}`);
  else ok(`PNG ${size}x${size} valido → ${file}`);
}

// favicon ICO reale + coerenza con le dimensioni dichiarate nel manifest
if (!existsSync("public/favicon.ico")) fail("public/favicon.ico mancante");
else {
  const frames = icoFrames("public/favicon.ico");
  if (!frames?.length) fail("public/favicon.ico non è un ICO reale (mime image/x-icon atteso)");
  else {
    ok(`favicon.ico valido, frame: ${frames.map((f) => `${f.width}x${f.height}`).join(", ")}`);
    const declared = (manifest?.icons ?? []).find((i) => i.src === "/favicon.ico");
    if (declared) {
      if (declared.type !== "image/x-icon") fail('manifest: favicon.ico deve dichiarare type "image/x-icon"');
      const match = frames.some((f) => `${f.width}x${f.height}` === declared.sizes);
      if (!match)
        fail(`manifest: favicon.ico dichiara sizes="${declared.sizes}" ma il file non contiene quel frame`);
      else ok(`manifest: sizes favicon.ico coerente (${declared.sizes})`);
    }
  }
}

// apple-touch-icon: asset dedicato 180x180, mai icon-192
const appleLink = /rel:\s*"apple-touch-icon"[^}]*}/.exec(rootHead)?.[0] ?? "";
if (!appleLink) fail("__root.tsx: link apple-touch-icon assente");
else if (!appleLink.includes('sizes: "180x180"'))
  fail('__root.tsx: apple-touch-icon deve dichiarare sizes="180x180"');
else if (!appleLink.includes("/icons/apple-touch-icon-180.png"))
  fail("__root.tsx: apple-touch-icon deve puntare a /icons/apple-touch-icon-180.png (mai icon-192)");
else ok("apple-touch-icon → asset dedicato 180x180");

// maskable: asset distinto dall'icona "any" e con safe zone rispettata
const anyIcon = pngPixels("public/icons/icon-512.png");
const maskIcon = pngPixels("public/icons/icon-512-maskable.png");
if (!maskIcon) fail("icon-512-maskable.png non decodificabile (atteso PNG RGBA 8 bit)");
else {
  if (anyIcon && anyIcon.data.equals(maskIcon.data))
    fail("icon-512-maskable.png è identica a icon-512.png: manca la safe zone");
  const { width, height, data } = maskIcon;
  const px = (x, y) => {
    const o = (y * width + x) * 4;
    return [data[o], data[o + 1], data[o + 2], data[o + 3]];
  };
  const base = px(0, 0);
  const margin = Math.round(width * 0.1); // zona di taglio maskable
  let bleedOutliers = 0;
  let transparent = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const inBleed = x < margin || y < margin || x >= width - margin || y >= height - margin;
      if (!inBleed) continue;
      const [r, g, b, a] = px(x, y);
      if (a < 250) transparent += 1;
      if (Math.abs(r - base[0]) + Math.abs(g - base[1]) + Math.abs(b - base[2]) > 24) bleedOutliers += 1;
    }
  }
  if (transparent > 0) fail("maskable: la zona di taglio contiene pixel trasparenti");
  else if (bleedOutliers > 0)
    fail(`maskable: contenuto nella zona di taglio esterna (${bleedOutliers} campioni fuori tinta)`);
  else ok("maskable: safe zone rispettata (bleed 10% pieno e uniforme)");
}

// 1c. colori brand coerenti fra manifest e meta theme-color, con contrasto sul testo
if (manifest) {
  const metaTheme = /name:\s*"theme-color",\s*content:\s*"(#[0-9a-fA-F]{6})"/.exec(rootHead)?.[1];
  if (!metaTheme) fail("__root.tsx: meta theme-color assente o non esadecimale");
  else if (metaTheme.toLowerCase() !== String(manifest.theme_color).toLowerCase())
    fail(`theme-color disallineato: meta ${metaTheme} vs manifest ${manifest.theme_color}`);
  else ok(`theme-color allineato (${metaTheme})`);

  for (const key of ["theme_color", "background_color"]) {
    const rgb = hexToRgb(manifest[key]);
    if (!rgb) {
      fail(`manifest: ${key} mancante o non esadecimale`);
      continue;
    }
    const ratio = contrastRatio(rgb, [255, 255, 255]);
    if (relativeLuminance(rgb) > 0.2)
      fail(`manifest: ${key} (${manifest[key]}) non è il near-black/navy del brand`);
    else if (ratio < 4.5)
      fail(`manifest: contrasto insufficiente su ${key} (${ratio.toFixed(2)}:1)`);
    else ok(`${key} ${manifest[key]} — contrasto ${ratio.toFixed(1)}:1 su testo bianco`);
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
