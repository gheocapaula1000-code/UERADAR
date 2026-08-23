import { describe, expect, it } from "vitest";
import {
  CATALOG_LIMIT,
  isCatalogRequest,
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
