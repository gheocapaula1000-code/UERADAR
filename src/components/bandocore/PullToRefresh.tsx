import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  PTR_MIN_SPIN_MS,
  PTR_THRESHOLD_PX,
  PTR_MAX_PULL_PX,
  PTR_WATCHDOG_MS,
  canStartPull,
  effectiveScrollTop,
  pullLabel,
  supportsPullGesture,
} from "@/lib/pull-to-refresh";

/**
 * "Tira per aggiornare" per l'area riservata.
 * Usa pulltorefreshjs: gestisce in modo affidabile il rimbalzo elastico di
 * Safari su iPhone, anche in PWA installata dalla schermata Home.
 * Il gesto parte solo dall'alto della pagina e solo su dispositivi con tocco;
 * lo scroll normale resta sempre nativo.
 * L'aggiornamento ricarica i dati della pagina corrente (loader + cache),
 * senza toccare la logica di business.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const refreshing = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const touch = supportsPullGesture(
      window.matchMedia?.("(pointer: coarse)").matches ?? false,
      window.navigator.maxTouchPoints ?? 0,
      "ontouchstart" in window,
    );
    if (!touch) return;

    let disposed = false;
    let destroy: (() => void) | undefined;

    void import("pulltorefreshjs").then((mod) => {
      if (disposed) return;
      const PullToRefreshLib = mod.default ?? mod;

      const instance = PullToRefreshLib.init({
        mainElement: "body",
        triggerElement: "body",
        distThreshold: PTR_THRESHOLD_PX,
        distMax: PTR_MAX_PULL_PX,
        distReload: PTR_THRESHOLD_PX,
        instructionsPullToRefresh: pullLabel("pulling"),
        instructionsReleaseToRefresh: pullLabel("ready"),
        instructionsRefreshing: pullLabel("refreshing"),
        iconArrow: "&#8595;",
        iconRefreshing: "&#10227;",
        shouldPullToRefresh: () =>
          canStartPull(
            effectiveScrollTop([
              window.scrollY,
              document.scrollingElement?.scrollTop,
              document.documentElement?.scrollTop,
              document.body?.scrollTop,
            ]),
            refreshing.current,
          ),
        onRefresh: async () => {
          refreshing.current = true;
          const started = Date.now();
          try {
            await Promise.race([
              Promise.all([router.invalidate(), queryClient.invalidateQueries()]),
              new Promise((r) => setTimeout(r, PTR_WATCHDOG_MS)),
            ]);
          } catch {
            // Un errore di rete non deve lasciare l'indicatore bloccato.
          } finally {
            const rest = Math.max(0, PTR_MIN_SPIN_MS - (Date.now() - started));
            await new Promise((r) => setTimeout(r, rest));
            refreshing.current = false;
          }
        },
      });

      destroy = () => instance.destroy();
    });

    return () => {
      disposed = true;
      destroy?.();
    };
  }, [queryClient, router]);

  return <div className="ptr-root relative w-full max-w-full">{children}</div>;
}
