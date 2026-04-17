// Default FetchRunner factory (P8). Wires the runner + its NotifyRouter
// against the real IPC deps so call sites (dashboard, wizard) don't duplicate
// the construction boilerplate.

import { completeFetchRun, log, logErr, logWarning, startFetchRun } from "@/lib/ipc";
import { EmailChannel } from "@/lib/notify/email-channel";
import { OSChannel } from "@/lib/notify/os-channel";
import { NotifyRouter } from "@/lib/notify/router";
import { FetchRunner } from "./runner";
import type { FetchSource } from "./types";

export function buildFetchRunner(sources: readonly FetchSource[]): FetchRunner {
  const notify = new NotifyRouter([new OSChannel(), new EmailChannel()], { log, logWarning });
  return new FetchRunner(sources, {
    startFetchRun,
    completeFetchRun,
    log,
    logErr,
    notify,
  });
}
