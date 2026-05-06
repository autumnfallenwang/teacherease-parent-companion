import { describe, expect, it, vi } from "vitest";
import { buildRefreshDigest } from "@/lib/notify/digest";
import { NotifyRouter } from "@/lib/notify/router";
import type { NotifyChannel, NotifyRouterDeps, RefreshDigest } from "@/lib/notify/types";

function makeDeps(): NotifyRouterDeps & {
  log: ReturnType<typeof vi.fn>;
  logWarning: ReturnType<typeof vi.fn>;
} {
  return {
    log: vi.fn().mockResolvedValue(undefined),
    logWarning: vi.fn().mockResolvedValue(undefined),
  };
}

function channel(opts: {
  name: string;
  enabled?: boolean;
  send?: (d: RefreshDigest, locale: "en" | "es" | "zh") => Promise<void>;
}): NotifyChannel {
  return {
    name: opts.name,
    isEnabled: () => Promise.resolve(opts.enabled ?? true),
    send: opts.send ?? (() => Promise.resolve()),
  };
}

const emptyDigest: RefreshDigest = buildRefreshDigest({
  children: [],
  perChildDetails: new Map(),
  perChildHomeworkForToday: new Map(),
  perChildHomeworkDueToday: new Map(),
  perChildHeroCounts: new Map(),
  failures: [],
  cfg: { forgivenessWeeks: 2, lowScoreThreshold: 3 },
  now: new Date("2026-04-19T12:00:00Z"),
});

describe("NotifyRouter", () => {
  it("dispatches the digest to a single enabled channel", async () => {
    const deps = makeDeps();
    const send = vi.fn().mockResolvedValue(undefined);
    const ch = channel({ name: "os", send });
    const router = new NotifyRouter([ch], deps);

    await router.dispatch(emptyDigest, "en");

    expect(send).toHaveBeenCalledWith(emptyDigest, "en");
    expect(deps.log).toHaveBeenCalledWith("notify: os refreshDigest sent");
    expect(deps.logWarning).not.toHaveBeenCalled();
  });

  it("skips a channel where isEnabled returns false", async () => {
    const deps = makeDeps();
    const send = vi.fn().mockResolvedValue(undefined);
    const ch = channel({ name: "os", enabled: false, send });
    const router = new NotifyRouter([ch], deps);

    await router.dispatch(emptyDigest, "en");

    expect(send).not.toHaveBeenCalled();
    expect(deps.log).not.toHaveBeenCalled();
    expect(deps.logWarning).not.toHaveBeenCalled();
  });

  it("dispatches to multiple channels in declared order", async () => {
    const deps = makeDeps();
    const order: string[] = [];
    const a = channel({
      name: "os",
      send: () => {
        order.push("os");
        return Promise.resolve();
      },
    });
    const b = channel({
      name: "email",
      send: () => {
        order.push("email");
        return Promise.resolve();
      },
    });
    const router = new NotifyRouter([a, b], deps);

    await router.dispatch(emptyDigest, "en");

    expect(order).toEqual(["os", "email"]);
    expect(deps.log).toHaveBeenNthCalledWith(1, "notify: os refreshDigest sent");
    expect(deps.log).toHaveBeenNthCalledWith(2, "notify: email refreshDigest sent");
  });

  it("catches a channel error, logs warning, and continues to the next channel", async () => {
    const deps = makeDeps();
    const failing = channel({
      name: "os",
      send: () => Promise.reject(new Error("permission revoked")),
    });
    const working = vi.fn().mockResolvedValue(undefined);
    const ok = channel({ name: "email", send: working });
    const router = new NotifyRouter([failing, ok], deps);

    await router.dispatch(emptyDigest, "en");

    expect(working).toHaveBeenCalledWith(emptyDigest, "en");
    expect(deps.logWarning).toHaveBeenCalledWith(
      "notify: os refreshDigest failed — permission revoked",
    );
    expect(deps.log).toHaveBeenCalledWith("notify: email refreshDigest sent");
  });

  it("passes the exact digest object through to send", async () => {
    const deps = makeDeps();
    const send = vi.fn().mockResolvedValue(undefined);
    const router = new NotifyRouter([channel({ name: "os", send })], deps);

    await router.dispatch(emptyDigest, "en");

    expect(send).toHaveBeenCalledWith(emptyDigest, "en");
  });

  it("logs the success line with channel name and event type", async () => {
    const deps = makeDeps();
    const router = new NotifyRouter([channel({ name: "email" })], deps);

    await router.dispatch(emptyDigest, "en");

    expect(deps.log).toHaveBeenCalledWith("notify: email refreshDigest sent");
  });

  it("logs the failure line with channel name, event type, and error message", async () => {
    const deps = makeDeps();
    const router = new NotifyRouter(
      [channel({ name: "os", send: () => Promise.reject(new Error("boom")) })],
      deps,
    );

    await router.dispatch(emptyDigest, "en");

    expect(deps.logWarning).toHaveBeenCalledWith("notify: os refreshDigest failed — boom");
  });

  it('translates non-Error throws to "unknown"', async () => {
    const deps = makeDeps();
    const router = new NotifyRouter(
      [channel({ name: "os", send: () => Promise.reject("not an Error") })],
      deps,
    );

    await router.dispatch(emptyDigest, "en");

    expect(deps.logWarning).toHaveBeenCalledWith("notify: os refreshDigest failed — unknown");
  });
});
