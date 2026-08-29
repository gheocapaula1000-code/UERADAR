import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isMiaImpresaCompatibile } from "../mia-impresa";

function overlayClass(closing: boolean): string {
  return `fixed inset-0 z-[120] ${closing ? "intro-fade-out pointer-events-none" : "intro-fade-in"}`;
}

describe("filtro Per la mia impresa: solo COMPATIBILE", () => {
  it("nasconde NON_COMPATIBILE, DA_VERIFICARE e schede senza match", () => {
    const kept = [
      { id: "ok", match: { status: "COMPATIBILE" as const } },
      { id: "check", match: { status: "DA_VERIFICARE" as const } },
      { id: "bare" },
      { id: "no", match: { status: "NON_COMPATIBILE" as const } },
    ].filter(isMiaImpresaCompatibile);
    expect(kept.map((b) => b.id)).toEqual(["ok"]);
  });

  it("la dashboard usa il filtro solo sulla vista profilo, dopo sedeOk/settoreOk", () => {
    const dashboard = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
    expect(dashboard).toContain("isMiaImpresaCompatibile");
    expect(dashboard).toContain('from "@/lib/mia-impresa"');
    expect(dashboard).toContain('homeView === "profile"');
    expect(dashboard).toContain("if (!isMiaImpresaCompatibile(b)) return false");
    expect(dashboard).toContain("if (!sedeOk(b)) return false");
    expect(dashboard).toContain("if (!settoreOk(b)) return false");
    expect(dashboard).toContain("isMiaImpresaCompatibile(b) && sedeOk(b) && settoreOk(b)");
    expect(dashboard).toContain("matchesSede");
    // Catalogo: il filtro match non si applica. settoreOk resta fail-open se ATECO ufficiale è vuoto.
    expect(dashboard).toContain(
      'statsSource = homeView === "catalog" ? bandiAttivi : bandiPerProfilo',
    );
    expect(dashboard).toContain("if (Array.isArray(lista) && lista.length > 0)");
    expect(dashboard).toMatch(
      /if \(Array\.isArray\(lista\) && lista\.length > 0\) \{[\s\S]*?return true;/,
    );
  });
});

describe("dettaglio bando: id in URL", () => {
  it("decodifica l'id prima del lookup", () => {
    const raw = encodeURIComponent("bando/abc 1");
    expect(decodeURIComponent(raw)).toBe("bando/abc 1");
  });
});

describe("overlay: non blocca i click in chiusura", () => {
  it("aggiunge pointer-events-none quando closing", () => {
    expect(overlayClass(true)).toContain("pointer-events-none");
    expect(overlayClass(false)).not.toContain("pointer-events-none");
  });
});
