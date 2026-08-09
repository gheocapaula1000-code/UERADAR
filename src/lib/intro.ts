/**
 * Logica pura dell'apertura premium (radar Europa) mostrata sopra la dashboard.
 * Nessuna dipendenza da React: così i test possono verificare durate,
 * "una sola volta per sessione", watchdog e prefers-reduced-motion.
 */

export const INTRO_STORAGE_KEY = "ueradar:intro-seen:v1";

/** Durata della scena prima della dissolvenza (entro i 2–3 secondi richiesti). */
export const INTRO_SCENE_MS = 2400;
/** Durata della dissolvenza verso la dashboard. */
export const INTRO_FADE_MS = 420;
/** Watchdog: oltre questo limite l'overlay si chiude comunque. */
export const INTRO_WATCHDOG_MS = 4000;

/** Frase reale mostrata nell'apertura (nessun dato inventato). */
export const INTRO_TAGLINE =
  "Cinque livelli di ricerca: locale, provinciale, regionale, nazionale ed europeo.";

export function introDurations(reducedMotion: boolean) {
  if (reducedMotion) return { scene: 0, fade: 0, watchdog: 0 };
  return { scene: INTRO_SCENE_MS, fade: INTRO_FADE_MS, watchdog: INTRO_WATCHDOG_MS };
}

/** Il watchdog deve sempre superare scena + dissolvenza. */
export function watchdogIsSafe(): boolean {
  return INTRO_WATCHDOG_MS > INTRO_SCENE_MS + INTRO_FADE_MS;
}

type MaybeStorage = Pick<Storage, "getItem" | "setItem"> | null | undefined;

/** Mostrata una sola volta per sessione; qualunque errore di storage = non bloccare. */
export function shouldShowIntro(storage: MaybeStorage, reducedMotion = false): boolean {
  if (reducedMotion) return false;
  if (!storage) return false;
  try {
    return storage.getItem(INTRO_STORAGE_KEY) !== "1";
  } catch {
    return false;
  }
}

export function markIntroSeen(storage: MaybeStorage): void {
  if (!storage) return;
  try {
    storage.setItem(INTRO_STORAGE_KEY, "1");
  } catch {
    // Best-effort: l'apertura non deve mai bloccare l'accesso alla dashboard.
  }
}
