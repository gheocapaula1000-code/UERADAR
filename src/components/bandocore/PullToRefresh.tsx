import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

/**
 * Pull-to-refresh per PWA iOS.
 * Lo scroll vive sul contenitore (ref), non su window: su iOS standalone
 * window.scrollY è inaffidabile con header sticky + bottom nav.
 *
 * I tap su link e pulsanti (es. Genera dossier) non devono mai avviare
 * il gesto: altrimenti preventDefault su touchmove mangia il click.
 */
const THRESHOLD = 56;
const MAX_PULL = 120;
const RESISTANCE = 0.55;
const PULL_LOCK = 12;

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest("a, button, input, textarea, select, label, [role='button'], [role='link']"),
  );
}

export function PullToRefresh({ children }: { children: ReactNode }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const startX = useRef<number | null>(null);
  const active = useRef(false);
  const cancelled = useRef(false);
  const pullRef = useRef(0);

  useEffect(() => {
    pullRef.current = pull;
  }, [pull]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasTouch = "ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0;
    if (!hasTouch) return;

    const el = scrollerRef.current;
    if (!el) return;

    const atTop = () => {
      const a = el.scrollTop;
      const b = window.scrollY || window.pageYOffset || 0;
      const c = document.scrollingElement?.scrollTop ?? 0;
      const d = document.documentElement?.scrollTop ?? 0;
      const e = document.body?.scrollTop ?? 0;
      return Math.max(a, b, c, d, e) <= 2;
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (!atTop()) return;
      if (isInteractiveTarget(e.target)) return;
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      active.current = true;
      cancelled.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active.current || startY.current === null || startX.current === null) return;
      if (cancelled.current) return;
      const dy = e.touches[0].clientY - startY.current;
      const dx = e.touches[0].clientX - startX.current;

      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        cancelled.current = true;
        active.current = false;
        setPull(0);
        return;
      }

      if (dy <= 0) {
        setPull(0);
        return;
      }

      if (!atTop()) {
        active.current = false;
        setPull(0);
        return;
      }

      // Sotto PULL_LOCK è ancora un tap: non bloccare il click.
      if (dy < PULL_LOCK) return;

      if (e.cancelable) e.preventDefault();
      setPull(Math.min(dy * RESISTANCE, MAX_PULL));
    };

    const onTouchEnd = () => {
      if (!active.current) {
        setPull(0);
        return;
      }
      active.current = false;
      const current = pullRef.current;
      startY.current = null;
      startX.current = null;
      if (current >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD);
        window.setTimeout(() => {
          window.location.reload();
        }, 120);
      } else {
        setPull(0);
      }
    };

    const optsStart = { passive: true, capture: true } as const;
    const optsMove = { passive: false, capture: true } as const;
    const optsEnd = { passive: true, capture: true } as const;

    el.addEventListener("touchstart", onTouchStart, optsStart);
    el.addEventListener("touchmove", onTouchMove, optsMove);
    el.addEventListener("touchend", onTouchEnd, optsEnd);
    el.addEventListener("touchcancel", onTouchEnd, optsEnd);
    document.addEventListener("touchstart", onTouchStart, optsStart);
    document.addEventListener("touchmove", onTouchMove, optsMove);
    document.addEventListener("touchend", onTouchEnd, optsEnd);
    document.addEventListener("touchcancel", onTouchEnd, optsEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart, true);
      el.removeEventListener("touchmove", onTouchMove, true);
      el.removeEventListener("touchend", onTouchEnd, true);
      el.removeEventListener("touchcancel", onTouchEnd, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
    };
  }, []);

  const progress = Math.min(pull / THRESHOLD, 1);
  const showIndicator = pull > 0 || refreshing;

  return (
    <div
      ref={scrollerRef}
      className="ptr-root relative w-full max-w-full flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
      style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
    >
      {showIndicator ? (
        <div
          aria-hidden
          className="pointer-events-none fixed left-0 right-0 top-0 z-[9999] flex justify-center"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            transform: `translateY(${Math.max(pull - 24, 0)}px)`,
            transition: active.current ? "none" : "transform 200ms ease-out",
          }}
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-primary bg-card shadow-elevated"
            style={{ opacity: refreshing ? 1 : 0.45 + progress * 0.55 }}
          >
            <Loader2
              className={`h-6 w-6 text-primary ${refreshing ? "animate-spin" : ""}`}
              style={{
                transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
              }}
            />
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}
