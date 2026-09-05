import type { FeedResponse } from "./bandocore-types";

export const POPULATED_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type CacheDecision = "persist" | "reuse-previous" | "serve-without-persist";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

export function feedFingerprint(feed: FeedResponse): string {
  return JSON.stringify(stable(feed.bandi));
}

export type FeedCacheOptions = {
  /**
   * «Cerca nuovi Bandi»: accetta l'envelope live anche se vuoto e sovrascrive
   * un feed_cache profilo/catalogo ancora popolato. Senza questo flag un vuoto
   * valido del motore (es. nuovo abbinamento) lasciava visibili i bandi del
   * 02/09 come se fossero ancora attuali.
   */
  skipReuse?: boolean;
};

export function decideFeedCache(
  previous: FeedResponse | null,
  next: FeedResponse,
  now = Date.now(),
  options?: FeedCacheOptions,
): CacheDecision {
  if (options?.skipReuse) {
    if (next.bandi.length === 0) {
      return previous && previous.bandi.length > 0 ? "persist" : "serve-without-persist";
    }
    if (previous && feedFingerprint(previous) === feedFingerprint(next))
      return "serve-without-persist";
    return "persist";
  }
  if (next.bandi.length === 0) {
    const age = previous ? now - Date.parse(previous.fetched_at) : Infinity;
    if (
      previous &&
      previous.bandi.length > 0 &&
      Number.isFinite(age) &&
      age >= 0 &&
      age <= POPULATED_CACHE_MAX_AGE_MS
    ) return "reuse-previous";
    return "serve-without-persist";
  }
  if (previous && feedFingerprint(previous) === feedFingerprint(next))
    return "serve-without-persist";
  return "persist";
}
