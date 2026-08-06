import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
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
  it("è stabile su contenuto identico e cambia su contenuto diverso", () => {
    expect(feedMarker(feed())).toBe(feedMarker(feed()));
    expect(feedMarker(feed())).not.toBe(feedMarker(feed({ fetched_at: "2026-08-06T11:00:00Z" })));
  });
  it("feed assente → marker vuoto (fail-closed)", () => {
    expect(feedMarker(null)).toBe("");
  });
});

describe("runBoundedRefresh", () => {
  it("accoda una sola volta e si ferma al primo marker nuovo", async () => {
    const enqueue = vi.fn().mockResolvedValue({ queued: true });
    const fresh = feed({ fetched_at: "2026-08-06T12:00:00.000Z" });
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
    const fetchFeed = vi.fn().mockResolvedValue(feed());
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
