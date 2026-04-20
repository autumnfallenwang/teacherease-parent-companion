import { describe, expect, it } from "vitest";
import {
  computeFetchNextRun,
  computeFetchSlots,
  FETCH_RUNS_PER_DAY_DEFAULT,
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

describe("computeFetchSlots", () => {
  it("evenly spaces N slots starting at 0", () => {
    expect(computeFetchSlots(1)).toEqual([0]);
    expect(computeFetchSlots(2)).toEqual([0, 12]);
    expect(computeFetchSlots(3)).toEqual([0, 8, 16]);
    expect(computeFetchSlots(4)).toEqual([0, 6, 12, 18]);
    expect(computeFetchSlots(6)).toEqual([0, 4, 8, 12, 16, 20]);
  });

  it("clamps out-of-range inputs", () => {
    expect(computeFetchSlots(0)).toEqual([0]);
    expect(computeFetchSlots(20)).toHaveLength(8);
  });
});

describe("computeFetchNextRun", () => {
  it("returns next slot same-day when one is ahead", () => {
    const now = new Date(2026, 3, 19, 5, 30); // April 19 05:30 local
    const next = computeFetchNextRun(now, 4);
    expect(next.getHours()).toBe(6);
    expect(next.getMinutes()).toBe(0);
    expect(next.getDate()).toBe(19);
  });

  it("rolls to first slot tomorrow when past last slot today", () => {
    const now = new Date(2026, 3, 19, 19, 0); // April 19 19:00 local (past 18:00 slot)
    const next = computeFetchNextRun(now, 4);
    expect(next.getHours()).toBe(0);
    expect(next.getDate()).toBe(20);
  });

  it("skips the exact-match slot (strict >) so it doesn't immediately re-fire", () => {
    const now = new Date(2026, 3, 19, 6, 0, 0); // exactly on 06:00 slot
    const next = computeFetchNextRun(now, 4);
    expect(next.getHours()).toBe(12);
    expect(next.getDate()).toBe(19);
  });

  it("handles 1 run/day by always targeting 00:00 tomorrow when past midnight", () => {
    const now = new Date(2026, 3, 19, 5, 0);
    const next = computeFetchNextRun(now, 1);
    expect(next.getHours()).toBe(0);
    expect(next.getDate()).toBe(20);
  });

  it("handles a 3-run split (00:00 / 08:00 / 16:00)", () => {
    const now = new Date(2026, 3, 19, 9, 0); // 09:00 → next is 16:00 today
    const next = computeFetchNextRun(now, 3);
    expect(next.getHours()).toBe(16);
    expect(next.getDate()).toBe(19);
  });
});
