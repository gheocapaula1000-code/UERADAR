import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  PTR_MIN_SPIN_MS,
  PTR_THRESHOLD_PX,
  PTR_WATCHDOG_MS,
  canStartPull,
  effectiveScrollTop,
  isVerticalPull,
  phaseFor,
  pullDistance,
  pullLabel,
  pullProgress,
  shouldRefreshOnRelease,
  supportsPullGesture,
  type PtrPhase,
} from "@/lib/pull-to-refresh";

/**
 * Tira-per-aggiornare nativo per area riservata / PWA iOS.
 * - Listener su document (header sticky non intercetta il gesto)
 * - Scroll top da window + scrollingElement + documentElement + body
 * - Indicatore fixed visibile (colori tema, non hsl rotti su oklch)
 * - preventDefault solo mentre si sta davvero tirando
 * - Aggiorna router + react-query, senza reload di pagina
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<PtrPhase>("idle");
  const [distance, setDistance] = useState(0);
  const [enabled, setEnabled] = useState(false);

  const startY = useRef(0);
  const startX = useRef(0);
  const pulling = useRef(false);
  const refreshing = useRef(false);
  const reducedMotion = useRef(false);

  const readScrollTop = useCallback(() => {
    return effectiveScrollTop([
      window.scrollY,
      window.pageYOffset,
      document.scrollingElement?.scrollTop,
      document.documentElement?.scrollTop,
      document.body?.scrollTop,
    ]);
  }, []);

  const runRefresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setPhase("refreshing");
    setDistance(PTR_THRESHOLD_PX);
    const started = Date.now();
    try {
      await Promise.race([
        Promise.all([router.invalidate(), queryClient.invalidateQueries()]),
        new Promise((r) => setTimeout(r, PTR_WATCHDOG_MS)),
      ]);
    } catch {
      // rete fallita: chiudi comunque l'indicatore
    } finally {
      const rest = Math.max(0, PTR_MIN_SPIN_MS - (Date.now() - started));
      await new Promise((r) => setTimeout(r, rest));
      refreshing.current = false;
      pulling.current = false;
      setDistance(0);
      setPhase("idle");
    }
  }, [queryClient, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const touchOk = supportsPullGesture(
      window.matchMedia?.("(pointer: coarse)").matches ?? false,
      window.navigator.maxTouchPoints ?? 0,
      "ontouchstart" in window,
    );
    if (!touchOk) return;
    setEnabled(true);

    reducedMotion.current =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    document.documentElement.classList.add("ptr-page-lock");

    const onStart = (e: TouchEvent) => {
      if (refreshing.current) return;
      if (e.touches.length !== 1) {
        pulling.current = false;
        setDistance(0);
        setPhase("idle");
        return;
      }
      if (!canStartPull(readScrollTop(), false)) {
        pulling.current = false;
        return;
      }
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      pulling.current = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing.current) return;
      if (e.touches.length !== 1) {
        pulling.current = false;
        setDistance(0);
        setPhase("idle");
        return;
      }
      // Se l'utente ha scrollato via dalla cima, abbandona.
      if (!canStartPull(readScrollTop(), false) && distance <= 0) {
        pulling.current = false;
        setDistance(0);
        setPhase("idle");
        return;
      }

      const dy = e.touches[0].clientY - startY.current;
      const dx = e.touches[0].clientX - startX.current;
      if (!isVerticalPull(dx, dy) && dy < 12) return;
      if (dy <= 0) {
        setDistance(0);
        setPhase("idle");
        return;
      }

      // Solo qui blocchiamo il bounce nativo di Safari.
      if (e.cancelable) e.preventDefault();

      const d = pullDistance(dy, reducedMotion.current);
      setDistance(d);
      setPhase(phaseFor(d, false));
    };

    const onEnd = () => {
      if (!pulling.current || refreshing.current) return;
      const d = distance;
      pulling.current = false;
      if (shouldRefreshOnRelease(d)) {
        void runRefresh();
      } else {
        setDistance(0);
        setPhase("idle");
      }
    };

    // touchmove non-passive solo se necessario: registrato sempre passive:false
    // ma preventDefault solo quando stiamo tirando (vedi onMove).
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });

    return () => {
      document.documentElement.classList.remove("ptr-page-lock");
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
    // distance in onEnd: usiamo ref-synced state via closure; re-bind on distance
    // would thrash. Keep distance via ref for release decision.
  }, [distance, readScrollTop, runRefresh]);

  // Release usa distance dallo state aggiornato nel move — per evitare stale
  // closure sul touchend, teniamo anche un ref.
  const distanceRef = useRef(0);
  useEffect(() => {
    distanceRef.current = distance;
  }, [distance]);

  // Re-bind touchend con distanceRef (fix stale closure sopra).
  useEffect(() => {
    if (!enabled) return;

    const onEnd = () => {
      if (!pulling.current || refreshing.current) return;
      const d = distanceRef.current;
      pulling.current = false;
      if (shouldRefreshOnRelease(d)) {
        void runRefresh();
      } else {
        setDistance(0);
        setPhase("idle");
      }
    };

    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, runRefresh]);

  const progress = pullProgress(distance);
  const label = pullLabel(phase);
  const show = phase !== "idle" || distance > 0;

  return (
    <div className="ptr-root relative w-full max-w-full">
      {enabled && show && (
        <div
          className="ptr-indicator pointer-events-none fixed left-0 right-0 z-50 flex flex-col items-center"
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 3.25rem)",
            opacity: phase === "refreshing" ? 1 : Math.min(1, 0.35 + progress * 0.65),
            transform: `translate3d(0, ${Math.max(0, distance * 0.25)}px, 0)`,
          }}
          aria-live="polite"
          aria-busy={phase === "refreshing"}
        >
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-foreground shadow-elevated">
            <span
              className={`ptr-spin inline-block h-5 w-5 rounded-full border-2 border-primary border-t-transparent ${
                phase === "refreshing" && !reducedMotion.current ? "animate-spin" : ""
              }`}
              style={{
                transform:
                  phase === "refreshing"
                    ? undefined
                    : `rotate(${Math.round(progress * 270)}deg)`,
              }}
              aria-hidden
            />
            {label ? <span className="text-xs font-semibold">{label}</span> : null}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
