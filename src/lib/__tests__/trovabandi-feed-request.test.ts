import { describe, expect, it } from "vitest";
import {
  CATALOG_LIMIT,
  REQUEST_REFRESH_TIMEOUT_MS,
  evaluateRefreshResponse,
  isCatalogRequest,
  isTransientCoreStatus,
  parseRequestBody,
} from "../../../supabase/functions/_shared/trovabandi-feed-request.ts";

describe("contratto gateway catalogo", () => {
  it("accetta catalog e feed mode=catalog, rifiuta campi extra", () => {
    expect(parseRequestBody({ action: "catalog" })).toEqual({
      ok: true,
      action: "catalog",
      mode: "catalog",
    });
    expect(parseRequestBody({ action: "feed", mode: "catalog" })).toEqual({
      ok: true,
      action: "feed",
      mode: "catalog",
    });
    expect(parseRequestBody({ action: "feed" })).toEqual({ ok: true, action: "feed" });
    expect(parseRequestBody({ action: "request_refresh" })).toEqual({
      ok: true,
      action: "request_refresh",
    });
    expect(parseRequestBody({ action: "feed", mode: "profile" })).toEqual({
      ok: true,
      action: "feed",
      mode: "profile",
    });
    expect(parseRequestBody({ action: "feed", profile: {} })).toMatchObject({
      ok: false,
      code: "UNEXPECTED_FIELDS",
    });
    expect(parseRequestBody({ action: "request_refresh", mode: "catalog" })).toMatchObject({
      ok: false,
      code: "UNEXPECTED_FIELDS",
    });
    expect(parseRequestBody({ action: "scrape" })).toMatchObject({
      ok: false,
      code: "INVALID_ACTION",
    });
  });

  it("catalogo è action=catalog oppure feed mode=catalog, con tetto sopra le 1560 righe", () => {
    expect(isCatalogRequest({ action: "catalog" })).toBe(true);
    expect(isCatalogRequest({ action: "feed", mode: "catalog" })).toBe(true);
    expect(isCatalogRequest({ action: "feed" })).toBe(false);
    expect(CATALOG_LIMIT).toBeGreaterThanOrEqual(1560);
  });
});

describe("contratto request_refresh verso Core", () => {
  it("accetta 202 e 200 se ok+queued, rifiuta timeout e body incompleto", () => {
    const queued = { ok: true, queued: true };
    expect(evaluateRefreshResponse(queued, 202)).toEqual({ queued: true, code: "REFRESH_QUEUED" });
    expect(evaluateRefreshResponse(queued, 200)).toEqual({ queued: true, code: "REFRESH_QUEUED" });
    expect(evaluateRefreshResponse(queued, 0)).toMatchObject({
      queued: false,
      code: "REFRESH_STATUS",
    });
    expect(evaluateRefreshResponse({ ok: true }, 202)).toMatchObject({
      queued: false,
      code: "REFRESH_NOT_QUEUED",
    });
    expect(evaluateRefreshResponse(null, 202)).toMatchObject({
      queued: false,
      code: "REFRESH_SHAPE",
    });
  });

  it("il timeout di accodamento è più lungo di 15s e ritenta solo i transient", () => {
    expect(REQUEST_REFRESH_TIMEOUT_MS).toBeGreaterThan(15_000);
    expect(REQUEST_REFRESH_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
    expect(isTransientCoreStatus(0)).toBe(true);
    expect(isTransientCoreStatus(502)).toBe(true);
    expect(isTransientCoreStatus(408)).toBe(true);
    expect(isTransientCoreStatus(429)).toBe(false);
    expect(isTransientCoreStatus(400)).toBe(false);
  });
});
