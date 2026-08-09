/**
 * Logica pura dei microeffetti premium (nessuna dipendenza da React).
 * Serve a garantire con i test: ritardi progressivi limitati, animazione del
 * punteggio solo con dati reali e rispetto di prefers-reduced-motion.
 */

/** Ritardo massimo dell'ingresso progressivo: oltre appare subito. */
export const CARD_STAGGER_STEP_MS = 45;
export const CARD_STAGGER_MAX_MS = 360;

/** Durata del conteggio del punteggio di compatibilità. */
export const SCORE_COUNT_MS = 700;

export function cardEnterDelayMs(index: number, reducedMotion = false): number {
  if (reducedMotion) return 0;
  if (!Number.isFinite(index) || index <= 0) return 0;
  return Math.min(Math.floor(index) * CARD_STAGGER_STEP_MS, CARD_STAGGER_MAX_MS);
}

/** Il punteggio si anima solo se è un numero reale valido tra 0 e 100. */
export function isAnimatableScore(score: unknown): score is number {
  return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100;
}

/**
 * Valore mostrato durante il conteggio: parte da 0 e arriva esattamente al
 * valore reale. Mai un numero superiore o inventato.
 */
export function scoreAtProgress(target: number, progress: number): number {
  if (!isAnimatableScore(target)) return 0;
  const p = Math.min(1, Math.max(0, progress));
  const eased = 1 - Math.pow(1 - p, 3);
  return Math.min(target, Math.round(target * eased));
}
