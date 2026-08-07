import { describe, expect, it } from "vitest";
import type { FeedResponse } from "../bandocore-types";
import { loadOfflineFeed, saveOfflineFeed, type StorageLike } from "../offline-feed";

function memory(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("snapshot offline UEradar.com", () => {
  it("salva e rilegge l'ultimo feed senza modificarne i bandi", () => {
    const storage = memory();
    const feed: FeedResponse = {
      bandi: [],
      fetched_at: new Date().toISOString(),
      source: "central-core",
    };
    saveOfflineFeed(feed, storage);
    expect(loadOfflineFeed(storage)?.bandi).toEqual([]);
    expect(loadOfflineFeed(storage)?.source).toBe("cache");
  });

  it("scarta snapshot più vecchi di 30 giorni", () => {
    const storage = memory();
    saveOfflineFeed({ bandi: [], fetched_at: "2026-01-01T00:00:00Z", source: "cache" }, storage);
    expect(loadOfflineFeed(storage, Date.now() + 31 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});
