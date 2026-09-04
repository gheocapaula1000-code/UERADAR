import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  matchingProfile,
  sanitizeFeedResponse,
  type ContractRow,
} from "../_shared/trovabandi-contract.ts";
import {
  CATALOG_LIMIT,
  PROFILE_FEED_LIMIT,
  isCatalogRequest,
  parseRequestBody,
  type FeedGatewayAction,
} from "../_shared/trovabandi-feed-request.ts";
import {
  edgeEntitlement,
  laneFor,
  type EdgeEntitlement,
} from "../_shared/ueradar-entitlement.ts";

export { parseRequestBody };

type Row = Record<string, unknown>;
type Action = FeedGatewayAction;

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function env(name: string) {
  return Deno.env.get(name)?.trim() ?? "";
}
function out(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers });
}

/** request_refresh accetta solo 202 + ok=true + queued=true. */
export function evaluateRefreshResponse(payload: unknown, status: number) {
  if (status !== 202) return { queued: false, code: "REFRESH_STATUS" };
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    return { queued: false, code: "REFRESH_SHAPE" };
  const body = payload as Row;
  if (body.ok !== true || body.queued !== true)
    return { queued: false, code: "REFRESH_NOT_QUEUED" };
  return { queued: true, code: "REFRESH_QUEUED" };
}

export function coreEndpoint(base: string) {
  const trimmed = base.trim().replace(/\/$/, "");
  return trimmed.endsWith("/functions/v1/trovabandi-engine")
    ? trimmed
    : `${trimmed}/functions/v1/trovabandi-engine`;
}

/** Il Core riceve solo campi che possono cambiare il matching. */
export function profileIsComplete(profile: Row | null): boolean {
  if (!profile) return false;
  const minimized = matchingProfile(profile);
  const required = ["forma_giuridica", "regione", "codice_ateco"];
  return required.every(
    (key) => typeof minimized[key] === "string" && (minimized[key] as string).trim().length > 0,
  );
}

