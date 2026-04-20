import { describe, expect, it } from "vitest";
import {
  computeFetchNextRun,
  computeFetchSlots,
  FETCH_FIRST_SLOT_DEFAULT,
  FETCH_RUNS_PER_DAY_DEFAULT,
  formatSlotMinutes,
  parseFetchFirstSlot,
  parseFetchRunsPerDay,
} from "@/lib/schedule/fetch-schedule";

describe("parseFetchRunsPerDay", () => {
  it("defaults when input is garbage", () => {
    expect(parseFetchRunsPerDay("")).toBe(FETCH_RUNS_PER_DAY_DEFAULT);
    expect(parseFetchRunsPerDay(undefined)).toBe(FETCH_RUNS_PER_DAY_DEFAULT);
    expect(parseFetchRunsPerDay("abc")).toBe(FETCH_RUNS_PER_DAY_DEFAULT);
  });

  it("clamps to [1, 8]", () => {
    expect(parseFetchRunsPerDay("0")).toBe(1);
    expect(parseFetchRunsPerDay("-3")).toBe(1);
    expect(parseFetchRunsPerDay("9")).toBe(8);
    expect(parseFetchRunsPerDay("100")).toBe(8);
  });

  it("passes through valid values", () => {
    expect(parseFetchRunsPerDay("1")).toBe(1);
    expect(parseFetchRunsPerDay("4")).toBe(4);
    expect(parseFetchRunsPerDay("8")).toBe(8);
  });
});

describe("parseFetchFirstSlot", () => {
  it("passes through valid HH:MM", () => {
    expect(parseFetchFirstSlot("00:00")).toBe("00:00");
    expect(parseFetchFirstSlot("06:00")).toBe("06:00");
    expect(parseFetchFirstSlot("23:59")).toBe("23:59");
  });

  it("zero-pads single-digit hour", () => {
    expect(parseFetchFirstSlot("7:30")).toBe("07:30");
    expect(parseFetchFirstSlot("9:05")).toBe("09:05");
  });

  it("defaults on garbage", () => {
    expect(parseFetchFirstSlot("")).toBe(FETCH_FIRST_SLOT_DEFAULT);
    expect(parseFetchFirstSlot(undefined)).toBe(FETCH_FIRST_SLOT_DEFAULT);
    expect(parseFetchFirstSlot("abc")).toBe(FETCH_FIRST_SLOT_DEFAULT);
    expect(parseFetchFirstSlot("25:00")).toBe(FETCH_FIRST_SLOT_DEFAULT);
    expect(parseFetchFirstSlot("12:60")).toBe(FETCH_FIRST_SLOT_DEFAULT);
    expect(parseFetchFirstSlot("-1:00")).toBe(FETCH_FIRST_SLOT_DEFAULT);
  });
});

describe("computeFetchSlots", () => {
  it("evenly spaces N slots as minutes-of-day anchored at 00:00", () => {
    expect(computeFetchSlots(1)).toEqual([0]);
    expect(computeFetchSlots(2)).toEqual([0, 720]);
    expect(computeFetchSlots(3)).toEqual([0, 480, 960]);
    expect(computeFetchSlots(4)).toEqual([0, 360, 720, 1080]);
    expect(computeFetchSlots(6)).toEqual([0, 240, 480, 720, 960, 1200]);
  });

  it("wraps past midnight when anchored late (06:00 + 4/day)", () => {
    // anchor=360, step=360 → [360, 720, 1080, 1440%1440=0]
    expect(computeFetchSlots(4, "06:00")).toEqual([360, 720, 1080, 0]);
  });

  it("supports non-round anchors (07:30 + 3/day)", () => {
    // anchor=450, step=480 → [450, 930, 1410]
    expect(computeFetchSlots(3, "07:30")).toEqual([450, 930, 1410]);
  });

  it("clamps out-of-range inputs", () => {
    expect(computeFetchSlots(0)).toEqual([0]);
    expect(computeFetchSlots(20)).toHaveLength(8);
  });
});

