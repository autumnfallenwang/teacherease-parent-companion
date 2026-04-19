// Default FetchRunner factory (P8 / Q27). Wires the runner against the
// real IPC deps so call sites (dashboard, wizard) don't duplicate the
// construction boilerplate.  NotifyRouter construction moved to
// `src/lib/notify/default.ts` — runner is no longer responsible for it.

import { completeFetchRun, log, logErr, startFetchRun } from "@/lib/ipc";
import { FetchRunner } from "./runner";
import type { FetchSource } from "./types";

export function buildFetchRunner(sources: readonly FetchSource[]): FetchRunner {
  return new FetchRunner(sources, {
    startFetchRun,
    completeFetchRun,
    log,
    logErr,
  });
}
