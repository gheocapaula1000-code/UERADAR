/**
 * Radar Bandi su iPhone (390×844): nessuno scroll orizzontale.
 * L'audit Playwright salta /dashboard senza sessione; questo test è
 * l'assert viewport dell'area autenticata.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  IPHONE_DASHBOARD_VIEWPORT,
  dashboardIphoneOverflowOk,
  hasHorizontalOverflow,
} from "@/lib/dashboard-overflow";

const DASHBOARD = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
const CARD = readFileSync("src/components/bandocore/BandoCard.tsx", "utf8");
const SHELL = readFileSync("src/components/bandocore/AppShell.tsx", "utf8");
const NAV = readFileSync("src/components/bandocore/BottomNav.tsx", "utf8");
const PTR = readFileSync("src/components/bandocore/PullToRefresh.tsx", "utf8");
const CSS = readFileSync("src/styles.css", "utf8");
const AUDIT = readFileSync("scripts/responsive-audit.py", "utf8");

describe("viewport iPhone 390×844: nessun overflow orizzontale", () => {
  it("documenta il viewport PWA di riferimento", () => {
    expect(IPHONE_DASHBOARD_VIEWPORT).toEqual({ width: 390, height: 844 });
  });

  it("a 390px scrollWidth non può superare innerWidth", () => {
    expect(dashboardIphoneOverflowOk(390)).toBe(true);
    expect(dashboardIphoneOverflowOk(391)).toBe(true);
    expect(dashboardIphoneOverflowOk(392)).toBe(false);
    expect(hasHorizontalOverflow(390, 390)).toBe(false);
    expect(hasHorizontalOverflow(400, 390)).toBe(true);
    expect(hasHorizontalOverflow(Number.NaN, 390)).toBe(true);
  });

  it("l'audit Playwright include /dashboard @390px e salta solo senza sessione", () => {
    expect(AUDIT).toContain('("/dashboard", CRITICAL)');
    expect(AUDIT).toContain("390");
    expect(AUDIT).toContain("scrollWidth");
    expect(AUDIT).toContain("redirect a {final} (sessione assente)");
  });
});

describe("contenitore autenticato: un solo scroller verticale", () => {
  it("blocca html/body mentre il PTR è montato", () => {
    expect(PTR).toContain('root.classList.add("ptr-page-lock")');
    expect(PTR).toContain('root.classList.remove("ptr-page-lock")');
    expect(CSS).toContain("html.ptr-page-lock");
    expect(CSS).toMatch(/html\.ptr-page-lock[\s\S]*overflow-y:\s*hidden/);
    expect(CSS).toMatch(/html\.ptr-page-lock[\s\S]*overscroll-behavior-x:\s*none/);
  });

  it("il PTR non apre uno scroll orizzontale (overflow-y:auto da solo lo farebbe)", () => {
    expect(PTR).toContain("overflow-x-clip");
    expect(PTR).toContain("overscroll-x-none");
    expect(PTR).toContain('touchAction: "pan-y"');
    expect(PTR).toContain("min-w-0");
    expect(CSS).toMatch(/\.ptr-root[\s\S]*overflow-x:\s*clip/);
    expect(CSS).toMatch(/\.ptr-root[\s\S]*overscroll-behavior-x:\s*none/);
    expect(CSS).toMatch(/\.ptr-root[\s\S]*touch-action:\s*pan-y/);
  });

  it("AppShell e main restano nel viewport", () => {
    expect(SHELL).toContain("overflow-x-clip");
    expect(SHELL).toContain("min-w-0");
    expect(SHELL).toContain('id="contenuto-principale"');
    expect(NAV).toContain("overflow-x-clip");
    expect(NAV).toContain("min-w-0");
  });
});

describe("dashboard e card: chip e titoli non allargano la pagina", () => {
  it("i chip di filtro vanno a capo e spezzano le etichette lunghe", () => {
    expect(DASHBOARD).toContain('label: "Regionale (POR FESR)"');
    expect(DASHBOARD).toContain('label: "Nazionale (Invitalia/MIMIT)"');
    expect(DASHBOARD).toMatch(/SCOPES\.map[\s\S]*wrap-anywhere/);
    expect(DASHBOARD).toMatch(/CATEGORY_FILTERS\.map[\s\S]*wrap-anywhere/);
    expect(DASHBOARD).toMatch(/flex min-w-0 max-w-full flex-wrap gap-2/);
    expect(DASHBOARD).not.toMatch(/whitespace-nowrap/);
  });

  it("titoli, badge e griglie hanno min-w-0 e wrap-anywhere", () => {
    expect(DASHBOARD).toContain("overflow-x-clip");
    expect(DASHBOARD).toContain("wrap-anywhere");
    expect(DASHBOARD).toMatch(/grid min-w-0 gap-4/);
    expect(CARD).toContain("min-w-0 max-w-full overflow-x-clip");
    expect(CARD).toMatch(/h3[\s\S]*wrap-anywhere/);
    expect(CARD).toContain("wrap-anywhere");
    expect(CSS).toContain("@utility wrap-anywhere");
  });

  it("card-enter non traduce in orizzontale e l'hover non alza la card al tocco", () => {
    expect(CSS).toMatch(/@keyframes card-enter[\s\S]*translate3d\(0, 8px, 0\)/);
    expect(CSS).toContain("@media (hover: hover) and (pointer: fine)");
    expect(CARD).not.toMatch(/hover:scale|hover:translate|group-hover:scale/);
  });
});