describe("computeFetchNextRun", () => {
  it("returns next slot same-day when one is ahead (anchor=00:00)", () => {
    const now = new Date(2026, 3, 19, 5, 30);
    const next = computeFetchNextRun(now, 4);
    expect(next.getHours()).toBe(6);
    expect(next.getMinutes()).toBe(0);
    expect(next.getDate()).toBe(19);
  });

  it("rolls to first slot tomorrow when past last slot today (anchor=00:00)", () => {
    const now = new Date(2026, 3, 19, 19, 0);
    const next = computeFetchNextRun(now, 4);
    expect(next.getHours()).toBe(0);
    expect(next.getDate()).toBe(20);
  });

  it("skips the exact-match slot (strict >) so it doesn't immediately re-fire", () => {
    const now = new Date(2026, 3, 19, 6, 0, 0);
    const next = computeFetchNextRun(now, 4);
    expect(next.getHours()).toBe(12);
    expect(next.getDate()).toBe(19);
  });

  it("handles 1 run/day anchored at 06:00", () => {
    const now = new Date(2026, 3, 19, 5, 0);
    const next = computeFetchNextRun(now, 1, "06:00");
    expect(next.getHours()).toBe(6);
    expect(next.getMinutes()).toBe(0);
    expect(next.getDate()).toBe(19);
  });

  it("anchor=06:00, n=4 at 07:00 → next is 12:00 today", () => {
    const now = new Date(2026, 3, 19, 7, 0);
    const next = computeFetchNextRun(now, 4, "06:00");
    expect(next.getHours()).toBe(12);
    expect(next.getMinutes()).toBe(0);
    expect(next.getDate()).toBe(19);
  });

  it("anchor=06:00, n=4 at 23:30 → next is 00:00 tomorrow (wrapped slot)", () => {
    const now = new Date(2026, 3, 19, 23, 30);
    const next = computeFetchNextRun(now, 4, "06:00");
    expect(next.getHours()).toBe(0);
    expect(next.getMinutes()).toBe(0);
    expect(next.getDate()).toBe(20);
  });

  it("anchor=07:30, n=3 at 10:00 → next is 15:30 today", () => {
    const now = new Date(2026, 3, 19, 10, 0);
    const next = computeFetchNextRun(now, 3, "07:30");
    expect(next.getHours()).toBe(15);
    expect(next.getMinutes()).toBe(30);
  });
});

describe("computeFetchNextRun (weekdaysOnly)", () => {
  it("Saturday 08:00 + n=4 anchor=00:00 + weekdaysOnly=true → Monday 00:00", () => {
    const sat = new Date(2026, 3, 18, 8, 0); // Sat April 18
    const next = computeFetchNextRun(sat, 4, "00:00", true);
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(20);
    expect(next.getHours()).toBe(0);
  });

  it("Saturday 08:00 + weekdaysOnly=false → next slot Sat 12:00 (preserves back-compat)", () => {
    const sat = new Date(2026, 3, 18, 8, 0);
    const next = computeFetchNextRun(sat, 4, "00:00", false);
    expect(next.getDate()).toBe(18);
    expect(next.getHours()).toBe(12);
  });

  it("Friday 20:00 + n=4 anchor=00:00 + weekdaysOnly=true → Monday 00:00 (next slot rolls to Sat, skipped)", () => {
    const fri = new Date(2026, 3, 17, 20, 0);
    const next = computeFetchNextRun(fri, 4, "00:00", true);
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(20);
    expect(next.getHours()).toBe(0);
  });
});

describe("formatSlotMinutes", () => {
  it("formats round hours", () => {
    expect(formatSlotMinutes(0)).toBe("00:00");
    expect(formatSlotMinutes(360)).toBe("06:00");
    expect(formatSlotMinutes(1080)).toBe("18:00");
  });

  it("formats half-hour anchors", () => {
    expect(formatSlotMinutes(450)).toBe("07:30");
    expect(formatSlotMinutes(1410)).toBe("23:30");
  });

  it("normalizes out-of-range minute values", () => {
    expect(formatSlotMinutes(1440)).toBe("00:00");
    expect(formatSlotMinutes(-30)).toBe("23:30");
  });
});
