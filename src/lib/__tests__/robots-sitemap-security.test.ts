import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { ROUTE_SEO, SITE_URL, type RouteSeo } from "@/lib/seo";
import { buildSitemapXml, publicSitemapPaths } from "@/routes/sitemap[.]xml";
import {
  CONTENT_SECURITY_POLICY,
  PERMISSIONS_POLICY,
  withSecurityHeaders,
} from "@/lib/security-headers";

const routes = Object.values(ROUTE_SEO as Record<string, RouteSeo>);

describe("robots.txt", () => {
  const robots = readFileSync("public/robots.txt", "utf8");

  it("consente la scansione delle pagine pubbliche", () => {
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).not.toMatch(/^Disallow: \/$/m);
  });

  it("esclude /auth e l'area riservata", () => {
    for (const r of routes.filter((x) => !x.indexable)) {
      expect(robots).toMatch(new RegExp(`^Disallow: ${r.path}$`, "m"));
    }
  });

  it("dichiara la sitemap sul dominio canonico", () => {
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });
});

describe("sitemap.xml", () => {
  const xml = buildSitemapXml();

  it("contiene solo le rotte pubbliche indicizzabili", () => {
    const indexable = routes.filter((r) => r.indexable).map((r) => r.path);
    expect(publicSitemapPaths().sort()).toEqual(indexable.sort());
    for (const path of indexable) expect(xml).toContain(`<loc>${SITE_URL}${path}</loc>`);
    for (const r of routes.filter((x) => !x.indexable))
      expect(xml).not.toContain(`<loc>${SITE_URL}${r.path}</loc>`);
  });

  it("è XML valido con urlset e senza lastmod inventati", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
    expect(xml).not.toContain("<lastmod>");
    expect((xml.match(/<url>/g) ?? []).length).toBe((xml.match(/<\/url>/g) ?? []).length);
  });
});

describe("header di sicurezza", () => {
  it("imposta CSP, frame-ancestors e Permissions-Policy", () => {
    const res = withSecurityHeaders(new Response("ok", { status: 200 }));
    expect(res.headers.get("content-security-policy")).toBe(CONTENT_SECURITY_POLICY);
    expect(res.headers.get("permissions-policy")).toBe(PERMISSIONS_POLICY);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
  });

  it("mantiene HSTS e referrer-policy già presenti senza sovrascriverli", () => {
    const res = withSecurityHeaders(
      new Response("ok", {
        status: 200,
        headers: {
          "Strict-Transport-Security": "max-age=31536000",
          "Referrer-Policy": "no-referrer",
        },
      }),
    );
    expect(res.headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("aggiunge HSTS e referrer-policy quando mancano", () => {
    const res = withSecurityHeaders(new Response("ok"));
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("non rompe Supabase, PWA e Stripe nella CSP", () => {
    for (const needle of [
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "https://fonts.gstatic.com",
      "https://checkout.stripe.com",
    ]) {
      expect(CONTENT_SECURITY_POLICY).toContain(needle);
    }
  });

  it("preserva status e body della risposta originale", async () => {
    const res = withSecurityHeaders(new Response("payload", { status: 404 }));
    expect(res.status).toBe(404);
    await expect(res.text()).resolves.toBe("payload");
  });

  it("è applicato dall'entry SSR", () => {
    const server = readFileSync("src/server.ts", "utf8");
    expect(server).toContain("withSecurityHeaders");
  });
});
