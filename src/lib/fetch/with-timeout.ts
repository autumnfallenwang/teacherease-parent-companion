// Wraps any FetchImpl with an abort-on-timeout guard.
//
// Why this exists: the production scraper fetch (`tauriFetch` in ipc.ts) had
// no timeout. On the ~1-2 days in 10 where TeacherEase accepts the connection
// but never sends a response, the scheduled 3:15 PM digest scrape would hang
// indefinitely — observed once stalling 81 minutes (durationMs=4871727) until
// the OS happened to nudge the socket awake. See docs/lessons.md.
//
// `plugin-http` honors `RequestInit.signal` end-to-end (it calls
// `plugin:http|fetch_cancel` on the Rust side), so an AbortController timeout
// genuinely cancels a stalled request rather than just abandoning the promise.
//
// Pure module: no Tauri imports, so it is unit-testable with an injected fetch.

import type { FetchImpl } from "@/lib/scraper/types";

/** Default per-request ceiling for scraper HTTP. A healthy TeacherEase scrape
 * completes in seconds; 60s is generous headroom while still failing fast. */
export const DEFAULT_FETCH_TIMEOUT_MS = 60_000;

/** Thrown when a request is aborted by the timeout guard. Distinct from a
 * network error so callers can surface "the portal stopped responding". */
export class FetchTimeoutError extends Error {
  constructor(
    public readonly timeoutMs: number,
    options?: { cause?: unknown },
  ) {
    super(`Request timed out after ${timeoutMs}ms`, options);
    this.name = "FetchTimeoutError";
  }
}

/**
 * Decorate a `FetchImpl` so every request aborts if it has not settled within
 * `timeoutMs`. If the caller passes its own `signal`, both are honored — the
 * request aborts when either fires.
 */
export function withTimeout(
  inner: FetchImpl,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): FetchImpl {
  return async (url, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Respect a caller-supplied signal in addition to our timeout.
    const callerSignal = init?.signal;
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort();
      } else {
        callerSignal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }
    }

    try {
      return await inner(url, { ...init, signal: controller.signal });
    } catch (err) {
      // Our timer firing surfaces as an AbortError — translate it so callers
      // can tell "timed out" apart from "user cancelled" / "network down".
      if (
        controller.signal.aborted &&
        !(callerSignal?.aborted ?? false) &&
        err instanceof Error &&
        err.name === "AbortError"
      ) {
        throw new FetchTimeoutError(timeoutMs, { cause: err });
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}
