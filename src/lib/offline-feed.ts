import type { FeedResponse } from "./bandocore-types";

const KEY = "ueradar:last-feed:v1";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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
): void {
  if (!storage || !validFeed(feed)) return;
  const snapshot: StoredFeed = {
    version: 1,
    savedAt: new Date().toISOString(),
    feed: { ...feed, source: "cache" },
  };
  try {
    storage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Quota o storage privato: il feed online continua a funzionare.
  }
}

export function loadOfflineFeed(
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
): FeedResponse | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredFeed>;
    const savedAt = Date.parse(parsed.savedAt ?? "");
    if (
      parsed.version !== 1 ||
      !Number.isFinite(savedAt) ||
      now - savedAt > MAX_AGE_MS ||
      !validFeed(parsed.feed)
    ) {
      storage.removeItem(KEY);
      return null;
    }
    return { ...parsed.feed, source: "cache" };
  } catch {
    storage.removeItem(KEY);
    return null;
  }
}
