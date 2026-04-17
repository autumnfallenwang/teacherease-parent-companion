import { describe, expect, it, vi } from "vitest";
import { NotifyRouter } from "@/lib/notify/router";
import type { NotifyChannel, NotifyEvent, NotifyRouterDeps } from "@/lib/notify/types";

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
  send?: (event: NotifyEvent) => Promise<void>;
}): NotifyChannel {
  return {
    name: opts.name,
    isEnabled: () => Promise.resolve(opts.enabled ?? true),
    send: opts.send ?? (() => Promise.resolve()),
  };
}

const gradesEvent: NotifyEvent = {
  type: "gradesAttention",
  childName: "Alex",
  attentionCount: 2,
  missingCount: 1,
};

describe("NotifyRouter", () => {
  it("dispatches the event to a single enabled channel", async () => {
    const deps = makeDeps();
    const send = vi.fn().mockResolvedValue(undefined);
    const ch = channel({ name: "os", send });
    const router = new NotifyRouter([ch], deps);

    await router.dispatch(gradesEvent);

    expect(send).toHaveBeenCalledWith(gradesEvent);
    expect(deps.log).toHaveBeenCalledWith("notify: os gradesAttention sent");
    expect(deps.logWarning).not.toHaveBeenCalled();
  });

  it("skips a channel where isEnabled returns false", async () => {
    const deps = makeDeps();
    const send = vi.fn().mockResolvedValue(undefined);
    const ch = channel({ name: "os", enabled: false, send });
    const router = new NotifyRouter([ch], deps);

    await router.dispatch(gradesEvent);

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

    await router.dispatch(gradesEvent);

    expect(order).toEqual(["os", "email"]);
    expect(deps.log).toHaveBeenNthCalledWith(1, "notify: os gradesAttention sent");
    expect(deps.log).toHaveBeenNthCalledWith(2, "notify: email gradesAttention sent");
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

    await router.dispatch(gradesEvent);

    expect(working).toHaveBeenCalledWith(gradesEvent);
    expect(deps.logWarning).toHaveBeenCalledWith(
      "notify: os gradesAttention failed — permission revoked",
    );
    expect(deps.log).toHaveBeenCalledWith("notify: email gradesAttention sent");
  });

  it("passes the exact event object through to send", async () => {
    const deps = makeDeps();
    const send = vi.fn().mockResolvedValue(undefined);
    const router = new NotifyRouter([channel({ name: "os", send })], deps);

    const homeworkEvent: NotifyEvent = {
      type: "newHomework",
      childName: "Alex",
      isoDate: "2026-04-17",
      subjectCount: 3,
    };
    await router.dispatch(homeworkEvent);

    expect(send).toHaveBeenCalledWith(homeworkEvent);
  });

  it("logs the success line with channel name and event type", async () => {
    const deps = makeDeps();
    const router = new NotifyRouter([channel({ name: "email" })], deps);

    await router.dispatch({
      type: "newHomework",
      childName: "Alex",
      isoDate: "2026-04-17",
      subjectCount: 2,
    });

    expect(deps.log).toHaveBeenCalledWith("notify: email newHomework sent");
  });

  it("logs the failure line with channel name, event type, and error message", async () => {
    const deps = makeDeps();
    const router = new NotifyRouter(
      [channel({ name: "os", send: () => Promise.reject(new Error("boom")) })],
      deps,
    );

    await router.dispatch(gradesEvent);

    expect(deps.logWarning).toHaveBeenCalledWith("notify: os gradesAttention failed — boom");
  });

  it('translates non-Error throws to "unknown"', async () => {
    const deps = makeDeps();
    const router = new NotifyRouter(
      [channel({ name: "os", send: () => Promise.reject("not an Error") })],
      deps,
    );

    await router.dispatch(gradesEvent);

    expect(deps.logWarning).toHaveBeenCalledWith("notify: os gradesAttention failed — unknown");
  });
});
