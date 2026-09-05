import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  REFRESH_CADENCE_LIMITED,
  REFRESH_QUEUE_FAILED,
  REFRESH_UPSTREAM_UNAVAILABLE,
  classifyRefreshEnqueue,
  classifyRefreshError,
  formatRetryAfter,
  isTransientRefreshVerdict,
  readFunctionsInvokePayload,
  refreshNoticeFor,
  toRefreshEnqueueResult,
  verdictFromRefreshPayload,
} from "../refresh-enqueue";

describe("classificazione enqueue Cerca nuovi Bandi", () => {
  it("legge il body anche quando invoke marca error (429/502)", async () => {
    const cadence = { ok: false, code: REFRESH_CADENCE_LIMITED, retry_after_seconds: 800 };
    expect(await readFunctionsInvokePayload(cadence, new Error("non-2xx"))).toEqual(cadence);
    expect(
      await readFunctionsInvokePayload(null, {
        context: { ok: false, code: REFRESH_UPSTREAM_UNAVAILABLE },
      }),
    ).toEqual({ ok: false, code: REFRESH_UPSTREAM_UNAVAILABLE });
  });

  it("estrae CADENCE_LIMITED dalla Response di FunctionsHttpError (data=null)", async () => {
    const body = { ok: false, code: REFRESH_CADENCE_LIMITED, retry_after_seconds: 780 };
    const response = new Response(JSON.stringify(body), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
    const parsed = await readFunctionsInvokePayload(null, {
      name: "FunctionsHttpError",
      message: "Edge Function returned a non-2xx status code",
      context: response,
    });
    expect(parsed).toEqual(body);
    expect(verdictFromRefreshPayload(parsed, true)).toEqual({
      kind: "cadence",
      retryAfterSeconds: 780,
    });
  });

  it("non tratta CADENCE_LIMITED come fallimento di prodotto", () => {
    const verdict = verdictFromRefreshPayload(
      { ok: false, code: REFRESH_CADENCE_LIMITED, retry_after_seconds: 900 },
      true,
    );
    expect(verdict).toEqual({ kind: "cadence", retryAfterSeconds: 900 });
    expect(isTransientRefreshVerdict(verdict)).toBe(false);
    expect(toRefreshEnqueueResult(verdict)).toEqual({
      queued: false,
      code: REFRESH_CADENCE_LIMITED,
      retry_after_seconds: 900,
    });
  });

  it("classifica 502 Core come transitorio e ritentabile", () => {
    const verdict = verdictFromRefreshPayload(
      { ok: false, code: REFRESH_UPSTREAM_UNAVAILABLE, reason: "REFRESH_STATUS" },
      true,
    );
    expect(verdict).toEqual({ kind: "upstream" });
    expect(isTransientRefreshVerdict(verdict)).toBe(true);
    expect(classifyRefreshError(new Error(REFRESH_UPSTREAM_UNAVAILABLE))).toEqual({
      kind: "upstream",
    });
    expect(isTransientRefreshVerdict(classifyRefreshError(new Error(REFRESH_QUEUE_FAILED)))).toBe(
      true,
    );
  });

  it("un ok+queued vince sull'error di invoke (202 Accepted)", () => {
    expect(verdictFromRefreshPayload({ ok: true, queued: true }, true)).toEqual({ kind: "queued" });
    expect(classifyRefreshEnqueue({ queued: true })).toEqual({ kind: "queued" });
  });
});

describe("copy esito ricerca", () => {
  it("un Core transitorio non usa il tono error da prodotto", () => {
    const notice = refreshNoticeFor({
      status: "failed",
      reason: REFRESH_UPSTREAM_UNAVAILABLE,
      isProfile: true,
    });
    expect(notice?.tone).toBe("info");
    expect(notice?.text).toMatch(/motore non ha confermato/i);
    expect(notice?.text).toMatch(/restano validi/i);
    expect(notice?.text).not.toMatch(/Aggiornamento non riuscito/);
  });

  it("la cadenza 429 dice che si è cercato di recente e quando riprovare", () => {
    expect(formatRetryAfter(780)).toBe("Riprova tra 13 minuti.");
    expect(formatRetryAfter(40)).toBe("Riprova tra 1 minuto.");
    const notice = refreshNoticeFor({
      status: "queued",
      reason: REFRESH_CADENCE_LIMITED,
      retryAfterSeconds: 780,
      isProfile: true,
    });
    expect(notice?.tone).toBe("info");
    expect(notice?.text).toMatch(/già cercato di recente/i);
    expect(notice?.text).toMatch(/Riprova tra 13 minuti/);
    expect(notice?.text).not.toMatch(/Aggiornamento non riuscito/);
    expect(notice?.text).not.toMatch(/già in corso/i);
  });

  it("non inventa Bandi: cache e fallimento duro lasciano i dati visibili", () => {
    const cache = refreshNoticeFor({
      status: "queued",
      appliedSource: "cache",
      isProfile: true,
      savedLabel: "04/09/2026, 10:00:00",
    });
    expect(cache?.tone).toBe("info");
    expect(cache?.text).toMatch(/dati salvati/);
    const hard = refreshNoticeFor({ status: "failed", isProfile: true });
    expect(hard?.tone).toBe("error");
    expect(hard?.text).toMatch(/I Bandi che vedi restano validi/);
  });
});

describe("proxy e Edge espongono la classificazione", () => {
  it("requestFeedRefresh non collassa 429/502 in un unico throw", () => {
    const proxy = readFileSync("src/lib/proxy-core.functions.ts", "utf8");
    expect(proxy).toContain("readRefreshEnqueue");
    expect(proxy).toContain("REFRESH_CADENCE_LIMITED");
    expect(proxy).toContain("REFRESH_UPSTREAM_UNAVAILABLE");
    const refresh = proxy.slice(
      proxy.indexOf("export const requestFeedRefresh"),
      proxy.indexOf("export const loadCachedFeed"),
    );
    expect(refresh).not.toMatch(/if \(error\) throw new Error\("REFRESH_QUEUE_FAILED"\)/);
    expect(refresh).toContain("await readRefreshEnqueue(data, error, response)");
  });
});