async function callCore(action: Action | "catalog" | "feed", payload: Row, timeoutMs = 15_000) {
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
      signal: AbortSignal.timeout(timeoutMs),
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
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
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

  // La Edge è invocabile direttamente con un JWT valido: tenant, entitlement e
  // cadenza sono applicati qui e non dipendono dal gate applicativo.
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return out(503, { ok: false, code: "NOT_CONFIGURED" });
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tenantId, error: tenantError } = await service.rpc("ueradar_tenant_owner", {
    _user_id: user.id,
  });
  if (tenantError || typeof tenantId !== "string" || !tenantId)
    return out(503, { ok: false, code: "TENANT_LOOKUP_FAILED" });

  const { data: subscription, error: subscriptionError } = await service
    .from("ueradar_subscriptions")
    .select("status, plan_code, trial_ends_at, current_period_end")
    .eq("user_id", tenantId)
    .maybeSingle();
  if (subscriptionError) return out(503, { ok: false, code: "SUBSCRIPTION_LOOKUP_FAILED" });

  const entitlement: EdgeEntitlement = edgeEntitlement(
    (subscription as Record<string, unknown> | null) ?? null,
    new Date().toISOString(),
  );
  if (!entitlement.entitled)
    return out(403, { ok: false, code: "NOT_ENTITLED", reason: entitlement.reason });

  // Il profilo appartiene all'impresa (tenant owner): un membro accettato
  // legge quello del titolare, non il proprio (che non esiste).
  const { data: profile, error: profileError } = await service
    .from("company_profiles")
    .select("*")
    .eq("user_id", tenantId)
    .maybeSingle();

  if (profileError) return out(503, { ok: false, code: "PROFILE_LOOKUP_FAILED" });
  if (!profile) return out(409, { ok: false, code: "PROFILE_MISSING" });
  if (!profileIsComplete(profile as Row))
    return out(409, { ok: false, code: "PROFILE_INCOMPLETE" });

  const minimizedProfile = matchingProfile(profile as ContractRow);

  if (parsed.action === "request_refresh") {
    // Solo l'azione che innesca davvero una ricerca consuma la cadenza:
    // la lettura del feed non brucia l'intervallo del piano.
    const { lane, minutes } = laneFor(parsed.action, entitlement.limits);
    const period = new Date().toISOString().slice(0, 7);
    const { data: claim, error: claimError } = await service.rpc("ueradar_claim_search_lane", {
      _tenant: tenantId,
      _period: period,
      _lane: lane,
      _min_interval_minutes: minutes,
    });
    if (claimError) return out(503, { ok: false, code: "CADENCE_CHECK_FAILED" });
    const verdict = (claim ?? {}) as Record<string, unknown>;
    if (verdict["allowed"] !== true)
      return out(429, {
        ok: false,
        code: "CADENCE_LIMITED",
        reason: verdict["code"] ?? "TOO_SOON",
        retry_after_seconds: verdict["retry_after_seconds"] ?? 0,
      });

    const res = await callCore("request_refresh", { profile: minimizedProfile });
    const outcome = evaluateRefreshResponse(res.body, res.status);
    if (!outcome.queued) {
      // Coda non confermata: la prenotazione viene rilasciata, così l'utente
      // non resta bloccato dall'intervallo per una richiesta mai partita.
      await service.rpc("ueradar_release_search_lane", {
        _tenant: tenantId,
        _period: period,
        _lane: lane,
        _claimed_at: verdict["claimed_at"] ?? null,
        _previous_at: verdict["previous_at"] ?? null,
      });
      return out(502, { ok: false, code: "UPSTREAM_UNAVAILABLE" });
    }
    return out(202, { ok: true, queued: true });
  }

  // Catalogo ufficiale: pass-through minimo. Prima action=catalog, poi
  // feed mode=catalog se Core non ha ancora il ramo dedicato. Nessun matching
  // inventato qui: le schede restano come le invia Core.
  const catalog = isCatalogRequest(parsed);
  // Profilo: stesso timeout del catalogo — matching Core può superare i 15s.
  const PROFILE_FEED_TIMEOUT_MS = 60_000;
  const res = catalog
    ? await fetchOfficialCatalog()
    : await callCore(
        "feed",
        { profile: minimizedProfile, limit: PROFILE_FEED_LIMIT },
        PROFILE_FEED_TIMEOUT_MS,
      );
  // Catalogo e profilo: scarta le righe sporche, tieni le valide.
  // Una sola riga invalida non deve più far cadere tutto il feed profilo in 502
  // (che sul client diventa source=cache e badge «Dati salvati»).
  const sanitized = sanitizeFeedResponse(res.body, res.status, { dropInvalidRows: true });
  if (!sanitized.ok)
    return out(502, { ok: false, code: "UPSTREAM_UNAVAILABLE", reason: sanitized.code });

  const fetched_at = new Date().toISOString();
  return out(200, {
    ok: true,
    bandi: sanitized.bandi,
    fetched_at,
    generated_at: sanitized.generated_at ?? fetched_at,
    view: catalog ? "catalog" : "profile",
  });
});

const CATALOG_TIMEOUT_MS = 60_000;

async function fetchOfficialCatalog() {
  const lenient = { dropInvalidRows: true };
  const primary = await callCore("catalog", { limit: CATALOG_LIMIT }, CATALOG_TIMEOUT_MS);
  if (sanitizeFeedResponse(primary.body, primary.status, lenient).ok) return primary;

  const secondary = await callCore(
    "feed",
    { mode: "catalog", limit: CATALOG_LIMIT },
    CATALOG_TIMEOUT_MS,
  );
  if (sanitizeFeedResponse(secondary.body, secondary.status, lenient).ok) return secondary;

  return primary.status !== 0 ? primary : secondary;
}

