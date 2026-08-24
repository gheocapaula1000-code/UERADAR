import type { Bando } from "./bandocore-types";
import { isHighPriorityFeed } from "./bando-status";

/**
 * Fasce Home: sportello ufficiale va in alto anche senza importo.
 * Nessuna scheda viene nascosta. Nessuna data inventata.
 */
export function splitGuidedFeedTiers(
  bandi: Bando[],
  now: number = Date.now(),
): { high: Bando[]; review: Bando[] } {
  const high: Bando[] = [];
  const review: Bando[] = [];
  for (const bando of bandi) {
    (isHighPriorityFeed(bando, now) ? high : review).push(bando);
  }
  return { high, review };
}
