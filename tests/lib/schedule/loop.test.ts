import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleLoop } from "@/lib/schedule/loop";

describe("ScheduleLoop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-19T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires tick at nextRunAt, then reschedules", async () => {
    const ticks: number[] = [];
    const tick = vi.fn(() => {
      ticks.push(Date.now());
      return Promise.resolve();
    });
    const nextRunAt = vi.fn((now: Date) => new Date(now.getTime() + 60_000));
    const loop = new ScheduleLoop({ nextRunAt, tick, onError: () => undefined });

    loop.start();
    expect(tick).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(2);

    loop.stop();
  });

  it("stop() prevents further ticks", async () => {
    const tick = vi.fn(() => Promise.resolve());
    const loop = new ScheduleLoop({
      nextRunAt: (now) => new Date(now.getTime() + 30_000),
      tick,
      onError: () => undefined,
    });

    loop.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(tick).toHaveBeenCalledTimes(1);

    loop.stop();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("swallows tick errors via onError and keeps running", async () => {
    const onError = vi.fn();
    let count = 0;
    const tick = vi.fn(() => {
      count += 1;
      if (count === 1) throw new Error("boom");
      return Promise.resolve();
    });
    const loop = new ScheduleLoop({
      nextRunAt: (now) => new Date(now.getTime() + 10_000),
      tick,
      onError,
    });

    loop.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe("boom");

    await vi.advanceTimersByTimeAsync(10_000);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);

    loop.stop();
  });

  it("stop() mid-tick prevents rescheduling", async () => {
    const tick = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    const loop = new ScheduleLoop({
      nextRunAt: (now) => new Date(now.getTime() + 1_000),
      tick,
      onError: () => undefined,
    });

    loop.start();
    await vi.advanceTimersByTimeAsync(1_000);
    loop.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(tick).toHaveBeenCalledTimes(1);
  });
});
