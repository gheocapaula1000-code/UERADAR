import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { matchingProfile } from "../_shared/trovabandi-contract.ts";
import {
  modeAllowsNotification,
  notificationTypeFor,
  parseDigestMode,
  type DigestMode,
} from "./mode.ts";

type Row = Record<string, unknown>;

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

function env(name: string) {
  return Deno.env.get(name)?.trim() ?? "";
}
function out(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers });
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function secretDigest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function safeSecretEqual(left: string, right: string) {
  const [a, b] = await Promise.all([secretDigest(left), secretDigest(right)]);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function coreUrl() {
  const base = env("CENTRAL_CORE_API_URL").replace(/\/$/, "");
  return base.endsWith("/functions/v1/trovabandi-engine")
    ? base
    : `${base}/functions/v1/trovabandi-engine`;
}

/**
 * Release gate: prima di elaborare qualunque digest il Central Core deve
 * autorizzare esplicitamente l'attivazione. Qualunque esito diverso da
 * HTTP 200 con ok/gate_passed/cron_activation_allowed = true blocca
 * l'esecuzione (fail-closed): nessuna notifica creata, nessuna email inviata.
 */
export async function evaluateReleaseGate(payload: unknown, status: number) {
  if (status !== 200) return { allowed: false, reason: `GATE_HTTP_${status}` };
  const body = (payload ?? {}) as Row;
  if (body.ok !== true) return { allowed: false, reason: "GATE_NOT_OK" };
  if (body.gate_passed !== true) return { allowed: false, reason: "GATE_NOT_PASSED" };
  if (body.cron_activation_allowed !== true)
    return { allowed: false, reason: "CRON_ACTIVATION_NOT_ALLOWED" };
  return { allowed: true, reason: "GATE_PASSED" };
}

async function checkReleaseGate() {
  const secret = env("CENTRAL_CORE_API_KEY");
  const base = env("CENTRAL_CORE_API_URL");
  if (!base || !secret) return { allowed: false, reason: "CORE_NOT_CONFIGURED" };
  try {
    const res = await fetch(coreUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
        "x-internal-secret": secret,
        "x-source-app": "trovabandi-digest",
      },
      body: JSON.stringify({ action: "release_gate", client: "trovabandi-digest" }),
      signal: AbortSignal.timeout(10_000),
    });
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    return await evaluateReleaseGate(payload, res.status);
  } catch {
    return { allowed: false, reason: "GATE_UNREACHABLE" };
  }
}

async function coreFeed(profile: Row) {
  const secret = env("CENTRAL_CORE_API_KEY");
  const res = await fetch(coreUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
      "x-internal-secret": secret,
      "x-source-app": "trovabandi-digest",
    },
    body: JSON.stringify({ action: "feed", profile: matchingProfile(profile), limit: 250 }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`CORE_${res.status}`);
  const payload = (await res.json()) as Row;
  if (payload.ok !== true || !Array.isArray(payload.bandi)) throw new Error("CORE_INVALID_PAYLOAD");
  return payload.bandi as Row[];
}

function euro(value: unknown) {
  return typeof value === "number"
    ? new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value)
    : "importo da verificare";
}

async function sendDigest(email: string, company: string, items: Row[], mode: DigestMode) {
  const key = env("RESEND_API_KEY");
  const from = env("TROVABANDI_EMAIL_FROM");
  if (!key || !from || !email || items.length === 0) return false;
  const rows = items
    .slice(0, 8)
    .map((item) => {
      const match = (item.match ?? {}) as Row;
      const deadline = text(item.deadline_at);
      return `<li style="margin:0 0 18px"><strong>${escapeHtml(text(item.title))}</strong><br>${escapeHtml(text(item.authority_name))} · ${escapeHtml(euro(item.max_grant_amount))} · compatibilità ${Number(match.score ?? 0)}%${deadline ? `<br>Scadenza: ${new Date(deadline).toLocaleDateString("it-IT")}` : ""}<br><a href="${escapeHtml(text(item.official_url))}">Fonte ufficiale</a></li>`;
    })
    .join("");
  const subject =
    mode === "morning"
      ? `${items.length} nuove opportunità per ${company}`
      : `${items.length} avvisi urgenti per ${company}`;
  const heading = mode === "morning" ? "Le novità di oggi" : "Avvisi urgenti";
  const lead =
    mode === "morning"
      ? "Abbiamo trovato nuove opportunità compatibili o da verificare per la tua impresa."
      : "Scadenze imminenti o finestre click day da controllare subito.";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto"><h1>${heading}</h1><p>${lead}</p><ul style="padding-left:20px">${rows}</ul><p>Accedi a UEradar.com per vedere requisiti, prove e motivazione del match.</p></div>`,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  return res.ok;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char,
  );
}

