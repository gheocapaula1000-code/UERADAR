/**
 * Regressione mirata:
 * 1) formattazione numerica deterministica (React #418: mismatch server/client);
 * 2) service worker con fallback offline reale alla shell in cache.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatEuro, formatItalianInteger } from "@/lib/catalog";

describe("formattazione deterministica (anti hydration mismatch)", () => {
  it("raggruppa sempre le migliaia, anche a 4 cifre", () => {
    expect(formatItalianInteger(4990)).toBe("4.990");
    expect(formatItalianInteger(1990)).toBe("1.990");
    expect(formatItalianInteger(999)).toBe("999");
    expect(formatItalianInteger(1234567)).toBe("1.234.567");
  });

  it("formatEuro non dipende dai dati di locale del runtime", () => {
    expect(formatEuro(499000)).toBe("4.990\u00A0€");
    expect(formatEuro(49900)).toBe("499\u00A0€");
    expect(formatEuro(199000)).toBe("1.990\u00A0€");
    expect(formatEuro(49999)).toBe("499,99\u00A0€");
  });

  it("nessun Intl.NumberFormat in componenti renderizzati in SSR", () => {
    const card = readFileSync("src/components/bandocore/BandoCard.tsx", "utf8");
    expect(card).not.toContain("Intl.NumberFormat");
    const catalog = readFileSync("src/lib/catalog.ts", "utf8");
    expect(catalog).not.toContain("Intl.NumberFormat");
  });
});

describe("service worker: fallback offline", () => {
  const sw = readFileSync("public/sw.js", "utf8");

  it("non usa addAll atomico in install", () => {
    expect(sw).not.toContain("addAll(");
    expect(sw).toContain("allSettled");
  });

  it("serve la shell in cache per le navigazioni offline", () => {
    expect(sw).toContain('request.mode === "navigate"');
    expect(sw).toContain("OFFLINE_FALLBACKS");
    expect(sw).toContain('const OFFLINE_FALLBACKS = ["/", "/auth"]');
  });

  it("non dipende da /offline.html e non lascia navigazioni scoperte", () => {
    expect(sw).not.toContain("offline.html");
    expect(sw).toContain("status: 503");
  });
});
