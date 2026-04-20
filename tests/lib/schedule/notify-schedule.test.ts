import { describe, expect, it } from "vitest";
import {
  computeNotifyNextRun,
  computeNotifySlots,
  NOTIFY_FIRST_SLOT_DEFAULT,
  NOTIFY_RUNS_PER_DAY_DEFAULT,
  parseNotifyFirstSlot,
  parseNotifyRunsPerDay,
} from "@/lib/schedule/notify-schedule";

describe("parseNotifyRunsPerDay", () => {
  it("defaults when input is garbage", () => {
    expect(parseNotifyRunsPerDay("")).toBe(NOTIFY_RUNS_PER_DAY_DEFAULT);
    expect(parseNotifyRunsPerDay(undefined)).toBe(NOTIFY_RUNS_PER_DAY_DEFAULT);
    expect(parseNotifyRunsPerDay("abc")).toBe(NOTIFY_RUNS_PER_DAY_DEFAULT);
  });

  it("clamps to [1, 8]", () => {
    expect(parseNotifyRunsPerDay("0")).toBe(1);
    expect(parseNotifyRunsPerDay("-3")).toBe(1);
    expect(parseNotifyRunsPerDay("9")).toBe(8);
    expect(parseNotifyRunsPerDay("100")).toBe(8);
  });

  it("passes through valid values", () => {
    expect(parseNotifyRunsPerDay("1")).toBe(1);
    expect(parseNotifyRunsPerDay("4")).toBe(4);
    expect(parseNotifyRunsPerDay("8")).toBe(8);
  });
});

describe("parseNotifyFirstSlot", () => {
  it("passes through valid HH:MM", () => {
    expect(parseNotifyFirstSlot("00:00")).toBe("00:00");
    expect(parseNotifyFirstSlot("07:00")).toBe("07:00");
    expect(parseNotifyFirstSlot("23:59")).toBe("23:59");
  });

  it("zero-pads single-digit hour", () => {
    expect(parseNotifyFirstSlot("7:30")).toBe("07:30");
  });

  it("defaults on garbage / out-of-range", () => {
    expect(parseNotifyFirstSlot("")).toBe(NOTIFY_FIRST_SLOT_DEFAULT);
    expect(parseNotifyFirstSlot(undefined)).toBe(NOTIFY_FIRST_SLOT_DEFAULT);
    expect(parseNotifyFirstSlot("abc")).toBe(NOTIFY_FIRST_SLOT_DEFAULT);
    expect(parseNotifyFirstSlot("25:00")).toBe(NOTIFY_FIRST_SLOT_DEFAULT);
    expect(parseNotifyFirstSlot("12:60")).toBe(NOTIFY_FIRST_SLOT_DEFAULT);
  });
});

describe("computeNotifySlots", () => {
  it("single slot equals anchor minutes", () => {
    expect(computeNotifySlots(1, "07:00")).toEqual([420]);
  });

  it("two slots = anchor + 12h", () => {
    expect(computeNotifySlots(2, "07:00")).toEqual([420, 1140]);
  });

  it("wraps past midnight for late anchors", () => {
    expect(computeNotifySlots(4, "18:00")).toEqual([1080, 0, 360, 720]);
  });
});

describe("computeNotifyNextRun (no weekdaysOnly)", () => {
  it("returns today's HH:MM when still ahead", () => {
    const now = new Date(2026, 3, 20, 6, 0); // Mon April 20 06:00
    const next = computeNotifyNextRun(now, 1, "07:00");
    expect(next.getHours()).toBe(7);
    expect(next.getDate()).toBe(20);
  });

  it("rolls to tomorrow when exactly on the time (strict >)", () => {
    const now = new Date(2026, 3, 20, 7, 0, 0);
    const next = computeNotifyNextRun(now, 1, "07:00");
    expect(next.getDate()).toBe(21);
  });

  it("rolls to tomorrow when past today's time", () => {
    const now = new Date(2026, 3, 20, 8, 30);
    const next = computeNotifyNextRun(now, 1, "07:00");
    expect(next.getDate()).toBe(21);
  });

  it("n=2 at 10:00 anchor=07:00 → next is 19:00 today", () => {
    const now = new Date(2026, 3, 20, 10, 0);
    const next = computeNotifyNextRun(now, 2, "07:00");
    expect(next.getHours()).toBe(19);
    expect(next.getDate()).toBe(20);
  });
});

describe("computeNotifyNextRun (weekdaysOnly)", () => {
  it("Saturday 08:00 + n=1 firstSlotAt=07:00 → Monday 07:00", () => {
    const sat = new Date(2026, 3, 18, 8, 0); // Sat April 18
    const next = computeNotifyNextRun(sat, 1, "07:00", true);
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(20);
    expect(next.getHours()).toBe(7);
  });

  it("Sunday 06:00 + n=1 firstSlotAt=07:00 → Monday 07:00 (not Sunday's 07:00)", () => {
    const sun = new Date(2026, 3, 19, 6, 0); // Sun April 19
    const next = computeNotifyNextRun(sun, 1, "07:00", true);
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(20);
    expect(next.getHours()).toBe(7);
  });

  it("Friday 10:00 + n=1 firstSlotAt=07:00 → Monday 07:00 (past Fri, skip weekend)", () => {
    const fri = new Date(2026, 3, 17, 10, 0); // Fri April 17 past 07:00
    const next = computeNotifyNextRun(fri, 1, "07:00", true);
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(20);
  });

  it("Friday 06:00 + n=1 → Friday 07:00 (no weekend crossing)", () => {
    const fri = new Date(2026, 3, 17, 6, 0);
    const next = computeNotifyNextRun(fri, 1, "07:00", true);
    expect(next.getDay()).toBe(5);
    expect(next.getHours()).toBe(7);
    expect(next.getDate()).toBe(17);
  });

  it("weekdaysOnly=false on Saturday → next slot tomorrow (no skip)", () => {
    const sat = new Date(2026, 3, 18, 8, 0);
    const next = computeNotifyNextRun(sat, 1, "07:00", false);
    expect(next.getDay()).toBe(0); // Sunday
    expect(next.getDate()).toBe(19);
  });
});
