/**
 * Classificazione dell'enqueue «Cerca nuovi Bandi».
 * Non inventa Bandi: distingue coda confermata, cadenza, Core transitorio
 * e fallimento duro, così la UI non tratta un 429/502 come errore di prodotto.
 */

export const REFRESH_CADENCE_LIMITED = "CADENCE_LIMITED";
export const REFRESH_UPSTREAM_UNAVAILABLE = "UPSTREAM_UNAVAILABLE";
export const REFRESH_QUEUE_FAILED = "REFRESH_QUEUE_FAILED";

export type RefreshQueueVerdict =
  | { kind: "queued" }
  | { kind: "cadence"; retryAfterSeconds: number }
  | { kind: "upstream" }
  | { kind: "failed"; code: string };

export type RefreshEnqueueResult =
  | { queued: true }
  | { queued: false; code: typeof REFRESH_CADENCE_LIMITED; retry_after_seconds: number }
  | { queued: false; code: typeof REFRESH_UPSTREAM_UNAVAILABLE | typeof REFRESH_QUEUE_FAILED };

function looksLikeResponse(value: unknown): value is Response {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Response).json === "function" &&
    typeof (value as Response).clone === "function" &&
    typeof (value as Response).status === "number"
  );
}

async function parseInvokeContext(ctx: unknown): Promise<unknown> {
  if (ctx == null) return null;
  if (looksLikeResponse(ctx)) {
    try {
      return await ctx.clone().json();
    } catch {
      return null;
    }
  }
  if (typeof ctx === "object" && !Array.isArray(ctx) && ("code" in ctx || "queued" in ctx)) {
    return ctx;
  }
  return null;
}

/**
 * supabase-js su 429/502 lascia `data` a null e mette il body nella Response
 * di `error.context`. Senza questo parse CADENCE_LIMITED diventava un hard fail.
 */
export async function readFunctionsInvokePayload(
  data: unknown,
  error: unknown,
  response?: unknown,
): Promise<unknown> {
  if (data != null) return data;
  const fromResponse = await parseInvokeContext(response);
  if (fromResponse != null) return fromResponse;
  if (!error || typeof error !== "object") return null;
  return parseInvokeContext((error as { context?: unknown }).context);
}

function asRecord(payload: unknown): Record<string, unknown> | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

export function verdictFromRefreshPayload(
  payload: unknown,
  invokeFailed: boolean,
): RefreshQueueVerdict {
  const body = asRecord(payload);
  if (body?.ok === true && body.queued === true) return { kind: "queued" };
  const code = typeof body?.code === "string" ? body.code : "";
  if (code === REFRESH_CADENCE_LIMITED) {
    const retry = Number(body?.retry_after_seconds);
    return {
      kind: "cadence",
      retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? Math.floor(retry) : 0,
    };
  }
  if (
    code === REFRESH_UPSTREAM_UNAVAILABLE ||
    code === "REFRESH_STATUS" ||
    code === "REFRESH_NOT_QUEUED" ||
    code === "REFRESH_SHAPE"
  ) {
    return { kind: "upstream" };
  }
  if (invokeFailed) return { kind: "failed", code: code || REFRESH_QUEUE_FAILED };
  if (!body) return { kind: "failed", code: REFRESH_QUEUE_FAILED };
  return { kind: "failed", code: code || REFRESH_QUEUE_FAILED };
}

export function classifyRefreshEnqueue(value: unknown): RefreshQueueVerdict {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    if (row.queued === true) return { kind: "queued" };
    return verdictFromRefreshPayload(value, false);
  }
  if (value == null) return { kind: "queued" };
  return { kind: "failed", code: REFRESH_QUEUE_FAILED };
}

export function classifyRefreshError(error: unknown): RefreshQueueVerdict {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (msg.includes(REFRESH_CADENCE_LIMITED)) {
    const match = msg.match(/retry_after_seconds[=:](\d+)/i);
    return { kind: "cadence", retryAfterSeconds: match ? Number(match[1]) : 0 };
  }
  if (msg.includes(REFRESH_UPSTREAM_UNAVAILABLE) || msg.includes("UPSTREAM_UNAVAILABLE")) {
    return { kind: "upstream" };
  }
  return { kind: "failed", code: REFRESH_QUEUE_FAILED };
}

export function isTransientRefreshVerdict(verdict: RefreshQueueVerdict): boolean {
  return (
    verdict.kind === "upstream" ||
    (verdict.kind === "failed" && verdict.code === REFRESH_QUEUE_FAILED)
  );
}

export type RefreshNoticeTone = "ok" | "info" | "error";

export function formatRetryAfter(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "Riprova tra poco con Cerca nuovi Bandi.";
  }
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1 ? "Riprova tra 1 minuto." : `Riprova tra ${minutes} minuti.`;
}

export function refreshNoticeFor(input: {
  status: "updated" | "queued" | "failed" | "aborted";
  reason?: string;
  retryAfterSeconds?: number;
  appliedSource?: "central-core" | "cache";
  isProfile: boolean;
  savedLabel?: string | null;
}): { tone: RefreshNoticeTone; text: string } | null {
  if (input.status === "aborted") return null;
  if (input.appliedSource === "cache") {
    return {
      tone: "info",
      text: input.savedLabel
        ? `Il motore non è raggiungibile in questo momento. Restano visibili i dati salvati, aggiornati al ${input.savedLabel}.`
        : "Il motore non è raggiungibile in questo momento. Restano visibili i dati salvati.",
    };
  }
  if (input.appliedSource === "central-core") {
    return {
      tone: "ok",
      text: input.isProfile
        ? "Ricerca completata. Qui sotto trovi i Bandi aggiornati per la tua impresa."
        : "Ricerca completata. Qui sotto trovi i Bandi aggiornati.",
    };
  }
  if (input.status === "queued" && input.reason === REFRESH_CADENCE_LIMITED) {
    return {
      tone: "info",
      text: `Hai già cercato di recente. I Bandi che vedi restano validi. ${formatRetryAfter(input.retryAfterSeconds ?? 0)}`,
    };
  }
  if (input.status === "queued") {
    return {
      tone: "info",
      text: input.isProfile
        ? "Ricerca avviata. I nuovi Bandi compariranno qui su «Per la mia impresa»: puoi chiudere l'app, nessuna azione richiesta."
        : "Ricerca avviata. I nuovi Bandi compariranno qui: puoi chiudere l'app, nessuna azione richiesta.",
    };
  }
  if (input.status === "failed" && input.reason === REFRESH_UPSTREAM_UNAVAILABLE) {
    return {
      tone: "info",
      text: "Il motore non ha confermato l'aggiornamento. I Bandi che vedi restano validi. Riprova con Cerca nuovi Bandi.",
    };
  }
  if (input.status === "failed") {
    return {
      tone: "error",
      text: "Aggiornamento non riuscito. I Bandi che vedi restano validi. Riprova con Cerca nuovi Bandi.",
    };
  }
  return null;
}

export function toRefreshEnqueueResult(verdict: RefreshQueueVerdict): RefreshEnqueueResult {
  if (verdict.kind === "queued") return { queued: true };
  if (verdict.kind === "cadence") {
    return {
      queued: false,
      code: REFRESH_CADENCE_LIMITED,
      retry_after_seconds: verdict.retryAfterSeconds,
    };
  }
  if (verdict.kind === "upstream") return { queued: false, code: REFRESH_UPSTREAM_UNAVAILABLE };
  return { queued: false, code: REFRESH_QUEUE_FAILED };
}
