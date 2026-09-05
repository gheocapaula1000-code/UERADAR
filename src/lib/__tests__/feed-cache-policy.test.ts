import { describe, expect, it } from "vitest";
import type { FeedResponse } from "../bandocore-types";
import { decideFeedCache, feedFingerprint } from "../feed-cache-policy";

const populated = (fetched_at: string): FeedResponse => ({
  bandi: [{
    id: "a",
    titolo: "A",
    ente: "MIMIT",
    descrizione: "Sintesi",
    categoria: "FONDO_PERDUTO",
    scope: "NAZIONALE",
  }],
  fetched_at,
  generated_at: fetched_at,
  source: "cache",
});
const empty = (fetched_at: string): FeedResponse => ({
  bandi: [],
  fetched_at,
  generated_at: fetched_at,
  source: "central-core",
});

describe("politica cache feed UEradar", () => {
  it("non lascia che un vuoto nasconda un feed popolato recente", () => {
    const now = Date.parse("2026-08-07T10:00:00Z");
    expect(decideFeedCache(populated("2026-08-06T10:00:00Z"), empty("2026-08-07T10:00:00Z"), now))
      .toBe("reuse-previous");
  });

  it("non persiste feed vuoti o feed identici a ogni poll", () => {
    const now = Date.parse("2026-08-07T10:00:00Z");
    expect(decideFeedCache(null, empty("2026-08-07T10:00:00Z"), now))
      .toBe("serve-without-persist");
    const old = populated("2026-08-07T09:00:00Z");
    const same = { ...old, fetched_at: "2026-08-07T10:00:00Z", source: "central-core" as const };
    expect(feedFingerprint(old)).toBe(feedFingerprint(same));
    expect(decideFeedCache(old, same, now)).toBe("serve-without-persist");
  });

  it("persiste un feed popolato realmente diverso", () => {
    const previous = populated("2026-08-07T09:00:00Z");
    const next = populated("2026-08-07T10:00:00Z");
    next.bandi[0] = { ...next.bandi[0], titolo: "Aggiornato" };
    expect(decideFeedCache(previous, next)).toBe("persist");
  });

  it("«Cerca» non riusa il feed_cache profilo del 02/09 se il motore torna vuoto", () => {
    const now = Date.parse("2026-09-05T10:00:00Z");
    const stale = populated("2026-09-02T08:00:00Z");
    const liveEmpty = empty("2026-09-05T10:00:00Z");
    expect(decideFeedCache(stale, liveEmpty, now)).toBe("reuse-previous");
    expect(decideFeedCache(stale, liveEmpty, now, { skipReuse: true })).toBe("persist");
    expect(decideFeedCache(empty("2026-09-05T09:00:00Z"), liveEmpty, now, { skipReuse: true }))
      .toBe("serve-without-persist");
  });
});
