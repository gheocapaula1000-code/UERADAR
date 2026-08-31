/**
 * Offerta lancio RADAR mensile — ritirata dal listino pubblico.
 * Radar non è più un piano acquistabile. Questo modulo resta solo per
 * abbonamenti già attivi e non deve essere mostrato in home, /prezzi o checkout.
 * Nessun Price ID è hardcoded.
 */
import type { BillingInterval, PlanId } from "./catalog";

/** Ultimo istante utile: 30 novembre 2026, 23:59:59 ora italiana (UTC+1). */
export const LAUNCH_OFFER_ENDS_AT = "2026-11-30T23:59:59+01:00";

export const LAUNCH_OFFER = {
  planId: "professional" as PlanId,
  interval: "month" as BillingInterval,
  /** Prezzo effettivamente addebitato durante l'offerta. */
  priceLabel: "99 €",
  /** Listino pubblico, mostrato barrato. */
  listLabel: "249 €",
  vatNote: "/ mese",
  note: "Offerta lancio fino al 30 nov 2026. Prezzo bloccato 12 mesi, poi 249 €/mese.",
} as const;

export function launchOfferActive(now: Date = new Date()): boolean {
  return now.getTime() <= Date.parse(LAUNCH_OFFER_ENDS_AT);
}

/** true solo per la card RADAR mensile, entro il 30/11/2026 incluso. */
export function launchOfferApplies(
  planId: string,
  interval: BillingInterval,
  now: Date = new Date(),
): boolean {
  return (
    planId === LAUNCH_OFFER.planId &&
    interval === LAUNCH_OFFER.interval &&
    launchOfferActive(now)
  );
}
