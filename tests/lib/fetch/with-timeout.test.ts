import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FETCH_TIMEOUT_MS, FetchTimeoutError, withTimeout } from "@/lib/fetch/with-timeout";
import type { FetchImpl } from "@/lib/scraper/types";

/**
 * A fetch that NEVER resolves — the exact failure mode behind the 81-minute
 * stalled digest on 2026-05-22: TeacherEase accepted the connection but never
 * sent a response, and the scraper's fetch had no timeout.
 *
 * It records the signal it was handed so tests can assert that the timeout
 * guard actually aborts the in-flight request (mirrors plugin-http calling
 * `fetch_cancel` on the Rust side).
 */
function makeHangingFetch(): { fetch: FetchImpl; signal: () => AbortSignal | undefined } {
  let captured: AbortSignal | undefined;
  const fetch: FetchImpl = (_url, init) => {
    captured = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      // Behave like a real cancellable request: reject with AbortError when
      // the injected signal fires. With no timeout wrapper, nothing fires it.
      init?.signal?.addEventListener("abort", () => {
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    });
  };
  return { fetch, signal: () => captured };
}

describe("withTimeout — reproduction of the 81-minute stalled scrape", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("BUG BASELINE: a hanging fetch with NO timeout never settles", async () => {
    const { fetch } = makeHangingFetch();

    let settled = false;
    // Call the raw hanging fetch directly — this is pre-fix behaviour.
    void fetch("https://school.example.teacherease.com").then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    // Advance well past any sane request time — 90 minutes — and flush.
    await vi.advanceTimersByTimeAsync(90 * 60_000);

    // The promise is STILL pending. This is the 81-minute hang.
    expect(settled).toBe(false);
  });

  it("FIX: withTimeout aborts the same hanging fetch and rejects fast", async () => {
    const { fetch, signal } = makeHangingFetch();
    const guarded = withTimeout(fetch, 60_000);

    const promise = guarded("https://school.example.teacherease.com");
    const assertion = expect(promise).rejects.toBeInstanceOf(FetchTimeoutError);

    // Just past the 60s ceiling — the guard fires.
    await vi.advanceTimersByTimeAsync(60_001);
    await assertion;

    // The injected signal was actually aborted (request cancelled, not leaked).
    expect(signal()?.aborted).toBe(true);
  });

  it("FIX: error carries the timeout value for user-facing messaging", async () => {
    const { fetch } = makeHangingFetch();
    const guarded = withTimeout(fetch, 30_000);

    const promise = guarded("https://school.example.teacherease.com");
    const assertion = promise.catch((e) => e);

    await vi.advanceTimersByTimeAsync(30_001);
    const err = await assertion;

    expect(err).toBeInstanceOf(FetchTimeoutError);
    expect((err as FetchTimeoutError).timeoutMs).toBe(30_000);
  });
});

describe("withTimeout — does not interfere with healthy requests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a fast response passes straight through, timer cleared", async () => {
    const ok = new Response("ok", { status: 200 });
    const fast: FetchImpl = () => Promise.resolve(ok);
    const guarded = withTimeout(fast, 60_000);

    const res = await guarded("https://school.example.teacherease.com");
    expect(res.status).toBe(200);

    // No dangling timers left to fire.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a real network error is re-thrown unchanged (not masked as a timeout)", async () => {
    const netErr = new TypeError("Network error");
    const failing: FetchImpl = () => Promise.reject(netErr);
    const guarded = withTimeout(failing, 60_000);

    await expect(guarded("https://school.example.teacherease.com")).rejects.toBe(netErr);
  });

  it("a caller-supplied signal still aborts the request (not swallowed)", async () => {
    const { fetch } = makeHangingFetch();
    const guarded = withTimeout(fetch, 60_000);
    const caller = new AbortController();

    const promise = guarded("https://school.example.teacherease.com", {
      signal: caller.signal,
    });
    const assertion = promise.catch((e) => e);

    caller.abort();
    await vi.advanceTimersByTimeAsync(0);
    const err = await assertion;

    // Caller-cancelled, so it surfaces as AbortError — NOT a FetchTimeoutError.
    expect(err).not.toBeInstanceOf(FetchTimeoutError);
    expect((err as Error).name).toBe("AbortError");
  });

  it("default timeout ceiling is 60s", () => {
    expect(DEFAULT_FETCH_TIMEOUT_MS).toBe(60_000);
  });
});
