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

export function decideFeedCache(
  previous: FeedResponse | null,
  next: FeedResponse,
  now = Date.now(),
): CacheDecision {
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
