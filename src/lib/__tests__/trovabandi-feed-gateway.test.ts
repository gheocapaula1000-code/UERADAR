import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseGatewayFeed } from "../proxy-core.server";

/** Copie delle funzioni pure di supabase/functions/trovabandi-feed/index.ts */
const ALLOWED_ACTIONS = ["feed", "request_refresh"] as const;

function parseRequestBody(payload: unknown) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    return { ok: false as const, code: "INVALID_BODY" };
  const body = payload as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "action"))
    return { ok: false as const, code: "UNEXPECTED_FIELDS" };
  const action = body.action;
  if (typeof action !== "string" || !ALLOWED_ACTIONS.includes(action as never))
    return { ok: false as const, code: "INVALID_ACTION" };
  return { ok: true as const, action };
}

function sanitizeFeedResponse(payload: unknown, status: number) {
  if (status !== 200) return { ok: false as const, code: "UPSTREAM_STATUS" };
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    return { ok: false as const, code: "UPSTREAM_SHAPE" };
  const body = payload as Record<string, unknown>;
  if (body.ok !== true) return { ok: false as const, code: "UPSTREAM_NOT_OK" };
  if (!Array.isArray(body.bandi)) return { ok: false as const, code: "UPSTREAM_NO_BANDI" };
  const bandi = (body.bandi as unknown[]).filter((item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    return typeof row.id === "string" && row.id.length > 0 && typeof row.title === "string";
  });
  return { ok: true as const, bandi };
}

function evaluateRefreshResponse(payload: unknown, status: number) {
  if (status !== 202) return { queued: false, code: "REFRESH_STATUS" };
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    return { queued: false, code: "REFRESH_SHAPE" };
  const body = payload as Record<string, unknown>;
  if (body.ok !== true || body.queued !== true)
    return { queued: false, code: "REFRESH_NOT_QUEUED" };
  return { queued: true, code: "REFRESH_QUEUED" };
}

function coreEndpoint(base: string) {
  const trimmed = base.trim().replace(/\/$/, "");
  return trimmed.endsWith("/functions/v1/trovabandi-engine")
    ? trimmed
    : `${trimmed}/functions/v1/trovabandi-engine`;
}

describe("trovabandi-feed allowlist", () => {
  it("accetta solo le due action previste", () => {
    expect(parseRequestBody({ action: "feed" }).ok).toBe(true);
    expect(parseRequestBody({ action: "request_refresh" }).ok).toBe(true);
  });

  it("rifiuta action non in allowlist", () => {
    expect(parseRequestBody({ action: "drop" }).code).toBe("INVALID_ACTION");
    expect(parseRequestBody({ action: 1 }).code).toBe("INVALID_ACTION");
  });

  it("rifiuta campi extra (profile/user_id/url iniettati dal caller)", () => {
    expect(parseRequestBody({ action: "feed", user_id: "x" }).code).toBe("UNEXPECTED_FIELDS");
    expect(parseRequestBody({ action: "feed", profile: {} }).code).toBe("UNEXPECTED_FIELDS");
  });

  it("rifiuta body non oggetto", () => {
    expect(parseRequestBody(null).code).toBe("INVALID_BODY");
    expect(parseRequestBody([{ action: "feed" }]).code).toBe("INVALID_BODY");
  });
});

describe("trovabandi-feed output upstream", () => {
  const good = { ok: true, bandi: [{ id: "a", title: "Bando A" }] };

  it("accetta solo 200 + ok + bandi array", () => {
    const res = sanitizeFeedResponse(good, 200);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.bandi).toHaveLength(1);
  });

  it("fail-closed su upstream non valido", () => {
    expect(sanitizeFeedResponse(good, 500).code).toBe("UPSTREAM_STATUS");
    expect(sanitizeFeedResponse({ ok: false, bandi: [] }, 200).code).toBe("UPSTREAM_NOT_OK");
    expect(sanitizeFeedResponse({ ok: true }, 200).code).toBe("UPSTREAM_NO_BANDI");
    expect(sanitizeFeedResponse(null, 200).code).toBe("UPSTREAM_SHAPE");
  });

  it("scarta righe malformate", () => {
    const res = sanitizeFeedResponse({ ok: true, bandi: [{ id: "" }, null, { id: "b", title: "B" }] }, 200);
    expect(res.ok && res.bandi.length).toBe(1);
  });

  it("request_refresh accetta solo 202 + ok + queued", () => {
    expect(evaluateRefreshResponse({ ok: true, queued: true }, 202).queued).toBe(true);
    expect(evaluateRefreshResponse({ ok: true, queued: true }, 200).code).toBe("REFRESH_STATUS");
    expect(evaluateRefreshResponse({ ok: true }, 202).code).toBe("REFRESH_NOT_QUEUED");
  });

  it("costruisce solo l'endpoint trovabandi-engine", () => {
    expect(coreEndpoint("https://core.example.com/")).toBe(
      "https://core.example.com/functions/v1/trovabandi-engine",
    );
    expect(coreEndpoint("https://core.example.com/functions/v1/trovabandi-engine")).toBe(
      "https://core.example.com/functions/v1/trovabandi-engine",
    );
  });
});

describe("server function senza secret del Core", () => {
  it("il modulo TanStack non referenzia i secret del Central Core", () => {
    const sources = [
      readFileSync("src/lib/proxy-core.functions.ts", "utf8"),
      readFileSync("src/lib/proxy-core.server.ts", "utf8"),
    ].join("\n");
    expect(sources).not.toMatch(/CENTRAL_CORE_API_URL/);
    expect(sources).not.toMatch(/CENTRAL_CORE_API_KEY/);
    expect(sources).not.toMatch(/process\.env/);
  });

  it("valida il payload del gateway prima del mapping", () => {
    expect(parseGatewayFeed({ ok: false, bandi: [] })).toBeNull();
    expect(parseGatewayFeed({ ok: true })).toBeNull();
    expect(parseGatewayFeed({ ok: true, bandi: [{ id: "a", title: "A" }] })).toHaveLength(1);
  });
});
