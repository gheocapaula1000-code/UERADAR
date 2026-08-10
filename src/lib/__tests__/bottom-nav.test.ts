import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BOTTOM_NAV_ENTER_MAX_MS,
  BOTTOM_NAV_ENTER_STEP_MS,
  BOTTOM_NAV_ITEMS,
  activeBottomNavIndex,
  bottomNavEnterDelayMs,
  isBottomNavActive,
} from "@/lib/bottom-nav";

const NAV = readFileSync("src/components/bandocore/BottomNav.tsx", "utf8");
const SHELL = readFileSync("src/components/bandocore/AppShell.tsx", "utf8");
const CSS = readFileSync("src/styles.css", "utf8");

describe("voci della navigazione inferiore", () => {
  it("punta solo a rotte realmente esistenti", () => {
    expect(BOTTOM_NAV_ITEMS.map((i) => i.to)).toEqual([
      "/dashboard",
      "/profilo",
      "/abbonamento",
    ]);
  });

  it("resta attiva anche sulle sottopagine del dettaglio bando", () => {
    expect(isBottomNavActive(BOTTOM_NAV_ITEMS[0], "/dashboard")).toBe(true);
    expect(isBottomNavActive(BOTTOM_NAV_ITEMS[0], "/bando/123")).toBe(true);
    expect(isBottomNavActive(BOTTOM_NAV_ITEMS[1], "/profilo")).toBe(true);
    expect(isBottomNavActive(BOTTOM_NAV_ITEMS[1], "/profilo-altro")).toBe(false);
    expect(isBottomNavActive(BOTTOM_NAV_ITEMS[2], "")).toBe(false);
  });

  it("al massimo una voce attiva", () => {
    expect(activeBottomNavIndex("/abbonamento")).toBe(2);
    expect(activeBottomNavIndex("/prezzi")).toBe(-1);
    const attive = BOTTOM_NAV_ITEMS.filter((i) => isBottomNavActive(i, "/bando/9"));
    expect(attive).toHaveLength(1);
  });
});

describe("ingresso progressivo della barra", () => {
  it("cresce per voce ma resta limitato", () => {
    expect(bottomNavEnterDelayMs(0)).toBe(0);
    expect(bottomNavEnterDelayMs(2)).toBe(2 * BOTTOM_NAV_ENTER_STEP_MS);
    expect(bottomNavEnterDelayMs(99)).toBe(BOTTOM_NAV_ENTER_MAX_MS);
    expect(BOTTOM_NAV_ENTER_MAX_MS).toBeLessThanOrEqual(400);
  });

  it("indici non validi e reduced-motion non producono ritardi", () => {
    expect(bottomNavEnterDelayMs(-3)).toBe(0);
    expect(bottomNavEnterDelayMs(Number.NaN)).toBe(0);
    expect(bottomNavEnterDelayMs(2, true)).toBe(0);
  });
});

describe("resa e accessibilità", () => {
  it("è fissa in basso, rispetta la safe-area ed è montata nell'area riservata", () => {
    expect(NAV).toMatch(/fixed inset-x-0 bottom-0/);
    expect(NAV).toContain("safe-bottom");
    expect(NAV).toContain('aria-label="Navigazione principale"');
    expect(NAV).toContain('aria-current={active ? "page" : undefined}');
    expect(SHELL).toContain("<BottomNav />");
  });

  it("il contenuto non finisce sotto la barra", () => {
    expect(SHELL).toMatch(/pb-24/);
    // Anche il footer resta sopra la barra dove la barra è visibile.
    expect(SHELL).toContain("bottom-nav-gap");
    expect(CSS).toContain("@utility bottom-nav-gap");
    expect(CSS).toMatch(/calc\(4\.75rem \+ env\(safe-area-inset-bottom\)\)/);
  });

  it("su desktop resta la sidebar e la barra è nascosta", () => {
    expect(NAV).toMatch(/lg:hidden/);
    expect(SHELL).toMatch(/hidden lg:flex w-64/);
  });

  it("l'ingresso è coordinato con l'apertura radar e disattivato da reduced-motion", () => {
    expect(NAV).toContain("INTRO_SCENE_MS");
    expect(NAV).toContain("prefers-reduced-motion");
    expect(CSS).toContain("@keyframes bottom-nav-enter");
    expect(CSS).toContain("@keyframes bottom-nav-pill");
  });

  it("nessun suono, vibrazione o coriandolo e nessun termine vietato", () => {
    expect(NAV).not.toMatch(/Audio|vibrate|confetti|new Howl/i);
    expect(NAV).not.toMatch(/\b(AI|IA|ML|smart|Core)\b/);
  });
});
