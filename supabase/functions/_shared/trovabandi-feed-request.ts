export const ALLOWED_ACTIONS = ["feed", "request_refresh", "catalog"] as const;
export type FeedGatewayAction = (typeof ALLOWED_ACTIONS)[number];

export const FEED_MODES = ["catalog", "profile"] as const;
export type FeedGatewayMode = (typeof FEED_MODES)[number];

const ALLOWED_KEYS = new Set(["action", "mode"]);

export type ParsedFeedRequest =
  | { ok: true; action: FeedGatewayAction; mode?: FeedGatewayMode }
  | { ok: false; code: string };

/** Allowlist: solo action e, per feed/catalog, mode catalog|profile. */
export function parseRequestBody(payload: unknown): ParsedFeedRequest {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    return { ok: false, code: "INVALID_BODY" };
  const body = payload as Record<string, unknown>;
  if (Object.keys(body).some((key) => !ALLOWED_KEYS.has(key)))
    return { ok: false, code: "UNEXPECTED_FIELDS" };
  const action = body.action;
  if (typeof action !== "string" || !ALLOWED_ACTIONS.includes(action as FeedGatewayAction))
    return { ok: false, code: "INVALID_ACTION" };
  const parsedAction = action as FeedGatewayAction;
  if (body.mode === undefined) {
    return {
      ok: true,
      action: parsedAction,
      mode: parsedAction === "catalog" ? "catalog" : undefined,
    };
  }
  if (parsedAction === "request_refresh") return { ok: false, code: "UNEXPECTED_FIELDS" };
  if (typeof body.mode !== "string" || !FEED_MODES.includes(body.mode as FeedGatewayMode))
    return { ok: false, code: "INVALID_MODE" };
  return { ok: true, action: parsedAction, mode: body.mode as FeedGatewayMode };
}

export function isCatalogRequest(parsed: { action: FeedGatewayAction; mode?: FeedGatewayMode }) {
  return parsed.action === "catalog" || parsed.mode === "catalog";
}

/** Catalogo ufficiale: tetto allineato al massimo del Core (5000), senza matching. */
export const CATALOG_LIMIT = 5000;
export const PROFILE_FEED_LIMIT = 250;
