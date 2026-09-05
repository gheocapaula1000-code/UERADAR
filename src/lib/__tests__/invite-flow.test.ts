import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INVITE_PATH,
  inviteAcceptUrl,
  inviteEmailHtml,
  inviteEmailSubject,
  isInviteToken,
  readInviteMailEnv,
  safeAuthNext,
  sendInviteEmail,
} from "../invite-email";
import { canReinviteAfterRemoval, inviteOccupiesSeat, mapInviteRpcResult } from "../membership";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");
const sqlAll = readdirSync(MIGRATIONS)
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");
const latestInvite = (() => {
  const start = sqlAll.lastIndexOf("CREATE OR REPLACE FUNCTION public.ueradar_invite_member");
  return sqlAll.slice(start);
})();
const billingFns = readFileSync(join(process.cwd(), "src/lib/billing.functions.ts"), "utf8");
const inviteRoute = readFileSync(join(process.cwd(), "src/routes/invito.tsx"), "utf8");
const authRoute = readFileSync(join(process.cwd(), "src/routes/auth.tsx"), "utf8");
const appShell = readFileSync(join(process.cwd(), "src/components/bandocore/AppShell.tsx"), "utf8");
const cookiePage = readFileSync(join(process.cwd(), "src/routes/cookie.tsx"), "utf8");
const offlineFeed = readFileSync(join(process.cwd(), "src/lib/offline-feed.ts"), "utf8");
const webhook = readFileSync(
  join(process.cwd(), "src/routes/api/public/billing-webhook.ts"),
  "utf8",
);
const proxy = readFileSync(join(process.cwd(), "src/lib/proxy-core.functions.ts"), "utf8");

const TOKEN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("email e rotta pubblica /invito", () => {
  it("accetta solo token UUID e costruisce il link canonico", () => {
    expect(isInviteToken(TOKEN)).toBe(true);
    expect(isInviteToken("not-a-token")).toBe(false);
    expect(inviteAcceptUrl(TOKEN, "https://ueradar.com")).toBe(
      `https://ueradar.com${INVITE_PATH}?token=${TOKEN}`,
    );
    expect(safeAuthNext(`/invito?token=${TOKEN}`)).toBe(`/invito?token=${TOKEN}`);
    expect(safeAuthNext("https://evil.example/invito?token=" + TOKEN)).toBeNull();
    expect(safeAuthNext("/dashboard")).toBeNull();
  });

  it("compone l'email in italiano senza inventare Bandi", () => {
    expect(inviteEmailSubject()).toContain("UEradar.com");
    const html = inviteEmailHtml({
      first_name: "Anna",
      last_name: "Rossi",
      declared_role: "dipendente",
      acceptUrl: `https://ueradar.com/invito?token=${TOKEN}`,
    });
    expect(html).toContain("Anna Rossi");
    expect(html).toContain("dipendente");
    expect(html).toContain(`/invito?token=${TOKEN}`);
    expect(html).not.toMatch(/bando inventat/i);
  });

  it("non invia se mancano i secret di produzione", async () => {
    expect(readInviteMailEnv({})).toEqual({ ok: false, code: "EMAIL_NOT_CONFIGURED" });
    const sent = await sendInviteEmail({
      to: "collega@impresa.it",
      first_name: "Anna",
      last_name: "Rossi",
      declared_role: "socio",
      acceptUrl: `https://ueradar.com/invito?token=${TOKEN}`,
      env: {},
    });
    expect(sent).toEqual({ sent: false, code: "EMAIL_NOT_CONFIGURED" });
  });

  it("invia via Resend quando le chiavi ci sono", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const sent = await sendInviteEmail({
      to: "collega@impresa.it",
      first_name: "Anna",
      last_name: "Rossi",
      declared_role: "socio",
      acceptUrl: `https://ueradar.com/invito?token=${TOKEN}`,
      env: { RESEND_API_KEY: "re_test", TROVABANDI_EMAIL_FROM: "UEradar.com <bandi@ueradar.com>" },
      fetchImpl: (async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    });
    expect(sent).toEqual({ sent: true, code: "EMAIL_SENT" });
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.to).toEqual(["collega@impresa.it"]);
    expect(body.from).toContain("ueradar.com");
  });

  it("la rotta pubblica e l'invito server esistono", () => {
    expect(inviteRoute).toContain('createFileRoute("/invito")');
    expect(inviteRoute).toContain("getInviteByToken");
    expect(inviteRoute).toContain("Accetta invito");
    expect(authRoute).toContain("safeAuthNext");
    expect(authRoute).toContain('to: "/invito"');
    expect(billingFns).toContain("export const getInviteByToken");
    expect(billingFns).toContain("sendInviteEmail");
    expect(billingFns).toContain("email_sent");
  });
});

describe("reinvito dopo rimozione membro", () => {
  it("i revocati non occupano posti e sono reinvitabili", () => {
    expect(inviteOccupiesSeat("invited")).toBe(true);
    expect(inviteOccupiesSeat("accepted")).toBe(true);
    expect(inviteOccupiesSeat("revoked")).toBe(false);
    expect(canReinviteAfterRemoval("revoked")).toBe(true);
    expect(canReinviteAfterRemoval("accepted")).toBe(false);
  });

  it("la RPC riattiva la riga revocata e l'indice unico ignora i revocati", () => {
    expect(latestInvite).toContain("status = 'revoked'");
    expect(latestInvite).toContain("AND status IN ('invited', 'accepted')");
    expect(latestInvite).toContain("invite_token");
    expect(sqlAll).toContain("WHERE status IN ('invited', 'accepted')");
    expect(billingFns).toContain('status: "revoked"');
    expect(billingFns).not.toMatch(/\.delete\(\)\s*\.eq\("owner_user_id"/);
  });

  it("MEMBER_ALREADY_PRESENT diventa ALREADY_INVITED per la UI", () => {
    expect(mapInviteRpcResult({ ok: false, code: "MEMBER_ALREADY_PRESENT" }, null)).toEqual({
      ok: false,
      code: "ALREADY_INVITED",
    });
  });
});

describe("logout e cache offline", () => {
  it("svuota React Query al logout", () => {
    expect(appShell).toContain("useQueryClient");
    expect(appShell).toContain("queryClient.clear()");
    expect(appShell.indexOf("queryClient.clear()")).toBeGreaterThan(
      appShell.indexOf("supabase.auth.signOut()"),
    );
  });

  it("la cache offline usa la stessa soglia di 7 giorni del feed", () => {
    expect(offlineFeed).toContain("POPULATED_CACHE_MAX_AGE_MS");
    expect(cookiePage).toContain("dopo 7 giorni");
    expect(cookiePage).not.toContain("30 giorni");
  });
});

describe("segnali operativi", () => {
  it("il webhook segnala gli eventi Stripe non gestiti", () => {
    expect(webhook).toContain("stripeUnhandledSignal");
    expect(webhook).toContain("emitOpsSignal");
    expect(webhook.indexOf("stripeUnhandledSignal")).toBeLessThan(
      webhook.indexOf('return settle("EVENT_IGNORED"'),
    );
  });

  it("il feed segnala gli host attestati dal catalogo ufficiale", () => {
    expect(proxy).toContain("coreAttestedSignal");
    expect(proxy).toContain("attested_hosts");
  });
});
