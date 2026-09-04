import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { feedMarker, runBoundedRefresh } from "../feed-refresh";
import type { FeedResponse } from "../bandocore-types";

const feed = (over: Partial<FeedResponse> = {}): FeedResponse => ({
  bandi: [{ id: "a" }] as FeedResponse["bandi"],
  fetched_at: "2026-08-06T10:00:00.000Z",
  source: "central-core",
  ...over,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function run<T>(p: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(60_000);
  return p;
}

describe("feedMarker", () => {
  it("usa generated_at quando disponibile", () => {
    expect(feedMarker(feed({ generated_at: "x" }))).toBe("g:x");
  });
  it("ignora fetched_at e source (nessun falso positivo)", () => {
    expect(feedMarker(feed())).toBe(feedMarker(feed({ fetched_at: "2026-08-06T11:00:00Z" })));
    expect(feedMarker(feed())).toBe(
      feedMarker(feed({ source: "cache", fetched_at: "2026-08-07T00:00:00Z" })),
    );
  });
  it("cambia se cambia il contenuto stabile", () => {
    expect(feedMarker(feed())).not.toBe(
      feedMarker(feed({ bandi: [{ id: "b" }] as FeedResponse["bandi"] })),
    );
    expect(feedMarker(feed())).not.toBe(
      feedMarker(feed({
        bandi: [{ id: "a", last_verified_at: "2026-08-06T12:00:00Z" }] as FeedResponse["bandi"],
      })),
    );
  });
  it("feed assente → marker vuoto (fail-closed)", () => {
    expect(feedMarker(null)).toBe("");
  });
});

describe("runBoundedRefresh", () => {
  it("accoda una sola volta e si ferma al primo marker nuovo", async () => {
    const enqueue = vi.fn().mockResolvedValue({ queued: true });
    const fresh = feed({ bandi: [{ id: "z" }] as FeedResponse["bandi"] });
    const fetchFeed = vi.fn().mockResolvedValue(fresh);
    const res = await run(
      runBoundedRefresh({ enqueue, fetchFeed, baselineMarker: feedMarker(feed()) }),
    );
    expect(res.status).toBe("updated");
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(fetchFeed).toHaveBeenCalledTimes(1);
    expect(res.enqueued).toBe(1);
  });

  it("polling bounded: marker invariato → queued, cache preservata, nessun re-enqueue", async () => {
    const enqueue = vi.fn().mockResolvedValue({ queued: true });
    // Tre risposte semanticamente identiche ma con fetched_at/source diversi.
    const fetchFeed = vi
      .fn()
      .mockResolvedValueOnce(feed({ fetched_at: "2026-08-06T10:00:01.000Z" }))
      .mockResolvedValueOnce(feed({ fetched_at: "2026-08-06T10:00:02.000Z", source: "cache" }))
      .mockResolvedValueOnce(feed({ fetched_at: "2026-08-06T10:00:03.000Z" }));
    const res = await run(
      runBoundedRefresh({ enqueue, fetchFeed, baselineMarker: feedMarker(feed()) }),
    );
    expect(res.status).toBe("queued");
    expect(res.feed).toBeUndefined();
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(fetchFeed).toHaveBeenCalledTimes(3);
  });

  it("errori transitori del feed non causano re-enqueue né loop", async () => {
    const enqueue = vi.fn().mockResolvedValue({ queued: true });
    const fetchFeed = vi.fn().mockRejectedValue(new Error("boom"));
    const res = await run(runBoundedRefresh({ enqueue, fetchFeed, baselineMarker: "base" }));
    expect(res.status).toBe("queued");
    expect(res.attempts).toBe(3);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("enqueue fallito → failed senza alcun fetch", async () => {
    const fetchFeed = vi.fn();
    const res = await run(
      runBoundedRefresh({
        enqueue: vi.fn().mockRejectedValue(new Error("REFRESH_QUEUE_FAILED")),
        fetchFeed,
        baselineMarker: "base",
      }),
    );
    expect(res.status).toBe("failed");
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("abort (unmount) ferma il polling", async () => {
    const controller = new AbortController();
    const enqueue = vi.fn().mockResolvedValue({ queued: true });
    const fetchFeed = vi.fn().mockResolvedValue(feed());
    const promise = runBoundedRefresh({
      enqueue,
      fetchFeed,
      baselineMarker: feedMarker(feed()),
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    const res = await run(promise);
    expect(res.status).toBe("aborted");
    expect(fetchFeed).not.toHaveBeenCalled();
  });

  it("non accoda nulla se già abortito prima di partire", async () => {
    const controller = new AbortController();
    controller.abort();
    const enqueue = vi.fn();
    const res = await run(
      runBoundedRefresh({
        enqueue,
        fetchFeed: vi.fn(),
        baselineMarker: "base",
        signal: controller.signal,
      }),
    );
    expect(res.status).toBe("aborted");
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("refresh «Per la mia impresa»", () => {
  it("usa una finestra più lunga ma sempre limitata", async () => {
    const { PROFILE_REFRESH_DELAYS_MS, DEFAULT_REFRESH_DELAYS_MS } = await import("../feed-refresh");
    expect(PROFILE_REFRESH_DELAYS_MS.length).toBeGreaterThan(DEFAULT_REFRESH_DELAYS_MS.length);
    expect(PROFILE_REFRESH_DELAYS_MS.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(60_000);
  });

  it("la dashboard aggiorna la cache della vista profilo e non lascia lo snapshot offline", () => {
    const src = readFileSync("src/routes/_authenticated/dashboard.tsx", "utf8");
    expect(src).toContain("PROFILE_REFRESH_DELAYS_MS");
    expect(src).toContain('mode: homeView');
    expect(src).toContain('["bandi-feed", homeView], applied');
    expect(src).toContain('saveOfflineFeed(applied, undefined, homeView)');
    expect(src).toContain('clearOfflineFeed(undefined, homeView)');
    expect(src).toContain('live.source === "central-core"');
    expect(src).toContain("[homeView]: new Date().toISOString()");
    expect(src).toContain("Per la mia impresa»");
  });
});
