import { describe, expect, it } from "vitest";
import { isWeekend, nextWeekday } from "@/lib/schedule/weekday";

describe("nextWeekday", () => {
  it("passes through a Monday", () => {
    const mon = new Date(2026, 3, 20, 10, 30); // April 20 2026 is Monday
    expect(nextWeekday(mon).getDate()).toBe(20);
  });

  it("passes through a Friday", () => {
    const fri = new Date(2026, 3, 17, 10, 30); // April 17 2026 is Friday
    expect(nextWeekday(fri).getDate()).toBe(17);
  });

  it("advances Saturday to Monday", () => {
    const sat = new Date(2026, 3, 18, 8, 0); // April 18 2026 is Saturday
    const out = nextWeekday(sat);
    expect(out.getDay()).toBe(1);
    expect(out.getDate()).toBe(20);
  });

  it("advances Sunday to Monday", () => {
    const sun = new Date(2026, 3, 19, 8, 0); // April 19 2026 is Sunday
    const out = nextWeekday(sun);
    expect(out.getDay()).toBe(1);
    expect(out.getDate()).toBe(20);
  });

  it("preserves time-of-day when advancing", () => {
    const sat = new Date(2026, 3, 18, 14, 30);
    const out = nextWeekday(sat);
    expect(out.getHours()).toBe(14);
    expect(out.getMinutes()).toBe(30);
  });
});

describe("isWeekend", () => {
  it("identifies Saturday + Sunday", () => {
    expect(isWeekend(new Date(2026, 3, 18))).toBe(true); // Sat
    expect(isWeekend(new Date(2026, 3, 19))).toBe(true); // Sun
  });

  it("rejects weekdays", () => {
    expect(isWeekend(new Date(2026, 3, 17))).toBe(false); // Fri
    expect(isWeekend(new Date(2026, 3, 20))).toBe(false); // Mon
  });
});
