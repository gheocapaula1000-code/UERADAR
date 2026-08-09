import { useEffect, useState } from "react";
import { SCORE_COUNT_MS, isAnimatableScore, scoreAtProgress } from "@/lib/motion";

/**
 * Punteggio di compatibilità con conteggio breve.
 * Si anima solo su un punteggio reale (0–100); con prefers-reduced-motion o
 * dato assente mostra subito il valore, senza mai inventare numeri.
 */
export function MatchScore({ score, className = "" }: { score: unknown; className?: string }) {
  const real = isAnimatableScore(score) ? score : null;
  const [shown, setShown] = useState<number | null>(real);

  useEffect(() => {
    if (real === null) return;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setShown(real);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = (now - start) / SCORE_COUNT_MS;
      setShown(scoreAtProgress(real, progress));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [real]);

  if (real === null) return null;
  return (
    <span className={`font-semibold tabular-nums ${className}`} aria-label={`Compatibilità ${real}%`}>
      <span aria-hidden="true">{shown ?? real}%</span>
    </span>
  );
}
