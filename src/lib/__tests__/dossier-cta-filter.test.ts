import { describe, expect, it } from "vitest";

type MatchStatus = "COMPATIBILE" | "DA_VERIFICARE" | "NON_COMPATIBILE";

function excludeNonCompatibile<T extends { match?: { status?: MatchStatus } }>(
  items: T[],
): T[] {
  return items.filter((b) => b.match?.status !== "NON_COMPATIBILE");
}

function overlayClass(closing: boolean): string {
  return `fixed inset-0 z-[120] ${closing ? "intro-fade-out pointer-events-none" : "intro-fade-in"}`;
}

describe("filtro profilo: nasconde solo NON_COMPATIBILE", () => {
  it("tiene COMPATIBILE, DA_VERIFICARE e schede senza match", () => {
    const kept = excludeNonCompatibile([
      { id: "ok", match: { status: "COMPATIBILE" as const } },
      { id: "check", match: { status: "DA_VERIFICARE" as const } },
      { id: "bare" },
      { id: "no", match: { status: "NON_COMPATIBILE" as const } },
    ]);
    expect(kept.map((b) => b.id)).toEqual(["ok", "check", "bare"]);
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
