/**
 * Check SEO statico di UEradar.com.
 * Verifica i metadata centralizzati (src/lib/seo.ts), il loro uso nelle rotte,
 * la semantica delle pagine (un solo H1, landmark essenziali) e la validità
 * del JSON-LD, con divieto di claim non verificabili.
 * Nessuna rete, nessun browser, nessuna pubblicazione.
 */
import { readFileSync } from "node:fs";
import {
  ORGANIZATION_JSONLD,
  PRICING_FAQ_JSONLD,
  PUBLIC_CONTENT_LASTMOD,
  ROUTE_SEO,
  SITE_URL,
  SOFTWARE_APPLICATION_JSONLD,
  seoHead,
  type SeoKey,
} from "../src/lib/seo";
import { PRICING_FAQ } from "../src/lib/pricing";

const errors: string[] = [];
const ok = (m: string) => console.log(`  ok  ${m}`);
const fail = (m: string) => errors.push(m);

const TITLE_MIN = 45;
const TITLE_MAX = 62;
const DESC_MIN = 130;
const DESC_MAX = 170;

/** File di rotta pubblici e privati con la chiave SEO attesa. */
const ROUTE_FILES: Record<SeoKey, string> = {
  "/": "src/routes/index.tsx",
  "/prezzi": "src/routes/prezzi.tsx",
  "/privacy": "src/routes/privacy.tsx",
  "/termini": "src/routes/termini.tsx",
  "/cookie": "src/routes/cookie.tsx",
  "/contatti": "src/routes/contatti.tsx",
  "/auth": "src/routes/auth.tsx",
  "/invito": "src/routes/invito.tsx",
  "/dashboard": "src/routes/_authenticated/dashboard.tsx",
  "/profilo": "src/routes/_authenticated/profilo.tsx",
  "/bando": "src/routes/_authenticated/bando.$id.tsx",
};

/** Le pagine legali rendono header/main/footer tramite questo layout condiviso. */
const LAYOUT_FILES: Partial<Record<SeoKey, string>> = {
  "/privacy": "src/components/bandocore/LegalPage.tsx",
  "/termini": "src/components/bandocore/LegalPage.tsx",
  "/cookie": "src/components/bandocore/LegalPage.tsx",
  "/contatti": "src/components/bandocore/LegalPage.tsx",
  "/dashboard": "src/components/bandocore/AppShell.tsx",
  "/profilo": "src/components/bandocore/AppShell.tsx",
  "/bando": "src/components/bandocore/AppShell.tsx",
};

/** Keyword di prodotto: se compaiono nel metadata devono restare in Title Case. */
const TITLE_CASE_KEYWORDS = [
  "Fondo Perduto",
  "Profilo Aziendale",
  "Istruttoria",
  "Incentivi",
  "Dossier",
  "Bozze",
  "Bandi",
  "Radar",
  "P.IVA",
  "PMI",
  "ATECO",
] as const;

function assertTitleCaseKeywords(label: string, text: string) {
  let rest = text.replace(/UEradar\.com/g, "").replace(/UEradar/g, "");
  for (const k of TITLE_CASE_KEYWORDS) rest = rest.split(k).join("");
  for (const k of TITLE_CASE_KEYWORDS) {
    const re = new RegExp("\\b" + k.replace(/[.]/g, "\\.") + "\\b", "i");
    if (re.test(rest)) fail(`${label}: keyword "${k}" non in Title Case`);
  }
}

/** Claim assoluti o non verificabili vietati nel copy indicizzabile. */
const FORBIDDEN_CLAIMS: RegExp[] = [
  /tutti i bandi/i,
  /garantiamo/i,
  /100%/,
  /il\s+miglior[eo]\b/i,
  /domanda (pronta|inviata)/i,
  /\bnumero uno\b/i,
];

