// NotifyRouter (Q21 / Q27). Fans a RefreshDigest out to every channel,
// sequentially. Per-channel error isolation — one failure is logged and
// does not prevent the next channel from running. Deps are injected so
// the router is unit-testable without Tauri (mirrors FetchRunner's pattern).

import type { NotifyChannel, NotifyRouterDeps, RefreshDigest } from "./types";

export class NotifyRouter {
  constructor(
    private readonly channels: readonly NotifyChannel[],
    private readonly deps: NotifyRouterDeps,
  ) {}

  async dispatch(digest: RefreshDigest): Promise<void> {
    for (const ch of this.channels) {
      if (!(await ch.isEnabled(digest))) continue;
      try {
        await ch.send(digest);
        await this.deps.log(`notify: ${ch.name} ${digest.type} sent`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        await this.deps.logWarning(`notify: ${ch.name} ${digest.type} failed — ${msg}`);
      }
    }
  }
}
