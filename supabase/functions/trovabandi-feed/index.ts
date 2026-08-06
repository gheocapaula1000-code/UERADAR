import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Row = Record<string, unknown>;

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const ALLOWED_ACTIONS = ["feed", "request_refresh"] as const;
type Action = (typeof ALLOWED_ACTIONS)[number];

function env(name: string) {
  return Deno.env.get(name)?.trim() ?? "";
}
function out(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers });
}

/** Allowlist stretta: solo { action } con action ∈ ALLOWED_ACTIONS, nessun campo extra. */
export function parseRequestBody(
  payload: unknown,
): { ok: true; action: Action } | { ok: false; code: string } {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    return { ok: false, code: "INVALID_BODY" };
  const body = payload as Row;
  const keys = Object.keys(body);
  if (keys.some((key) => key !== "action")) return { ok: false, code: "UNEXPECTED_FIELDS" };
  const action = body.action;
  if (typeof action !== "string" || !ALLOWED_ACTIONS.includes(action as Action))
    return { ok: false, code: "INVALID_ACTION" };
  return { ok: true, action: action as Action };
}

const REQUIRED_BANDO_FIELDS = [
  "id",
  "title",
  "authority_name",
  "authority_level",
  "category",
  "summary",
  "official_url",
] as const;

export function bandoRowIsValid(item: unknown): item is Row {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return false;
  const row = item as Row;
  return REQUIRED_BANDO_FIELDS.every(
    (key) => typeof row[key] === "string" && (row[key] as string).trim().length > 0,
  );
}

/** Validazione STRICT: una sola riga malformata invalida l'intero payload. */
export function sanitizeFeedResponse(
  payload: unknown,
  status: number,
): { ok: true; bandi: Row[] } | { ok: false; code: string } {
  if (status !== 200) return { ok: false, code: "UPSTREAM_STATUS" };
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    return { ok: false, code: "UPSTREAM_SHAPE" };
  const body = payload as Row;
  if (body.ok !== true) return { ok: false, code: "UPSTREAM_NOT_OK" };
  if (!Array.isArray(body.bandi)) return { ok: false, code: "UPSTREAM_NO_BANDI" };
  const rows = body.bandi as unknown[];
  if (!rows.every(bandoRowIsValid)) return { ok: false, code: "UPSTREAM_INVALID_ROW" };
  return { ok: true, bandi: rows as Row[] };
}

/** request_refresh accetta solo 202 + ok=true + queued=true. */
export function evaluateRefreshResponse(payload: unknown, status: number) {
  if (status !== 202) return { queued: false, code: "REFRESH_STATUS" };
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    return { queued: false, code: "REFRESH_SHAPE" };
  const body = payload as Row;
  if (body.ok !== true || body.queued !== true) return { queued: false, code: "REFRESH_NOT_QUEUED" };
  return { queued: true, code: "REFRESH_QUEUED" };
}

export function coreEndpoint(base: string) {
  const trimmed = base.trim().replace(/\/$/, "");
  return trimmed.endsWith("/functions/v1/trovabandi-engine")
    ? trimmed
    : `${trimmed}/functions/v1/trovabandi-engine`;
}

/** Fail-closed: profilo minimo necessario per interrogare il Core. */
export function profileIsComplete(profile: Row | null): boolean {
  if (!profile) return false;
  const required = ["ragione_sociale", "forma_giuridica", "regione", "codice_ateco"];
  return required.every((key) => typeof profile[key] === "string" && (profile[key] as string).trim());
}

async function callCore(action: Action, payload: Row) {
  const base = env("CENTRAL_CORE_API_URL");
  const secret = env("CENTRAL_CORE_API_KEY");
  if (!base || !secret) return { status: 0, body: null };
  try {
    const res = await fetch(coreEndpoint(base), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${secret}`,
        "x-internal-secret": secret,
        "x-source-app": "trovabandi-feed",
      },
      body: JSON.stringify({ action, ...payload }),
      signal: AbortSignal.timeout(15_000),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

serve(async (req) => {
  if (req.method !== "POST") return out(405, { ok: false, code: "METHOD_NOT_ALLOWED" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return out(401, { ok: false, code: "UNAUTHORIZED" });

  const supabaseUrl = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return out(503, { ok: false, code: "NOT_CONFIGURED" });

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return out(401, { ok: false, code: "UNAUTHORIZED" });

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    return out(400, { ok: false, code: "INVALID_JSON" });
  }
  const parsed = parseRequestBody(raw);
  if (!parsed.ok) return out(400, { ok: false, code: parsed.code });

  const { data: profile, error: profileError } = await supabase
    .from("company_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) return out(503, { ok: false, code: "PROFILE_LOOKUP_FAILED" });
  if (!profile) return out(409, { ok: false, code: "PROFILE_MISSING" });
  if (!profileIsComplete(profile as Row)) return out(409, { ok: false, code: "PROFILE_INCOMPLETE" });

  if (parsed.action === "request_refresh") {
    const res = await callCore("request_refresh", { profile });
    const verdict = evaluateRefreshResponse(res.body, res.status);
    if (!verdict.queued) return out(502, { ok: false, code: "UPSTREAM_UNAVAILABLE" });
    return out(202, { ok: true, queued: true });
  }

  const res = await callCore("feed", { profile, limit: 250 });
  const sanitized = sanitizeFeedResponse(res.body, res.status);
  if (!sanitized.ok) return out(502, { ok: false, code: "UPSTREAM_UNAVAILABLE" });
  return out(200, { ok: true, bandi: sanitized.bandi });
});
