import { describe, expect, it } from "vitest";
import {
  computeNotifyNextRun,
  NOTIFY_TIME_DEFAULT,
  parseNotifyTime,
} from "@/lib/schedule/notify-schedule";

describe("parseNotifyTime", () => {
  it("passes through valid HH:MM", () => {
    expect(parseNotifyTime("07:00")).toBe("07:00");
    expect(parseNotifyTime("23:59")).toBe("23:59");
    expect(parseNotifyTime("00:00")).toBe("00:00");
  });

  it("zero-pads single-digit hour", () => {
    expect(parseNotifyTime("7:00")).toBe("07:00");
    expect(parseNotifyTime("9:05")).toBe("09:05");
  });

  it("defaults on garbage", () => {
    expect(parseNotifyTime("")).toBe(NOTIFY_TIME_DEFAULT);
    expect(parseNotifyTime(undefined)).toBe(NOTIFY_TIME_DEFAULT);
    expect(parseNotifyTime("abc")).toBe(NOTIFY_TIME_DEFAULT);
    expect(parseNotifyTime("25:00")).toBe(NOTIFY_TIME_DEFAULT);
    expect(parseNotifyTime("12:60")).toBe(NOTIFY_TIME_DEFAULT);
    expect(parseNotifyTime("-1:00")).toBe(NOTIFY_TIME_DEFAULT);
  });
});

describe("computeNotifyNextRun", () => {
  it("returns today's HH:MM when still ahead", () => {
    const now = new Date(2026, 3, 19, 6, 0);
    const next = computeNotifyNextRun(now, "07:00");
    expect(next.getHours()).toBe(7);
    expect(next.getMinutes()).toBe(0);
    expect(next.getDate()).toBe(19);
  });

  it("rolls to tomorrow when now is exactly on the time (strict >)", () => {
    const now = new Date(2026, 3, 19, 7, 0, 0);
    const next = computeNotifyNextRun(now, "07:00");
    expect(next.getHours()).toBe(7);
    expect(next.getDate()).toBe(20);
  });

  it("rolls to tomorrow when past today's time", () => {
    const now = new Date(2026, 3, 19, 8, 30);
    const next = computeNotifyNextRun(now, "07:00");
    expect(next.getDate()).toBe(20);
  });

  it("handles midnight", () => {
    const now = new Date(2026, 3, 19, 23, 30);
    const next = computeNotifyNextRun(now, "00:00");
    expect(next.getHours()).toBe(0);
    expect(next.getDate()).toBe(20);
  });
});
