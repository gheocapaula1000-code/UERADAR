import type { FeedResponse } from "./bandocore-types";

/**
 * Timestamp da mostrare in UI: il più recente tra generated_at e fetched_at.
 * Il Core può ripetere lo stesso generated_at quando il contenuto non cambia,
 * ma una rilettura dal vivo deve comunque far avanzare la data mostrata.
 * Nessuna data inventata: ISO assente o non parsabile → ignorato.
 */
export function feedUpdatedIso(
  feed: Pick<FeedResponse, "generated_at" | "fetched_at"> | null | undefined,
): string | null {
  const candidates = [feed?.generated_at, feed?.fetched_at]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0 && Number.isFinite(Date.parse(v)));
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
}

export function formatFeedUpdatedAt(iso: string, locale = "it-IT"): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString(locale);
}
