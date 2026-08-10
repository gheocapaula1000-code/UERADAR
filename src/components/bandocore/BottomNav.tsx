import { Link, useRouterState } from "@tanstack/react-router";
import { Radar, Building2, CreditCard } from "lucide-react";
import { useEffect, useState } from "react";
import {
  BOTTOM_NAV_ITEMS,
  activeBottomNavIndex,
  bottomNavEnterDelayMs,
  isBottomNavActive,
} from "@/lib/bottom-nav";
import { INTRO_FADE_MS, INTRO_SCENE_MS } from "@/lib/intro";

const ICONS = {
  "/dashboard": Radar,
  "/profilo": Building2,
  "/abbonamento": CreditCard,
} as const;

/**
 * Navigazione inferiore fissa, presente su mobile e desktop.
 * L'ingresso è coordinato con la fine dell'apertura radar: la barra sale
 * dal basso con un ritardo progressivo per voce, neutralizzato da
 * prefers-reduced-motion. Non contiene logica di business.
 */
export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeIndex = activeBottomNavIndex(pathname);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let introPending = false;
    try {
      introPending = window.sessionStorage.getItem("ueradar:intro-seen:v1") !== "1";
    } catch {
      introPending = false;
    }

    if (reduced) {
      setEntered(true);
      return;
    }

    // Se l'apertura radar è appena partita, la barra entra alla dissolvenza.
    const delay = introPending ? INTRO_SCENE_MS + INTRO_FADE_MS : 80;
    const t = setTimeout(() => setEntered(true), delay);
    return () => clearTimeout(t);
  }, []);

  return (
    <nav
      aria-label="Navigazione principale"
      className="safe-x safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/85 backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around gap-1 px-2 py-1.5 lg:max-w-lg">
        {BOTTOM_NAV_ITEMS.map((item, i) => {
          const active = isBottomNavActive(item, pathname);
          const Icon = ICONS[item.to];
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                style={{ animationDelay: `${bottomNavEnterDelayMs(i)}ms` }}
                className={`tap bottom-nav-item touch-manipulation select-none ${entered ? "bottom-nav-enter" : "opacity-0"} relative flex w-full flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium sm:text-xs ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="bottom-nav-pill absolute inset-0 rounded-xl bg-primary/10 ring-1 ring-primary/25"
                  />
                )}
                <Icon className={`relative h-5 w-5 ${active ? "bottom-nav-icon-active" : ""}`} />
                <span className="relative leading-none">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {activeIndex >= 0 && <span className="sr-only">Sezione corrente attiva</span>}
    </nav>
  );
}