for (const key of Object.keys(ROUTE_SEO) as SeoKey[]) {
  const r = ROUTE_SEO[key];
  const head = seoHead(key);
  const titles = head.meta.filter((m) => "title" in m);
  const canonical = head.links.filter((l) => l["rel"] === "canonical");

  if (titles.length !== 1) fail(`${key}: deve esserci esattamente un title`);
  if (r.title.length < TITLE_MIN || r.title.length > TITLE_MAX)
    fail(`${key}: title ${r.title.length} caratteri, atteso ${TITLE_MIN}-${TITLE_MAX}`);
  if (r.description.length < DESC_MIN || r.description.length > DESC_MAX)
    fail(`${key}: description ${r.description.length} caratteri, atteso ${DESC_MIN}-${DESC_MAX}`);

  assertTitleCaseKeywords(`${key} title`, r.title);
  assertTitleCaseKeywords(`${key} description`, r.description);

  for (const re of FORBIDDEN_CLAIMS) {
    if (re.test(`${r.title} ${r.description}`)) fail(`${key}: claim vietato ${re}`);
  }

  if (r.indexable) {
    if (canonical.length !== 1) fail(`${key}: canonical mancante o duplicato`);
    else {
      const href = canonical[0]!["href"]!;
      const expected = `${SITE_URL}${r.path === "/" ? "/" : r.path}`;
      if (href !== expected) fail(`${key}: canonical ${href}, atteso ${expected}`);
    }
    for (const p of [
      "og:title",
      "og:description",
      "og:image",
      "og:image:alt",
      "og:url",
      "og:type",
    ]) {
      if (!head.meta.some((m) => m["property"] === p)) fail(`${key}: manca ${p}`);
    }
    for (const n of [
      "twitter:card",
      "twitter:title",
      "twitter:description",
      "twitter:image",
      "twitter:image:alt",
    ]) {
      if (!head.meta.some((m) => m["name"] === n)) fail(`${key}: manca ${n}`);
    }
    if (head.meta.some((m) => m["name"] === "robots")) fail(`${key}: rotta pubblica con robots`);
  } else {
    const robots = head.meta.find((m) => m["name"] === "robots");
    if (
      !robots ||
      !robots["content"]!.includes("noindex") ||
      !robots["content"]!.includes("nofollow")
    )
      fail(`${key}: rotta privata senza noindex,nofollow`);
    if (canonical.length) fail(`${key}: rotta privata con canonical pubblico`);
  }
}

// title e description devono essere unici tra le rotte
const seenTitle = new Map<string, string>();
const seenDesc = new Map<string, string>();
for (const key of Object.keys(ROUTE_SEO) as SeoKey[]) {
  const { title, description } = ROUTE_SEO[key];
  if (seenTitle.has(title)) fail(`title duplicato tra ${seenTitle.get(title)} e ${key}`);
  if (seenDesc.has(description))
    fail(`description duplicata tra ${seenDesc.get(description)} e ${key}`);
  seenTitle.set(title, key);
  seenDesc.set(description, key);
}
ok(`metadata centralizzati verificati per ${Object.keys(ROUTE_SEO).length} rotte`);

// Semantica delle rotte
for (const key of Object.keys(ROUTE_FILES) as SeoKey[]) {
  const file = ROUTE_FILES[key];
  const src = readFileSync(file, "utf8");
  const layout = LAYOUT_FILES[key] ? readFileSync(LAYOUT_FILES[key]!, "utf8") : "";
  const combined = `${src}\n${layout}`;

  if (!src.includes(`seoHead("${key}")`)) fail(`${file}: non usa seoHead("${key}")`);

  const h1 = (src.match(/<h1[\s>]/g) ?? []).length + (layout.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) fail(`${file}: trovati ${h1} H1, atteso esattamente 1`);

  if (!combined.includes("<main")) fail(`${file}: manca il landmark <main>`);
  if (!combined.includes('id="contenuto-principale"'))
    fail(`${file}: manca l'ancora dello skip-to-content`);
  if (!combined.includes("<header")) fail(`${file}: manca il landmark <header>`);
  if (!/<nav[^>]*aria-label=/.test(combined)) fail(`${file}: nav senza aria-label`);
  // Il footer legale e' centralizzato in SiteFooter (link Termini/Privacy/Cookie
  // e pulsante "Gestisci cookie"): la rotta puo' renderlo direttamente o via layout.
  if (
    ROUTE_SEO[key].indexable &&
    !combined.includes("<footer") &&
    !combined.includes("<SiteFooter")
  )
    fail(`${file}: rotta pubblica senza footer legale (<footer> o <SiteFooter />)`);

  if (ROUTE_SEO[key].indexable) {
    // I claim si valutano solo sul copy indicizzabile: nelle aree private
    // le stesse stringhe compaiono come etichette di filtro o come negazioni.
    for (const re of FORBIDDEN_CLAIMS) {
      const m = src.match(re);
      if (m) fail(`${file}: claim vietato "${m[0]}"`);
    }
    const imgs = src.match(/<img\b[^>]*>/g) ?? [];
    for (const tag of imgs) {
      if (!/\balt=/.test(tag)) fail(`${file}: immagine pubblica senza alt`);
    }
    if (/5 imprese/i.test(src)) fail(`${file}: copy "5 imprese" vietato (è 1 Impresa · 5 Utenti)`);
  }
}
ok("semantica delle rotte verificata (H1 unico, landmark, skip link, nav etichettate)");

