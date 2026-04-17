// NotifyRouter (Q20 / P6). Fans a NotifyEvent out to every channel, sequentially.
// Per-channel error isolation — one failure is logged and does not prevent the
// next channel from running. Deps are injected so the router is unit-testable
// without Tauri (mirrors FetchRunner's pattern).

import type { NotifyChannel, NotifyEvent, NotifyRouterDeps } from "./types";

export class NotifyRouter {
  constructor(
    private readonly channels: readonly NotifyChannel[],
    private readonly deps: NotifyRouterDeps,
  ) {}

  async dispatch(event: NotifyEvent): Promise<void> {
    for (const ch of this.channels) {
      if (!(await ch.isEnabled(event))) continue;
      try {
        await ch.send(event);
        await this.deps.log(`notify: ${ch.name} ${event.type} sent`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        await this.deps.logWarning(`notify: ${ch.name} ${event.type} failed — ${msg}`);
      }
    }
  }
}
