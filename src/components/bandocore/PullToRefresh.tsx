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
 * Listener su document, indicatore fixed con colori tema, refresh via
 * router + react-query (niente reload, niente libreria esterna).
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
  const activePull = useRef(false);
  const refreshing = useRef(false);
  const distanceRef = useRef(0);
  const reducedMotion = useRef(false);
  const runRefreshRef = useRef<() => Promise<void>>(async () => {});

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
    distanceRef.current = PTR_THRESHOLD_PX;
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
      activePull.current = false;
      distanceRef.current = 0;
      setDistance(0);
      setPhase("idle");
    }
  }, [queryClient, router]);

  useEffect(() => {
    runRefreshRef.current = runRefresh;
  }, [runRefresh]);

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

    const resetIdle = () => {
      pulling.current = false;
      activePull.current = false;
      distanceRef.current = 0;
      setDistance(0);
      setPhase("idle");
    };

    const onStart = (e: TouchEvent) => {
      if (refreshing.current) return;
      if (e.touches.length !== 1) {
        resetIdle();
        return;
      }
      if (!canStartPull(readScrollTop(), false)) {
        pulling.current = false;
        activePull.current = false;
        return;
      }
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      pulling.current = true;
      activePull.current = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing.current) return;
      if (e.touches.length !== 1) {
        resetIdle();
        return;
      }

      const dy = e.touches[0].clientY - startY.current;
      const dx = e.touches[0].clientX - startX.current;

      if (!activePull.current) {
        if (!canStartPull(readScrollTop(), false)) {
          pulling.current = false;
          return;
        }
        if (!isVerticalPull(dx, dy)) return;
        activePull.current = true;
      }

      if (dy <= 0) {
        distanceRef.current = 0;
        setDistance(0);
        setPhase("idle");
        return;
      }

      if (e.cancelable) e.preventDefault();

      const d = pullDistance(dy, reducedMotion.current);
      distanceRef.current = d;
      setDistance(d);
      setPhase(phaseFor(d, false));
    };

    const onEnd = () => {
      if (!pulling.current || refreshing.current) return;
      const d = distanceRef.current;
      const wasActive = activePull.current;
      pulling.current = false;
      activePull.current = false;
      if (wasActive && shouldRefreshOnRelease(d)) {
        void runRefreshRef.current();
      } else {
        distanceRef.current = 0;
        setDistance(0);
        setPhase("idle");
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onMove, { passive: false, capture: true });
    document.addEventListener("touchend", onEnd, { passive: true, capture: true });
    document.addEventListener("touchcancel", onEnd, { passive: true, capture: true });

    return () => {
      document.documentElement.classList.remove("ptr-page-lock");
      document.removeEventListener("touchstart", onStart, true);
      document.removeEventListener("touchmove", onMove, true);
      document.removeEventListener("touchend", onEnd, true);
      document.removeEventListener("touchcancel", onEnd, true);
    };
  }, [readScrollTop]);

  const progress = pullProgress(distance);
  const label = pullLabel(phase);
  const show = phase !== "idle" || distance > 0;

  return (
    <div className="ptr-root relative w-full max-w-full">
      {enabled && show ? (
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
      ) : null}
      {children}
    </div>
  );
}
