import type { FeedResponse } from "./bandocore-types";
import {
  REFRESH_CADENCE_LIMITED,
  REFRESH_UPSTREAM_UNAVAILABLE,
  classifyRefreshEnqueue,
  classifyRefreshError,
  isTransientRefreshVerdict,
  type RefreshQueueVerdict,
} from "./refresh-enqueue";

/**
 * Marker di freschezza del feed.
 * Se il Core fornisce realmente `generated_at` lo usiamo come marker autorevole
 * (mai simulato). Altrimenti calcoliamo una fingerprint deterministica del solo
 * contenuto stabile del feed: MAI `fetched_at` né `source`, che cambiano ad ogni
 * lettura e produrrebbero falsi "aggiornato".
 */
export function feedMarker(feed: FeedResponse | null | undefined): string {
  if (!feed) return "";
  if (feed.generated_at) return `g:${feed.generated_at}`;
  const rows = (feed.bandi ?? [])
    .map((b) =>
      [
        b.id,
        b.last_verified_at ?? "",
        b.scadenza ?? "",
        b.apertura ?? "",
        b.verification_status ?? "",
        b.match?.status ?? "",
        b.titolo ?? "",
        b.importo_max ?? "",
      ].join("~"),
    )
    .sort()
    .join("|");
  return `c:${feed.bandi?.length ?? 0}:${fnv1a(rows)}`;
}

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

export const DEFAULT_REFRESH_DELAYS_MS = [1500, 3000, 6000];

/**
 * «Per la mia impresa»: il Core deve completare l'abbinamento dopo l'enqueue,
 * quindi la finestra è più lunga ma sempre limitata (max ~31s, nessun loop).
 */
export const PROFILE_REFRESH_DELAYS_MS = [1500, 3000, 6000, 9000, 12000];

export type RefreshStatus = "updated" | "queued" | "failed" | "aborted";

export interface BoundedRefreshResult {
  status: RefreshStatus;
  feed?: FeedResponse;
  /** Numero di fetch del feed effettuati (mai enqueue). */
  attempts: number;
  /** 0 o 1: al più una coda confermata. Un retry transitorio non conta come seconda coda. */
  enqueued: number;
  /** Codice classificato (cadenza, Core transitorio, coda). */
  reason?: string;
}

export interface BoundedRefreshOptions {
  /** Accoda request_refresh. Invocato UNA sola volta. */
  enqueue: () => Promise<unknown>;
  /** Legge il feed senza accodare nulla. */
  fetchFeed: () => Promise<FeedResponse>;
  baselineMarker: string;
  delaysMs?: number[];
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function defaultSleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Refresh manuale bounded: 1 enqueue (con un retry se il Core è transitorio) +
 * al massimo `delaysMs.length` letture del feed con backoff breve. Si ferma
 * appena il marker cambia; allo scadere dei tentativi restituisce "queued"
 * senza toccare i dati precedenti. Ogni step controlla `signal` per uscire
 * in sicurezza allo unmount.
 */
export async function runBoundedRefresh(
  options: BoundedRefreshOptions,
): Promise<BoundedRefreshResult> {
  const delays = options.delaysMs ?? DEFAULT_REFRESH_DELAYS_MS;
  const sleep = options.sleep ?? defaultSleep;
  const aborted = () => options.signal?.aborted === true;

  if (aborted()) return { status: "aborted", attempts: 0, enqueued: 0 };

  const first = await runEnqueue(options.enqueue);
  const enqueueVerdict = isTransientRefreshVerdict(first)
    ? await runEnqueue(options.enqueue)
    : first;
  if (enqueueVerdict.kind === "failed" || enqueueVerdict.kind === "upstream") {
    return {
      status: "failed",
      attempts: 0,
      enqueued: 0,
      reason:
        enqueueVerdict.kind === "upstream" ? REFRESH_UPSTREAM_UNAVAILABLE : enqueueVerdict.code,
    };
  }
  const enqueued = enqueueVerdict.kind === "queued" ? 1 : 0;
  const reason = enqueueVerdict.kind === "cadence" ? REFRESH_CADENCE_LIMITED : undefined;

  let attempts = 0;
  for (const delay of delays) {
    if (aborted()) return { status: "aborted", attempts, enqueued };
    await sleep(delay, options.signal);
    if (aborted()) return { status: "aborted", attempts, enqueued };
    attempts++;
    try {
      const feed = await options.fetchFeed();
      if (aborted()) return { status: "aborted", attempts, enqueued };
      if (feedMarker(feed) !== options.baselineMarker)
        return { status: "updated", feed, attempts, enqueued };
    } catch {
      // Errore transitorio: nessun re-enqueue, si passa al tentativo successivo.
    }
  }
  return { status: "queued", attempts, enqueued, reason };
}

async function runEnqueue(enqueue: () => Promise<unknown>): Promise<RefreshQueueVerdict> {
  try {
    return classifyRefreshEnqueue(await enqueue());
  } catch (error) {
    return classifyRefreshError(error);
  }
}