async function processProfile(
  sb: ReturnType<typeof createClient>,
  profile: Row,
  mode: DigestMode,
) {
  const userId = text(profile.user_id);
  const { data: preferences } = await sb
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const morningEnabled = preferences?.morning_digest_enabled !== false;
  const urgentEnabled = preferences?.urgent_enabled !== false;
  const inAppEnabled = preferences?.in_app_enabled !== false;
  const modeEnabled = mode === "morning" ? morningEnabled : urgentEnabled;
  if (!modeEnabled) return { created: 0, emailed: false };
  const opportunities = await coreFeed(profile);
  const cutoff = Date.now() - 30 * 60 * 60 * 1000;
  const relevant = opportunities.filter((item) => {
    const match = (item.match ?? {}) as Row;
    const firstSeen = Date.parse(text(item.first_seen_at));
    const deadline = Date.parse(text(item.deadline_at));
    // Mai notificare opportunità già scadute.
    if (Number.isFinite(deadline) && deadline + 86_400_000 - 1 < Date.now()) return false;
    if (match.status === "NON_COMPATIBILE") return false;
    const type = notificationTypeFor(item);
    if (!modeAllowsNotification(mode, type)) return false;
    const fresh = Number.isFinite(firstSeen) && firstSeen >= cutoff;
    return mode === "urgent" || fresh;
  });
  const created: Row[] = [];
  for (const item of relevant) {
    const type = notificationTypeFor(item);
    if (!modeAllowsNotification(mode, type) || !inAppEnabled) continue;
    const match = (item.match ?? {}) as Row;
    const row = {
      user_id: userId,
      opportunity_id: text(item.id),
      notification_type: type,
      title: text(item.title),
      body: `${text(item.authority_name)} · compatibilità ${Number(match.score ?? 0)}% · ${euro(item.max_grant_amount)}`,
      payload: {
        official_url: item.official_url,
        deadline_at: item.deadline_at,
        match: item.match,
      },
    };
    const { data } = await sb
      .from("daily_notifications")
      .upsert(row, {
        onConflict: "user_id,opportunity_id,notification_type",
        ignoreDuplicates: true,
      })
      .select("*")
      .maybeSingle();
    if (data) created.push({ ...item, notification_id: data.id });
  }
  const emailEnabled = preferences?.email_enabled === true;
  const emailed =
    emailEnabled && created.length > 0
      ? await sendDigest(text(profile.email_referente), text(profile.ragione_sociale), created, mode)
      : false;
  if (emailed) {
    await sb
      .from("daily_notifications")
      .update({ emailed_at: new Date().toISOString() })
      .in(
        "id",
        created.map((item) => text(item.notification_id)),
      );
  }
  return { created: created.length, emailed };
}

serve(async (req) => {
  if (req.method !== "POST") return out(405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  if (req.headers.get("origin")) return out(403, { ok: false, code: "SERVER_TO_SERVER_ONLY" });
  const cronSecret = env("TROVABANDI_CRON_SECRET");
  if (!cronSecret) return out(503, { ok: false, code: "AUTH_NOT_CONFIGURED" });
  if (!(await safeSecretEqual(cronSecret, req.headers.get("x-cron-secret") ?? "")))
    return out(401, { ok: false, code: "UNAUTHORIZED" });
  let body: Row;
  try {
    body = await req.json();
  } catch {
    return out(400, { ok: false, code: "INVALID_JSON" });
  }
  const mode = parseDigestMode(body.mode);
  if (!mode) return out(400, { ok: false, code: "INVALID_MODE" });
  const run_id = crypto.randomUUID();
  const started_at = new Date().toISOString();
  const gate = await checkReleaseGate();
  if (!gate.allowed)
    return out(423, {
      ok: false,
      status: "BLOCKED_GATE",
      code: "RELEASE_GATE_BLOCKED",
      reason: gate.reason,
      run_id,
      started_at,
      finished_at: new Date().toISOString(),
    });
  const offset = Math.max(0, Number(body.offset ?? 0));
  const limit = Math.max(1, Math.min(20, Number(body.limit ?? 10)));
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const { data: profiles, error } = await sb
    .from("company_profiles")
    .select("*")
    .order("created_at")
    .range(offset, offset + limit - 1);
  if (error) return out(500, { ok: false, code: "PROFILE_QUERY_FAILED" });
  let created = 0;
  let emailed = 0;
  let failed = 0;
  for (let index = 0; index < (profiles ?? []).length; index += 4) {
    const batch = (profiles ?? []).slice(index, index + 4);
    const results = await Promise.allSettled(batch.map((profile) => processProfile(sb, profile, mode)));
    for (const result of results) {
      if (result.status === "fulfilled") {
        created += result.value.created;
        if (result.value.emailed) emailed++;
      } else failed++;
    }
  }
  const processed = profiles?.length ?? 0;
  const status =
    failed > 0 && failed === processed
      ? "FAILED"
      : failed > 0
        ? "PARTIAL"
        : created > 0
          ? "SUCCESS_DATA"
          : "SUCCESS_EMPTY";
  const httpStatus = status === "FAILED" ? 502 : status === "PARTIAL" ? 207 : 200;
  return out(httpStatus, {
    ok: status === "SUCCESS_DATA" || status === "SUCCESS_EMPTY",
    status,
    run_id,
    started_at,
    finished_at: new Date().toISOString(),
    mode,
    offset,
    processed,
    created,
    emailed,
    failed,
    has_more: processed === limit,
    next_offset: offset + processed,
  });
});
