// End-to-end reproduction of the production `tauriFetch` wiring.
//
// `tauriFetch` in ipc.ts is `withTimeout((url, init) => pluginFetch(...))`.
// We can't import ipc.ts in a unit test (it pulls in @tauri-apps/*), so we
// rebuild the exact same wrapper shape around a stand-in for `pluginFetch`
// and prove: BEFORE the fix it hangs forever, AFTER it aborts in 60s.
//
// This is the proof for the 2026-05-22 incident: 25 scrapes in the retained
// logs ran 2 min - 18 hr because the scraper fetch had no timeout.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FetchTimeoutError, withTimeout } from "@/lib/fetch/with-timeout";
import type { FetchImpl } from "@/lib/scraper/types";

/** Stand-in for `@tauri-apps/plugin-http`'s fetch: a request that connects
 * but never responds — TeacherEase's observed stall behaviour. */
const hangingPluginFetch: FetchImpl = (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () =>
      reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
    );
  });

describe("tauriFetch wiring — 2026-05-22 stalled-digest incident", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("BEFORE FIX: bare pluginFetch (no timeout) hangs past 18 hours", async () => {
    // This mirrors the OLD `tauriFetch = (url, init) => pluginFetch(url, init)`.
    const oldTauriFetch: FetchImpl = (url, init) => hangingPluginFetch(url, init);

    let settled = false;
    void oldTauriFetch("https://school.example.teacherease.com").then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    // The worst real hang was id=91 at 1077 min — advance past 19 hours.
    await vi.advanceTimersByTimeAsync(19 * 60 * 60_000);
    expect(settled).toBe(false); // still hung — the bug
  });

  it("AFTER FIX: withTimeout-wrapped tauriFetch aborts in 60s", async () => {
    // This mirrors the NEW `tauriFetch = withTimeout((url, init) => pluginFetch(...))`.
    const newTauriFetch = withTimeout((url, init) => hangingPluginFetch(url, init));

    const promise = newTauriFetch("https://school.example.teacherease.com");
    const assertion = expect(promise).rejects.toBeInstanceOf(FetchTimeoutError);

    await vi.advanceTimersByTimeAsync(60_001);
    await assertion; // failed fast — the fix
  });
});
