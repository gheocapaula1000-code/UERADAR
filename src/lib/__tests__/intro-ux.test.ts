import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  INTRO_FADE_MS,
  INTRO_SCENE_MS,
  INTRO_STORAGE_KEY,
  INTRO_TAGLINE,
  INTRO_WATCHDOG_MS,
  introDurations,
  markIntroSeen,
  shouldShowIntro,
  watchdogIsSafe,
} from "@/lib/intro";
import { COVERAGE_HEADLINE } from "@/lib/coverage";

const INTRO = readFileSync("src/components/bandocore/RadarIntro.tsx", "utf8");
const CARD = readFileSync("src/components/bandocore/BandoCard.tsx", "utf8");
const CSS = readFileSync("src/styles.css", "utf8");
const DASHBOARD = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");

function memStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("apertura radar: durate e watchdog", () => {
  it("dura tra 2 e 3 secondi", () => {
    expect(INTRO_SCENE_MS).toBeGreaterThanOrEqual(2000);
    expect(INTRO_SCENE_MS).toBeLessThanOrEqual(3000);
  });

  it("il watchdog supera sempre scena più dissolvenza", () => {
    expect(watchdogIsSafe()).toBe(true);
    expect(INTRO_WATCHDOG_MS).toBeGreaterThan(INTRO_SCENE_MS + INTRO_FADE_MS);
  });

  it("con prefers-reduced-motion nessuna animazione e nessun overlay", () => {
    expect(introDurations(true)).toEqual({ scene: 0, fade: 0, watchdog: 0 });
    expect(shouldShowIntro(memStorage(), true)).toBe(false);
  });
});

describe("una sola volta per sessione", () => {
  it("mostra la prima volta e non la seconda", () => {
    const s = memStorage();
    expect(shouldShowIntro(s)).toBe(true);
    markIntroSeen(s);
    expect(shouldShowIntro(s)).toBe(false);
    expect(s.getItem(INTRO_STORAGE_KEY)).toBe("1");
  });

  it("storage assente o rotto non blocca mai l'accesso", () => {
    expect(shouldShowIntro(null)).toBe(false);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(shouldShowIntro(broken)).toBe(false);
    expect(() => markIntroSeen(broken)).not.toThrow();
  });
});

describe("contenuto e accessibilità dell'apertura", () => {
  it("usa una frase reale già pubblicata, senza numeri inventati", () => {
    expect(INTRO_TAGLINE).toBe(COVERAGE_HEADLINE);
  });

  it("espone stato accessibile e pulsante Salta", () => {
    expect(INTRO).toContain('role="status"');
    expect(INTRO).toContain('aria-live="polite"');
    expect(INTRO).toMatch(/Salta/);
    expect(INTRO).toContain('e.key === "Escape"');
  });

  it("overlay fisso a schermo intero: nessun layout shift", () => {
    expect(INTRO).toMatch(/fixed inset-0/);
  });

  it("non contiene suoni, vibrazioni o coriandoli", () => {
    expect(INTRO).not.toMatch(/Audio|vibrate|confetti|new Howl/i);
  });

  it("è montata nella dashboard senza gate di autenticazione aggiuntivi", () => {
    expect(DASHBOARD).toContain("<RadarIntro />");
  });
});

describe("microeffetti sobri", () => {
  it("le card entrano solo con opacità e traslazione", () => {
    expect(CARD).toContain("card-enter");
    expect(CSS).toContain("@keyframes card-enter");
    expect(CSS).toMatch(/translate3d\(0, 8px, 0\)/);
  });

  it("scadenze urgenti e Flash usano lo stesso effetto discreto", () => {
    expect(CARD).toContain("urgent-pulse");
    expect(CSS).toContain("@keyframes urgent-pulse");
  });

  it("la CTA non cambia dimensioni", () => {
    expect(CARD).toContain("cta-lift");
    expect(CSS).toMatch(/@utility cta-lift[\s\S]*?filter[\s\S]*?box-shadow/);
    expect(CSS).not.toMatch(/@utility cta-lift[\s\S]*?transform/);
  });

  it("prefers-reduced-motion neutralizza le animazioni globali", () => {
    expect(CSS).toContain("@media (prefers-reduced-motion: reduce)");
  });
});

describe("vocabolario UI", () => {
  it("nessun termine vietato nell'apertura", () => {
    expect(INTRO).not.toMatch(/\b(AI|IA|ML|smart|Core)\b/);
    expect(INTRO_TAGLINE).not.toMatch(/\b(AI|IA|ML|smart|Core)\b/);
  });
});
