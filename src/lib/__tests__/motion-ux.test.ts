import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CARD_STAGGER_MAX_MS,
  CARD_STAGGER_STEP_MS,
  cardEnterDelayMs,
  isAnimatableScore,
  scoreAtProgress,
} from "@/lib/motion";

const CARD = readFileSync("src/components/bandocore/BandoCard.tsx", "utf8");
const SCORE = readFileSync("src/components/bandocore/MatchScore.tsx", "utf8");
const DASHBOARD = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
const DETAIL = readFileSync("src/routes/_authenticated/bando.$id.tsx", "utf8");

describe("ingresso progressivo delle card", () => {
  it("aumenta di poco per ogni card ma resta limitato", () => {
    expect(cardEnterDelayMs(0)).toBe(0);
    expect(cardEnterDelayMs(3)).toBe(3 * CARD_STAGGER_STEP_MS);
    expect(cardEnterDelayMs(500)).toBe(CARD_STAGGER_MAX_MS);
    expect(CARD_STAGGER_MAX_MS).toBeLessThanOrEqual(400);
  });

  it("indici non validi e reduced-motion non producono ritardi", () => {
    expect(cardEnterDelayMs(-2)).toBe(0);
    expect(cardEnterDelayMs(Number.NaN)).toBe(0);
    expect(cardEnterDelayMs(5, true)).toBe(0);
  });

  it("le liste passano l'indice alle card", () => {
    expect(DASHBOARD).toContain("index={i}");
    expect(CARD).toContain("cardEnterDelayMs(index)");
  });
});

describe("punteggio di compatibilità: solo dati reali", () => {
  it("accetta solo numeri finiti tra 0 e 100", () => {
    expect(isAnimatableScore(0)).toBe(true);
    expect(isAnimatableScore(87)).toBe(true);
    expect(isAnimatableScore(101)).toBe(false);
    expect(isAnimatableScore(-1)).toBe(false);
    expect(isAnimatableScore("87")).toBe(false);
    expect(isAnimatableScore(null)).toBe(false);
    expect(isAnimatableScore(undefined)).toBe(false);
    expect(isAnimatableScore(Number.NaN)).toBe(false);
  });

  it("il conteggio non supera mai il valore reale e vi termina", () => {
    expect(scoreAtProgress(64, 0)).toBe(0);
    expect(scoreAtProgress(64, 0.5)).toBeLessThanOrEqual(64);
    expect(scoreAtProgress(64, 1)).toBe(64);
    expect(scoreAtProgress(64, 5)).toBe(64);
    expect(scoreAtProgress(Number.NaN as unknown as number, 1)).toBe(0);
  });

  it("senza punteggio reale non mostra nulla e resta accessibile", () => {
    expect(SCORE).toContain("if (real === null) return null");
    expect(SCORE).toContain("aria-label={`Compatibilità ${real}%`}");
    expect(SCORE).toContain("prefers-reduced-motion");
  });
});

describe("feedback sobrio su CTA e apertura scheda", () => {
  it("la CTA usa solo luminosità e ombra", () => {
    expect(CARD).toContain("cta-lift");
  });
  it("l'apertura della scheda usa lo stesso ingresso discreto", () => {
    expect(DETAIL).toContain("card-enter");
  });
  it("nessun suono, vibrazione o coriandolo", () => {
    for (const src of [CARD, SCORE, DETAIL]) {
      expect(src).not.toMatch(/Audio|vibrate|confetti|new Howl/i);
    }
  });
  it("nessun termine vietato nella UI", () => {
    for (const src of [CARD, SCORE]) {
      expect(src).not.toMatch(/\b(AI|IA|ML|smart|Core)\b/);
    }
  });
});
