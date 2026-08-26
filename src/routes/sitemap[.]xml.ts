/**
 * Sitemap XML di UEradar.com generata dalla stessa fonte dei metadata SEO:
 * include solo le rotte pubbliche indicizzabili (indexable === true),
 * quindi /auth e l'area riservata restano fuori.
 */
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { PUBLIC_CONTENT_LASTMOD, ROUTE_SEO, SITE_URL, type RouteSeo } from "@/lib/seo";

/** Priorità e frequenza per path pubblico; la home resta la pagina principale. */
const HINTS: Record<string, { changefreq: string; priority: string }> = {
  "/": { changefreq: "weekly", priority: "1.0" },
  "/prezzi": { changefreq: "monthly", priority: "0.8" },
  "/contatti": { changefreq: "yearly", priority: "0.5" },
  "/privacy": { changefreq: "yearly", priority: "0.3" },
  "/termini": { changefreq: "yearly", priority: "0.3" },
  "/cookie": { changefreq: "yearly", priority: "0.3" },
};

export function publicSitemapPaths(): string[] {
  return Object.values(ROUTE_SEO as Record<string, RouteSeo>)
    .filter((r) => r.indexable)
    .map((r) => r.path);
}

export function buildSitemapXml(): string {
  const urls = publicSitemapPaths().map((path) => {
    const hint = HINTS[path] ?? { changefreq: "monthly", priority: "0.5" };
    return [
      "  <url>",
      `    <loc>${SITE_URL}${path === "/" ? "/" : path}</loc>`,
      `    <lastmod>${PUBLIC_CONTENT_LASTMOD}</lastmod>`,
      `    <changefreq>${hint.changefreq}</changefreq>`,
      `    <priority>${hint.priority}</priority>`,
      "  </url>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
  ].join("\n");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () =>
        new Response(buildSitemapXml(), {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});
