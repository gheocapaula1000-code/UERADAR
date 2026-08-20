/**
 * Metadata SEO centralizzati di UEradar.com.
 * Fonte unica per title, description, canonical, OG/Twitter, robots e JSON-LD:
 * le rotte non devono duplicare stringhe, così il check statico resta attendibile.
 */
import { PRICING_FAQ } from "@/lib/pricing";
import { LEGAL } from "@/lib/legal";

export const SITE_URL = "https://ueradar.com";
export const SITE_NAME = "UEradar.com";
export const SOCIAL_IMAGE = `${SITE_URL}/brand/ueradar-social-1200x630.png`;

export type RouteSeo = {
  /** Path canonico della rotta. */
  path: string;
  title: string;
  description: string;
  /** false = rotta privata o non indicizzabile (noindex, nessun canonical pubblico). */
  indexable: boolean;
  ogType?: "website" | "article";
};

export const ROUTE_SEO = {
  "/": {
    path: "/",
    title: "UEradar.com — Bandi e incentivi per PMI e P.IVA",
    description:
      "Radar dei Bandi per Imprese italiane: Fondo Perduto, PNRR, Fondi Europei e Finanziamenti Agevolati filtrati su ATECO, sede e Profilo Aziendale della tua Impresa.",
    indexable: true,
    ogType: "website",
  },
  "/prezzi": {
    path: "/prezzi",
    title: "Prezzi UEradar.com — Piani Radar, Pratica e Studio",
    description:
      "Piani Radar e Pratica per Partita IVA e PMI, Studio su richiesta: prezzi IVA esclusa, 7 giorni gratuiti, senza carta di credito e senza disdetta.",
    indexable: true,
    ogType: "website",
  },
  "/privacy": {
    path: "/privacy",
    title: "Informativa Privacy — UEradar.com per le Imprese",
    description:
      "Come UEradar.com tratta i dati di account e Profilo Aziendale: finalità, basi giuridiche, conservazione, isolamento dei dati per Impresa e diritti esercitabili.",
    indexable: true,
    ogType: "article",
  },
  "/termini": {
    path: "/termini",
    title: "Termini e Condizioni del Servizio — UEradar.com",
    description:
      "Termini d'uso di UEradar.com: servizio riservato a Partite IVA e Imprese, Piani e prezzi IVA esclusa, Prova Gratuita di 7 giorni e cancellazione online.",
    indexable: true,
    ogType: "article",
  },
  "/cookie": {
    path: "/cookie",
    title: "Cookie e Memoria Locale del Servizio — UEradar.com",
    description:
      "Quali cookie e quale memoria locale usa UEradar.com per autenticazione, sicurezza, installazione dell'app e consultazione offline dell'ultimo feed disponibile.",
    indexable: true,
    ogType: "article",
  },
  "/contatti": {
    path: "/contatti",
    title: "Contatti UEradar.com — Assistenza e dati del Titolare",
    description:
      "Contatti ufficiali di UEradar.com: email, PEC, telefono e sede legale del Titolare Pi.Gi Service di Gheoca Paula per Assistenza, Privacy e questioni amministrative.",
    indexable: true,
    ogType: "article",
  },
  "/auth": {
    path: "/auth",
    title: "Accedi a UEradar.com — area riservata alle imprese",
    description:
      "Accesso riservato ai clienti UEradar.com: entra con email o Google per configurare il profilo aziendale e consultare il radar dei bandi filtrato sulla tua impresa.",
    indexable: false,
  },
  "/dashboard": {
    path: "/dashboard",
    title: "Radar dei bandi — area riservata di UEradar.com",
    description:
      "Area riservata: feed dei bandi e degli incentivi compatibili con il profilo della tua impresa, con motivazione della compatibilità e scadenze.",
    indexable: false,
  },
  "/profilo": {
    path: "/profilo",
    title: "Profilo azienda — area riservata di UEradar.com",
    description:
      "Area riservata: dati dell'impresa usati dal radar per filtrare bandi e incentivi su ATECO, sede, dimensione e caratteristiche dell'azienda.",
    indexable: false,
  },
  "/bando": {
    path: "/bando",
    title: "Dettaglio del bando — area riservata di UEradar.com",
    description:
      "Area riservata: dettaglio dell'opportunità, requisiti, documenti, scadenze, canale ufficiale e dossier di candidatura generato dai dati presenti dalla fonte ufficiale.",
    indexable: false,
  },
  "/abbonamento": {
    path: "/abbonamento",
    title: "Abbonamento e utenti — area riservata di UEradar.com",
    description:
      "Area riservata: stato della prova gratuita, piani disponibili, fatture, dati fiscali, disdetta online e utenti operativi della tua impresa.",
    indexable: false,
  },
} satisfies Record<string, RouteSeo>;

export type SeoKey = keyof typeof ROUTE_SEO;

/** Costruisce meta e links coerenti per la rotta indicata. */
export function seoHead(key: SeoKey) {
  const r: RouteSeo = ROUTE_SEO[key];
  const meta: Array<Record<string, string>> = [
    { title: r.title },
    { name: "description", content: r.description },
    { property: "og:title", content: r.title },
    { property: "og:description", content: r.description },
    { property: "og:type", content: r.ogType ?? "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "it_IT" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: r.title },
    { name: "twitter:description", content: r.description },
  ];

  if (!r.indexable) {
    meta.push({ name: "robots", content: "noindex, nofollow" });
    return { meta, links: [] as Array<Record<string, string>> };
  }

  const url = `${SITE_URL}${r.path === "/" ? "/" : r.path}`;
  meta.push(
    { property: "og:url", content: url },
    { property: "og:image", content: SOCIAL_IMAGE },
    { name: "twitter:image", content: SOCIAL_IMAGE },
  );
  return { meta, links: [{ rel: "canonical", href: url }] };
}

/** Organization: solo dati verificabili, nessun rating e nessuna offerta attiva. */
export const ORGANIZATION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  legalName: LEGAL.owner,
  url: `${SITE_URL}/`,
  logo: `${SITE_URL}/icons/icon-512.png`,
  email: LEGAL.email,
  telephone: LEGAL.phone,
  vatID: LEGAL.vatId,
  address: {
    "@type": "PostalAddress",
    streetAddress: LEGAL.address.street,
    postalCode: LEGAL.address.postalCode,
    addressLocality: LEGAL.address.city,
    addressRegion: LEGAL.address.province,
    addressCountry: "IT",
  },
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: LEGAL.email,
    telephone: LEGAL.phone,
    areaServed: "IT",
    availableLanguage: "it",
  },
  description:
    "Servizio B2B che aiuta Partite IVA, PMI e Imprese italiane a individuare Bandi e Incentivi pubblici da Fonti Ufficiali.",
};

/** SoftwareApplication: nessun prezzo dichiarato come offerta attiva, nessun download store. */
export const SOFTWARE_APPLICATION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: `${SITE_URL}/`,
  description:
    "Applicazione web per Imprese che raccoglie Bandi, Fondo Perduto e Incentivi da Fonti Ufficiali e li filtra sul Profilo Aziendale dell'Impresa.",
};

/** FAQPage generata dalla stessa fonte dati resa visibile nella pagina prezzi. */
export const PRICING_FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: PRICING_FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};