// JSON-LD
const FORBIDDEN_LD = ["aggregateRating", "review", "offers", "downloadUrl", "installUrl", "price"];
for (const [name, ld] of [
  ["Organization", ORGANIZATION_JSONLD],
  ["SoftwareApplication", SOFTWARE_APPLICATION_JSONLD],
  ["FAQPage", PRICING_FAQ_JSONLD],
] as const) {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(JSON.stringify(ld));
  } catch (e) {
    fail(`${name}: JSON-LD non serializzabile (${(e as Error).message})`);
    continue;
  }
  if (parsed["@context"] !== "https://schema.org") fail(`${name}: @context non valido`);
  if (!parsed["@type"]) fail(`${name}: @type mancante`);
  const flat = JSON.stringify(parsed);
  for (const f of FORBIDDEN_LD) {
    if (flat.includes(`"${f}"`)) fail(`${name}: campo non consentito "${f}" nel JSON-LD`);
  }
  for (const re of FORBIDDEN_CLAIMS) {
    if (re.test(flat)) fail(`${name}: claim vietato nel JSON-LD ${re}`);
  }
}

// FAQPage deve derivare dalla stessa fonte dati resa visibile
const faqEntities = PRICING_FAQ_JSONLD.mainEntity;
if (faqEntities.length !== PRICING_FAQ.length) fail("FAQPage: numero di domande diverso dal copy");
else if (!faqEntities.every((e, i) => e.name === PRICING_FAQ[i]!.q))
  fail("FAQPage: domande non allineate al copy visibile");
const pricingSrc = readFileSync("src/routes/prezzi.tsx", "utf8");
if (!pricingSrc.includes("PRICING_FAQ.map")) fail("FAQPage dichiarata ma FAQ non renderizzate");
if (!pricingSrc.includes("PRICING_FAQ_JSONLD")) fail("pagina prezzi senza JSON-LD FAQPage");
ok("JSON-LD valido e coerente con il contenuto visibile");

// robots.txt e sitemap.xml: presenza, coerenza col dominio e con le rotte indicizzabili
const robots = readFileSync("public/robots.txt", "utf8");
if (!/^User-agent: \*$/m.test(robots)) fail("robots.txt: manca il blocco User-agent: *");
if (!/^Allow: \/$/m.test(robots)) fail("robots.txt: manca Allow: /");
if (/^Disallow: \/$/m.test(robots)) fail("robots.txt: blocca l'intero sito");
if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`))
  fail("robots.txt: direttiva Sitemap assente o su dominio errato");
for (const key of Object.keys(ROUTE_SEO) as SeoKey[]) {
  const r = ROUTE_SEO[key];
  if (r.indexable) continue;
  if (!new RegExp(`^Disallow: ${r.path}$`, "m").test(robots))
    fail(`robots.txt: rotta non indicizzabile ${r.path} non esclusa`);
}
ok("robots.txt presente e coerente con le rotte indicizzabili");

const sitemapSrc = readFileSync("src/routes/sitemap[.]xml.ts", "utf8");
if (!sitemapSrc.includes('createFileRoute("/sitemap.xml")'))
  fail("sitemap: rotta /sitemap.xml non dichiarata");
if (!sitemapSrc.includes("ROUTE_SEO")) fail("sitemap: non derivata dai metadata SEO centralizzati");
if (!sitemapSrc.includes("PUBLIC_CONTENT_LASTMOD") || !sitemapSrc.includes("<lastmod>"))
  fail("sitemap: manca lastmod derivato da PUBLIC_CONTENT_LASTMOD");
if (!/^\d{4}-\d{2}-\d{2}$/.test(PUBLIC_CONTENT_LASTMOD))
  fail(`sitemap: PUBLIC_CONTENT_LASTMOD ${PUBLIC_CONTENT_LASTMOD} non è una data ISO`);
ok("sitemap.xml servita dalla rotta dedicata");

// header di sicurezza applicati dall'entry SSR
const securitySrc = readFileSync("src/lib/security-headers.ts", "utf8");
for (const needle of [
  "frame-ancestors",
  "object-src 'none'",
  "Permissions-Policy",
  "Strict-Transport-Security",
  "Referrer-Policy",
  "nosniff",
]) {
  if (!securitySrc.includes(needle)) fail(`security headers: manca "${needle}"`);
}
if (!readFileSync("src/server.ts", "utf8").includes("withSecurityHeaders"))
  fail("security headers: non applicati dall'entry SSR");
ok("header di sicurezza (CSP, frame-ancestors, Permissions-Policy) applicati in SSR");

if (errors.length) {
  console.error("\nSEO check FALLITO:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nSEO check OK");
