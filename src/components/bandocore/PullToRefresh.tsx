import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  PTR_MAX_PULL_PX,
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
  const [dragging, setDragging] = useState(false);

  const refreshingRef = useRef(false);
  const distanceRef = useRef(0);
  const startY = useRef(0);
  const startX = useRef(0);
  const tracking = useRef(false);
  const pulling = useRef(false);

  /**
   * Su iOS il rimbalzo elastico di Safari ruba il gesto: finché il pannello è
   * montato (solo su dispositivi con tocco) l'overscroll verticale della
   * pagina resta confinato. Su desktop la classe non viene mai applicata.
   */
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.add("ptr-page-lock");
    return () => root.classList.remove("ptr-page-lock");
  }, [enabled]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setEnabled(
      supportsPullGesture(
        window.matchMedia("(pointer: coarse)").matches,
        window.navigator.maxTouchPoints ?? 0,
        "ontouchstart" in window,
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
      if (typeof window === "undefined") return el.scrollTop;
      // iOS: lo scroll può vivere sul contenitore, su scrollingElement,
      // su documentElement o su body a seconda di Safari o PWA da Home.
      return effectiveScrollTop([
        el.scrollTop,
        window.scrollY,
        document.scrollingElement?.scrollTop,
        document.documentElement?.scrollTop,
        document.body?.scrollTop,
      ]);
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      // L'header sticky è fuori dal contenitore: il gesto deve poter partire
      // anche da lì, purché la pagina sia in cima. L'overlay RadarIntro blocca
      // già i tocchi mentre è visibile: nessun gate su sessionStorage.
      if (!canStartPull(scrollTop(), refreshingRef.current)) return;
      tracking.current = true;
      pulling.current = false;
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking.current) return;
      if (e.touches.length !== 1) {
        tracking.current = false;
        pulling.current = false;
        setDragging(false);
        if (!refreshingRef.current) applyDistance(0);
        return;
      }
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
        setDragging(true);
      }

      // preventDefault solo mentre si sta davvero tirando.
      if (e.cancelable) e.preventDefault();
      applyDistance(pullDistance(dy, reduced));
    };

    const finish = () => {
      if (!tracking.current) return;
      const wasPulling = pulling.current;
      tracking.current = false;
      pulling.current = false;
      setDragging(false);
      if (!wasPulling) return;
      if (shouldRefreshOnRelease(distanceRef.current)) void runRefresh();
      else applyDistance(0);
    };

    const cancel = () => {
      tracking.current = false;
      pulling.current = false;
      setDragging(false);
      if (!refreshingRef.current) applyDistance(0);
    };

    // Listener sul documento: l'header sticky e le aree fuori dal contenitore
    // non devono impedire l'avvio del gesto quando la pagina è in cima.
    const target: EventTarget = typeof document === "undefined" ? el : document;
    target.addEventListener("touchstart", onStart as EventListener, { passive: true });
    target.addEventListener("touchmove", onMove as EventListener, { passive: false });
    target.addEventListener("touchend", finish as EventListener, { passive: true });
    target.addEventListener("touchcancel", cancel as EventListener, { passive: true });
    return () => {
      target.removeEventListener("touchstart", onStart as EventListener);
      target.removeEventListener("touchmove", onMove as EventListener);
      target.removeEventListener("touchend", finish as EventListener);
      target.removeEventListener("touchcancel", cancel as EventListener);
    };
  }, [applyDistance, enabled, reduced, runRefresh]);

  const phase: PtrPhase = phaseFor(distance, refreshing);
  const progress = refreshing ? 1 : pullProgress(distance);
  const label = pullLabel(phase);
  const offset = reduced ? 0 : Math.min(distance, PTR_MAX_PULL_PX);

  return (
    <div ref={containerRef} className="ptr-root relative w-full max-w-full">
      <div
        aria-hidden={phase === "idle"}
        className="ptr-indicator pointer-events-none fixed inset-x-0 z-50 flex justify-center"
        style={{
          transform: `translate3d(0, ${Math.max(0, Math.min(offset, PTR_MAX_PULL_PX) * 0.5)}px, 0)`,
          opacity: phase === "idle" ? 0 : 1,
          visibility: phase === "idle" ? "hidden" : "visible",
          transition: dragging ? "none" : "opacity 160ms ease, transform 200ms ease",
        }}
      >
        <div className="ptr-badge flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 shadow-2xl">
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
          <span className="text-xs font-semibold text-foreground">{label}</span>
        </div>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {phase === "refreshing" ? "Aggiornamento in corso" : ""}
      </div>

      <div
        className="ptr-content"
        style={{
          transform: `translate3d(0, ${offset}px, 0)`,
          transition:
            dragging || reduced ? "none" : "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
