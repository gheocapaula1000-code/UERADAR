/**
 * Logica pura della navigazione inferiore (nessuna dipendenza da React).
 * Serve a garantire con i test: voce attiva corretta anche sulle sottopagine,
 * ingresso progressivo limitato e rispetto di prefers-reduced-motion.
 */

export type BottomNavItem = {
  to: "/dashboard" | "/profilo" | "/abbonamento";
  label: string;
  /** Prefissi di percorso che devono attivare la voce. */
  match: readonly string[];
};

export const BOTTOM_NAV_ITEMS: readonly BottomNavItem[] = [
  { to: "/dashboard", label: "Radar", match: ["/dashboard", "/bando"] },
  { to: "/profilo", label: "Profilo", match: ["/profilo"] },
  { to: "/abbonamento", label: "Abbonamento", match: ["/abbonamento"] },
];

/** Ingresso progressivo della barra: breve e sempre limitato. */
export const BOTTOM_NAV_ENTER_STEP_MS = 70;
export const BOTTOM_NAV_ENTER_MAX_MS = 280;

export function bottomNavEnterDelayMs(index: number, reducedMotion = false): number {
  if (reducedMotion) return 0;
  if (!Number.isFinite(index) || index <= 0) return 0;
  return Math.min(Math.floor(index) * BOTTOM_NAV_ENTER_STEP_MS, BOTTOM_NAV_ENTER_MAX_MS);
}

/** Voce attiva: match esatto o sottopagina (mai match parziale di parola). */
export function isBottomNavActive(item: BottomNavItem, pathname: string): boolean {
  if (typeof pathname !== "string" || pathname === "") return false;
  return item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Al massimo una voce attiva per volta. */
export function activeBottomNavIndex(pathname: string): number {
  return BOTTOM_NAV_ITEMS.findIndex((item) => isBottomNavActive(item, pathname));
}
