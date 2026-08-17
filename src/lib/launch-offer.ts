/**
 * Offerta lancio RADAR mensile.
 * Solo presentazione + gating del fallback Payment Link: il Price ID LIVE è
 * letto dall'ambiente (STRIPE_PRICE_PROFESSIONAL_MONTHLY_LIVE), mai hardcodato.
 * Il listino pubblico resta 249 €/mese + IVA.
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
  vatNote: "/ mese + IVA (IVA esclusa)",
  note: "Offerta lancio fino al 30 nov 2026. Prezzo bloccato 12 mesi, poi 249 €/mese + IVA.",
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
