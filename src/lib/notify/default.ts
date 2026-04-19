// NotifyRouter factory wired against real IPC deps (Q27). Keeps
// construction out of buildFetchRunner (runner no longer owns notify).
// Dashboard's handleRefresh calls buildNotifyRouter() after the scrape
// loop completes, dispatches one digest.

import { log, logWarning } from "@/lib/ipc";
import { EmailChannel } from "./email-channel";
import { OSChannel } from "./os-channel";
import { NotifyRouter } from "./router";

export function buildNotifyRouter(): NotifyRouter {
  return new NotifyRouter([new OSChannel(), new EmailChannel()], { log, logWarning });
}
