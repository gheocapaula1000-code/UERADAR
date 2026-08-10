import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { INTRO_STORAGE_KEY } from "@/lib/intro";
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
  type PtrPhase,
} from "@/lib/pull-to-refresh";

const RING = 2 * Math.PI * 13;

/**
 * "Tira per aggiornare" per l'area riservata.
 * Il gesto parte solo dall'alto della pagina, solo su dispositivi con tocco e
 * mai durante l'apertura radar: lo scroll normale resta sempre nativo.
 * L'aggiornamento ricarica i dati della pagina corrente (loader + cache),
 * senza toccare la logica di business.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const refreshingRef = useRef(false);
  const distanceRef = useRef(0);
  const startY = useRef(0);
  const startX = useRef(0);
  const tracking = useRef(false);
  const pulling = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setEnabled(
      supportsPullGesture(
        window.matchMedia("(pointer: coarse)").matches,
        window.navigator.maxTouchPoints ?? 0,
      ),
    );
  }, []);

  const applyDistance = useCallback((d: number) => {
    distanceRef.current = d;
    setDistance(d);
  }, []);

  const runRefresh = useCallback(async () => {
    refreshingRef.current = true;
    setRefreshing(true);
    applyDistance(PTR_THRESHOLD_PX);
    const started = Date.now();
    const watchdog = setTimeout(() => {
      refreshingRef.current = false;
      setRefreshing(false);
      applyDistance(0);
    }, PTR_WATCHDOG_MS);
    try {
      await Promise.all([
        router.invalidate(),
        queryClient.invalidateQueries(),
      ]);
    } catch {
      // Un errore di rete non deve lasciare l'indicatore bloccato.
    } finally {
      clearTimeout(watchdog);
      const rest = Math.max(0, PTR_MIN_SPIN_MS - (Date.now() - started));
      setTimeout(() => {
        refreshingRef.current = false;
        setRefreshing(false);
        applyDistance(0);
      }, rest);
    }
  }, [applyDistance, queryClient, router]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const scrollTop = () => {
      const own = el.scrollTop;
      const page =
        typeof window === "undefined"
          ? 0
          : window.scrollY || document.documentElement.scrollTop || 0;
      return Math.max(own, page);
    };

    const introPending = () => {
      try {
        return window.sessionStorage.getItem(INTRO_STORAGE_KEY) !== "1";
      } catch {
        return false;
      }
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (!canStartPull(scrollTop(), refreshingRef.current, introPending())) return;
      tracking.current = true;
      pulling.current = false;
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking.current) return;
      const dy = e.touches[0].clientY - startY.current;
      const dx = e.touches[0].clientX - startX.current;

      if (!pulling.current) {
        if (!isVerticalPull(dx, dy)) {
          // Swipe orizzontale o risalita: lo scroll resta nativo.
          if (dy < 0 || Math.abs(dx) > Math.abs(dy)) tracking.current = false;
          return;
        }
        if (scrollTop() > 0) {
          tracking.current = false;
          return;
        }
        pulling.current = true;
      }

      if (e.cancelable) e.preventDefault();
      applyDistance(pullDistance(dy, reduced));
    };

    const finish = () => {
      if (!tracking.current) return;
      const wasPulling = pulling.current;
      tracking.current = false;
      pulling.current = false;
      if (!wasPulling) return;
      if (shouldRefreshOnRelease(distanceRef.current)) void runRefresh();
      else applyDistance(0);
    };

    const cancel = () => {
      tracking.current = false;
      pulling.current = false;
      if (!refreshingRef.current) applyDistance(0);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", finish, { passive: true });
    el.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", finish);
      el.removeEventListener("touchcancel", cancel);
    };
  }, [applyDistance, enabled, reduced, runRefresh]);

  const phase: PtrPhase = phaseFor(distance, refreshing);
  const progress = refreshing ? 1 : pullProgress(distance);
  const label = pullLabel(phase);
  const offset = reduced ? 0 : Math.min(distance, PTR_MAX_PULL_PX);

  return (
    <div ref={containerRef} className="ptr-root relative flex-1 min-h-0 overflow-y-auto">
      <div
        aria-hidden={phase === "idle"}
        className="ptr-indicator pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center"
        style={{
          transform: `translate3d(0, ${Math.max(0, offset - 44)}px, 0)`,
          opacity: phase === "idle" ? 0 : 1,
        }}
      >
        <div className="ptr-badge mt-2 flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-2 shadow-xl backdrop-blur-xl">
          <svg viewBox="0 0 32 32" className={`h-6 w-6 ${phase === "refreshing" && !reduced ? "ptr-spin" : ""}`}>
            <circle cx="16" cy="16" r="13" fill="none" strokeWidth="3" className="stroke-border" />
            <circle
              cx="16"
              cy="16"
              r="13"
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              className={phase === "ready" || phase === "refreshing" ? "stroke-primary" : "stroke-muted-foreground"}
              strokeDasharray={RING}
              strokeDashoffset={RING * (1 - (phase === "refreshing" ? 0.75 : progress))}
              transform="rotate(-90 16 16)"
              style={{ transition: reduced ? "none" : "stroke-dashoffset 120ms linear" }}
            />
          </svg>
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {phase === "refreshing" ? "Aggiornamento in corso" : ""}
      </div>

      <div
        className="ptr-content"
        style={{
          transform: `translate3d(0, ${offset}px, 0)`,
          transition: tracking.current || reduced ? "none" : "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
