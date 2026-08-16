import { useCallback, useEffect, useRef, useState } from "react";
import {
  INTRO_TAGLINE,
  introDurations,
  markIntroSeen,
  shouldShowIntro,
} from "@/lib/intro";

/**
 * Apertura premium full-screen: scansione radar dell'Europa con anelli
 * concentrici e raggio oro, marchio UEradar e frase reale, poi dissolvenza.
 * Non blocca mai l'autenticazione né i dati: è un semplice overlay sopra la
 * pagina già montata, con pulsante Salta e watchdog di chiusura.
 */
export function RadarIntro() {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const close = useCallback(() => {
    clearTimers();
    setClosing(true);
    setVisible(false);
  }, []);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }

    if (!shouldShowIntro(storage, reduced)) return;
    markIntroSeen(storage);

    const { scene, fade, watchdog } = introDurations(reduced);
    setVisible(true);
    timers.current.push(setTimeout(() => setClosing(true), scene));
    timers.current.push(setTimeout(() => setVisible(false), scene + fade));
    // Watchdog: se qualcosa va storto, l'overlay sparisce comunque.
    timers.current.push(setTimeout(() => setVisible(false), watchdog));

    return clearTimers;
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, close]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Apertura UEradar in corso"
      className={`fixed inset-0 z-[120] grid place-items-center overflow-hidden bg-background ${
        closing ? "intro-fade-out pointer-events-none" : "intro-fade-in"
      }`}
    >
      <div className="absolute inset-0 gradient-hero opacity-95" aria-hidden="true" />
      <div className="relative flex flex-col items-center px-6 text-center">
        <div className="relative h-56 w-56 sm:h-72 sm:w-72" aria-hidden="true">
          {/* Anelli concentrici */}
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="intro-ring absolute inset-0 rounded-full border border-accent/30"
              style={{ animationDelay: `${i * 0.45}s` }}
            />
          ))}
          <span className="absolute inset-[18%] rounded-full border border-primary/25" />
          <span className="absolute inset-[36%] rounded-full border border-primary/20" />
          {/* Europa stilizzata */}
          <span className="absolute inset-[30%] rounded-full bg-primary/10 blur-md" />
          <span className="absolute inset-0 grid place-items-center text-4xl sm:text-5xl">🇪🇺</span>
          {/* Raggio oro */}
          <span className="intro-sweep absolute inset-0 rounded-full" />
        </div>

        <img
          src="/icons/icon-192.png"
          alt=""
          aria-hidden="true"
          width={192}
          height={192}
          className="mt-6 h-12 w-12 rounded-xl"
          decoding="async"
        />
        <p className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          UEradar.com
        </p>
        <p className="mt-2 max-w-md text-sm text-muted-foreground sm:text-base">
          {INTRO_TAGLINE}
        </p>

        <button
          type="button"
          onClick={close}
          className="tap mt-8 inline-flex items-center justify-center rounded-lg border border-border bg-card/70 px-5 py-2 text-sm font-medium text-foreground transition hover:bg-card"
        >
          Salta
        </button>
      </div>
    </div>
  );
}
