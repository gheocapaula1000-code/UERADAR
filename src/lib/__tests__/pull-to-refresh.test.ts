import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PTR_MAX_PULL_PX,
  PTR_MIN_SPIN_MS,
  PTR_THRESHOLD_PX,
  PTR_WATCHDOG_MS,
  canStartPull,
  isVerticalPull,
  phaseFor,
  pullDistance,
  pullLabel,
  pullProgress,
  shouldRefreshOnRelease,
  supportsPullGesture,
} from "@/lib/pull-to-refresh";

const PTR = readFileSync("src/components/bandocore/PullToRefresh.tsx", "utf8");
const SHELL = readFileSync("src/components/bandocore/AppShell.tsx", "utf8");
const CSS = readFileSync("src/styles.css", "utf8");

describe("avvio del gesto", () => {
  it("parte solo dall'alto della pagina", () => {
    expect(canStartPull(0, false)).toBe(true);
    expect(canStartPull(1, false)).toBe(false);
    expect(canStartPull(240, false)).toBe(false);
  });

  it("non parte durante un aggiornamento o durante l'apertura radar", () => {
    expect(canStartPull(0, true)).toBe(false);
    expect(canStartPull(0, false, true)).toBe(false);
  });

  it("solo su dispositivi con tocco", () => {
    expect(supportsPullGesture(true, 5)).toBe(true);
    expect(supportsPullGesture(false, 0)).toBe(false);
    expect(supportsPullGesture(true, 0)).toBe(false);
  });
});

describe("non interferisce con lo scroll normale", () => {
  it("ignora swipe orizzontali e risalite", () => {
    expect(isVerticalPull(90, 20)).toBe(false);
    expect(isVerticalPull(0, -40)).toBe(false);
    expect(isVerticalPull(0, 4)).toBe(false);
  });

  it("riconosce una trazione verticale netta", () => {
    expect(isVerticalPull(4, 40)).toBe(true);
  });
});

describe("trazione elastica", () => {
  it("non supera mai la distanza massima", () => {
    expect(pullDistance(10_000)).toBeLessThanOrEqual(PTR_MAX_PULL_PX);
    expect(pullDistance(-50)).toBe(0);
  });

  it("offre resistenza crescente", () => {
    const primi = pullDistance(40) - pullDistance(20);
    const ultimi = pullDistance(160) - pullDistance(140);
    expect(ultimi).toBeLessThan(primi);
  });

  it("con reduced-motion nessuna elasticità oltre la soglia", () => {
    expect(pullDistance(600, true)).toBe(PTR_THRESHOLD_PX);
  });
});

describe("stati e rilascio", () => {
  it("progresso limitato tra 0 e 1", () => {
    expect(pullProgress(0)).toBe(0);
    expect(pullProgress(PTR_THRESHOLD_PX * 3)).toBe(1);
  });

  it("aggiorna solo oltre la soglia", () => {
    expect(shouldRefreshOnRelease(PTR_THRESHOLD_PX - 1)).toBe(false);
    expect(shouldRefreshOnRelease(PTR_THRESHOLD_PX)).toBe(true);
  });

  it("fasi ed etichette coerenti", () => {
    expect(phaseFor(0, false)).toBe("idle");
    expect(phaseFor(20, false)).toBe("pulling");
    expect(phaseFor(PTR_THRESHOLD_PX, false)).toBe("ready");
    expect(phaseFor(10, true)).toBe("refreshing");
    expect(pullLabel("ready")).toMatch(/Rilascia/);
    expect(pullLabel("idle")).toBe("");
  });

  it("watchdog sempre oltre la durata minima", () => {
    expect(PTR_WATCHDOG_MS).toBeGreaterThan(PTR_MIN_SPIN_MS);
  });
});

describe("integrazione nell'area riservata", () => {
  it("avvolge il contenuto principale una sola volta", () => {
    expect(SHELL).toContain("<PullToRefresh>");
    expect(SHELL.match(/<PullToRefresh>/g)).toHaveLength(1);
    expect(SHELL).toContain('id="contenuto-principale"');
  });

  it("aggiorna i dati della pagina corrente", () => {
    expect(PTR).toContain("router.invalidate()");
    expect(PTR).toContain("queryClient.invalidateQueries()");
  });

  it("non compete con l'overscroll nativo e usa solo trasformazioni", () => {
    expect(CSS).toContain("overscroll-behavior-y: contain");
    expect(PTR).toContain("translate3d");
  });

  it("rispetta prefers-reduced-motion e la barra inferiore", () => {
    expect(PTR).toContain("prefers-reduced-motion: reduce");
    expect(SHELL).toContain("<BottomNav />");
  });
});
