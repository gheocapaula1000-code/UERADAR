/**
 * Email e link pubblici di invito utente operativo.
 * L'invio usa Resend come il digest: senza chiavi non si inventa un mittente.
 */

import { SITE_URL } from "./seo";
import { normalizeEmail } from "./membership";

export const INVITE_PATH = "/invito";
export const INVITE_TOKEN_QUERY = "token";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** Solo `/invito?token=<uuid>`: niente open-redirect dopo login. */
export function safeAuthNext(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith(INVITE_PATH)) return null;
  try {
    const url = new URL(raw, SITE_URL);
    if (url.pathname !== INVITE_PATH) return null;
    const token = url.searchParams.get(INVITE_TOKEN_QUERY);
    if (!isInviteToken(token)) return null;
    return `${INVITE_PATH}?${INVITE_TOKEN_QUERY}=${token.trim()}`;
  } catch {
    return null;
  }
}

export function inviteAcceptUrl(token: string, appUrl: string = SITE_URL): string | null {
  if (!isInviteToken(token)) return null;
  const base = appUrl.replace(/\/$/, "") || SITE_URL;
  return `${base}${INVITE_PATH}?${INVITE_TOKEN_QUERY}=${token.trim()}`;
}

export function escapeInviteHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char,
  );
}

export type InviteEmailInput = {
  first_name: string;
  last_name: string;
  declared_role: string;
  acceptUrl: string;
};

export function inviteEmailSubject(): string {
  return "Invito a UEradar.com come utente operativo";
}

export function inviteEmailHtml(input: InviteEmailInput): string {
  const name = escapeInviteHtml(`${input.first_name} ${input.last_name}`.trim());
  const role = escapeInviteHtml(input.declared_role);
  const url = escapeInviteHtml(input.acceptUrl);
  return `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto">
<p>Ciao ${name},</p>
<p>Sei stato invitato come utente operativo (${role}) su UEradar.com.</p>
<p>Apri il link con la stessa email di questo messaggio, accedi o crea l'account e conferma il posto:</p>
<p><a href="${url}">Accetta l'invito</a></p>
<p>Se non ti aspettavi questo messaggio puoi ignorarlo.</p>
</div>`;
}

export type InviteMailEnv = {
  apiKey: string;
  from: string;
};

export function readInviteMailEnv(
  env: Record<string, string | undefined> = process.env,
): InviteMailEnv | { ok: false; code: "EMAIL_NOT_CONFIGURED" } {
  const apiKey = (env["RESEND_API_KEY"] ?? "").trim();
  const from = (env["TROVABANDI_EMAIL_FROM"] ?? env["UERADAR_EMAIL_FROM"] ?? "").trim();
  if (!apiKey || !from) return { ok: false, code: "EMAIL_NOT_CONFIGURED" };
  return { apiKey, from };
}

export async function sendInviteEmail(args: {
  to: string;
  first_name: string;
  last_name: string;
  declared_role: string;
  acceptUrl: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<{ sent: boolean; code: string }> {
  const to = normalizeEmail(args.to);
  if (!to) return { sent: false, code: "INVALID_EMAIL" };
  const mail = readInviteMailEnv(args.env ?? process.env);
  if ("ok" in mail) return { sent: false, code: mail.code };
  const fetchImpl = args.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mail.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: mail.from,
        to: [to],
        subject: inviteEmailSubject(),
        html: inviteEmailHtml({
          first_name: args.first_name,
          last_name: args.last_name,
          declared_role: args.declared_role,
          acceptUrl: args.acceptUrl,
        }),
      }),
      signal: AbortSignal.timeout(12_000),
    });
    return res.ok ? { sent: true, code: "EMAIL_SENT" } : { sent: false, code: "EMAIL_SEND_FAILED" };
  } catch {
    return { sent: false, code: "EMAIL_SEND_FAILED" };
  }
}
