/**
 * Contratto viewport per Radar Bandi su iPhone (PWA).
 * Lo scroll deve restare solo verticale: nessun rubber-band orizzontale.
 */

/** Viewport iPhone di riferimento (iPhone 14/15 logico). */
export const IPHONE_DASHBOARD_VIEWPORT = { width: 390, height: 844 } as const;

/**
 * Overflow orizzontale: scrollWidth supera la larghezza visibile
 * (1px di tolleranza, come nell'audit Playwright).
 */
export function hasHorizontalOverflow(scrollWidth: number, innerWidth: number): boolean {
  if (!Number.isFinite(scrollWidth) || !Number.isFinite(innerWidth)) return true;
  if (innerWidth <= 0) return true;
  return scrollWidth > innerWidth + 1;
}

/** Dashboard autenticata a 390px: nessun scroll orizzontale. */
export function dashboardIphoneOverflowOk(scrollWidth: number): boolean {
  return !hasHorizontalOverflow(scrollWidth, IPHONE_DASHBOARD_VIEWPORT.width);
}
