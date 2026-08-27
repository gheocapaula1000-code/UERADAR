import type { FeedResponse } from "./bandocore-types";

/**
 * Timestamp da mostrare in UI: generated_at ufficiale se c'è, altrimenti fetched_at.
 * Nessuna data inventata: ISO assente o non parsabile → null.
 */
export function feedUpdatedIso(
  feed: Pick<FeedResponse, "generated_at" | "fetched_at"> | null | undefined,
): string | null {
  const raw =
    (typeof feed?.generated_at === "string" && feed.generated_at.trim()) ||
    (typeof feed?.fetched_at === "string" && feed.fetched_at.trim()) ||
    "";
  if (!raw) return null;
  return Number.isFinite(Date.parse(raw)) ? raw : null;
}

export function formatFeedUpdatedAt(iso: string, locale = "it-IT"): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString(locale);
}
