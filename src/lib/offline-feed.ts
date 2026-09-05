import type { FeedResponse, FeedView } from "./bandocore-types";
import { POPULATED_CACHE_MAX_AGE_MS } from "./feed-cache-policy";

const PROFILE_KEY = "ueradar:last-feed:v1";
const CATALOG_KEY = "ueradar:last-catalog:v1";
const MAX_AGE_MS = POPULATED_CACHE_MAX_AGE_MS;

export function offlineFeedKey(view: FeedView = "profile"): string {
  return view === "catalog" ? CATALOG_KEY : PROFILE_KEY;
}

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredFeed = {
  version: 1;
  savedAt: string;
  feed: FeedResponse;
};

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function validFeed(value: unknown): value is FeedResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FeedResponse>;
  return Array.isArray(candidate.bandi) && typeof candidate.fetched_at === "string";
}

export function saveOfflineFeed(
  feed: FeedResponse,
  storage: StorageLike | null = browserStorage(),
  view: FeedView = feed.view === "catalog" ? "catalog" : "profile",
): void {
  if (!storage || !validFeed(feed)) return;
  const snapshot: StoredFeed = {
    version: 1,
    savedAt: new Date().toISOString(),
    feed: { ...feed, source: "cache", view },
  };
  try {
    storage.setItem(offlineFeedKey(view), JSON.stringify(snapshot));
  } catch {
    // Quota o storage privato: il feed online continua a funzionare.
  }
}

export function clearOfflineFeed(
  storage: StorageLike | null = browserStorage(),
  view: FeedView = "profile",
): void {
  if (!storage) return;
  try {
    storage.removeItem(offlineFeedKey(view));
  } catch {
    // Storage non disponibile: il tentativo live continua comunque.
  }
}

export function loadOfflineFeed(
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
  view: FeedView = "profile",
): FeedResponse | null {
  if (!storage) return null;
  const key = offlineFeedKey(view);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredFeed>;
    const savedAt = Date.parse(parsed.savedAt ?? "");
    if (
      parsed.version !== 1 ||
      !Number.isFinite(savedAt) ||
      now - savedAt > MAX_AGE_MS ||
      !validFeed(parsed.feed)
    ) {
      storage.removeItem(key);
      return null;
    }
    return { ...parsed.feed, source: "cache", view };
  } catch {
    storage.removeItem(key);
    return null;
  }
}
