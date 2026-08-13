import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

/**
 * Pattern collaudato da Metodo-Civiko-One (PWA iOS).
 * Listener su document, soglia 80px, reload al rilascio.
 */
const THRESHOLD = 80;
const MAX_PULL = 140;
const RESISTANCE = 0.5;

function isScrollableAncestorScrolled(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null;
  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollTop > 0) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

export function PullToRefresh({ children }: { children: ReactNode }) {
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

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (window.scrollY > 0) return;
      if (isScrollableAncestorScrolled(e.target)) return;
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

      if (window.scrollY === 0 && e.cancelable) {
        e.preventDefault();
      }
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
        }, 150);
      } else {
        setPull(0);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  const progress = Math.min(pull / THRESHOLD, 1);
  const showIndicator = pull > 0 || refreshing;

  return (
    <div className="ptr-root relative w-full max-w-full" style={{ overscrollBehaviorY: "contain" }}>
      {showIndicator ? (
        <div
          aria-hidden
          className="pointer-events-none fixed left-0 right-0 top-0 z-[9999] flex justify-center"
          style={{
            transform: `translateY(${Math.max(pull - 40, 0)}px)`,
            transition: active.current ? "none" : "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          <div
            className="mt-3 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card shadow-elevated"
            style={{ opacity: refreshing ? 1 : 0.4 + progress * 0.6 }}
          >
            <Loader2
              className={`h-5 w-5 text-primary ${refreshing ? "animate-spin" : ""}`}
              style={{
                transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
                transition: refreshing ? undefined : "transform 60ms linear",
              }}
            />
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}
