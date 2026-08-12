/**
 * Logica pura del gesto "tira per aggiornare" (nessuna dipendenza da React).
 * Serve a garantire con i test: attivazione solo dall'alto della pagina,
 * nessuna interferenza con lo scroll normale o con gli swipe orizzontali,
 * trazione elastica limitata e rispetto di prefers-reduced-motion.
 */

/** Distanza oltre la quale il rilascio esegue l'aggiornamento. */
export const PTR_THRESHOLD_PX = 72;
/** Distanza massima raggiungibile dall'indicatore. */
export const PTR_MAX_PULL_PX = 120;
/** Movimento minimo prima di considerare il gesto una trazione. */
export const PTR_START_SLOP_PX = 8;
/** Durata minima dell'indicatore: evita lo sfarfallio su risposte istantanee. */
export const PTR_MIN_SPIN_MS = 450;
/** Oltre questo tempo l'indicatore si chiude comunque (rete bloccata). */
export const PTR_WATCHDOG_MS = 10_000;

export type PtrPhase = "idle" | "pulling" | "ready" | "refreshing";

/** Il gesto parte solo se il contenuto è davvero in cima. */
export function canStartPull(scrollTop: number, refreshing: boolean, introPending = false): boolean {
  if (refreshing || introPending) return false;
  if (!Number.isFinite(scrollTop)) return false;
  return scrollTop <= 0;
}

/**
 * Gesto verticale verso il basso: uno swipe orizzontale o una risalita
 * non devono mai rubare lo scroll nativo.
 */
export function isVerticalPull(dx: number, dy: number): boolean {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  if (dy <= PTR_START_SLOP_PX) return false;
  return dy > Math.abs(dx) * 1.2;
}

/**
 * Trazione elastica: il contenuto segue il dito sempre meno e non supera mai
 * la distanza massima. Con reduced-motion nessuno spostamento elastico.
 */
export function pullDistance(dy: number, reducedMotion = false): number {
  if (!Number.isFinite(dy) || dy <= 0) return 0;
  if (reducedMotion) return Math.min(dy, PTR_THRESHOLD_PX);
  const resisted = PTR_MAX_PULL_PX * (1 - Math.exp(-dy / PTR_MAX_PULL_PX));
  return Math.min(PTR_MAX_PULL_PX, Math.round(resisted * 10) / 10);
}

/** Avanzamento 0→1 dell'arco dell'indicatore. */
export function pullProgress(distance: number): number {
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  return Math.min(1, distance / PTR_THRESHOLD_PX);
}

export function phaseFor(distance: number, refreshing: boolean): PtrPhase {
  if (refreshing) return "refreshing";
  if (distance <= 0) return "idle";
  return distance >= PTR_THRESHOLD_PX ? "ready" : "pulling";
}

/** Al rilascio si aggiorna solo se la soglia è stata superata. */
export function shouldRefreshOnRelease(distance: number): boolean {
  return Number.isFinite(distance) && distance >= PTR_THRESHOLD_PX;
}

/** Testo annunciato ai lettori di schermo e mostrato sotto l'indicatore. */
export function pullLabel(phase: PtrPhase): string {
  switch (phase) {
    case "refreshing":
      return "Aggiornamento in corso";
    case "ready":
      return "Rilascia per aggiornare";
    case "pulling":
      return "Tira per aggiornare";
    default:
      return "";
  }
}

/**
 * Il gesto è disponibile solo su dispositivi con tocco (mai col solo mouse).
 * Su iOS PWA `(pointer: coarse)` non è sempre affidabile: basta che il
 * dispositivo dichiari punti di tocco, oppure che esponga gli eventi touch
 * insieme a un puntatore grossolano.
 */
export function supportsPullGesture(
  coarsePointer: boolean,
  touchPoints: number,
  hasTouchEvents = false,
): boolean {
  if (Number.isFinite(touchPoints) && touchPoints > 0) return true;
  return coarsePointer && hasTouchEvents;
}

/**
 * Posizione di scroll affidabile su iOS: a seconda della pagina e della
 * modalità (Safari o PWA da Home) lo scroll vive sul contenitore, su
 * `scrollingElement`, su `documentElement` o su `body`. Vale la posizione più
 * avanzata; il rimbalzo elastico (valori negativi) conta come "in cima".
 */
export function effectiveScrollTop(values: readonly (number | null | undefined)[]): number {
  let top = 0;
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (v > top) top = v;
  }
  return top;
}
