import { describe, expect, it } from "vitest";
import type { AttentionConfig } from "@/lib/core/attention-engine";
import type { HomeworkRecord } from "@/lib/ipc";
import { addDays, buildRefreshDigest, type ChildHeroCounts, toLocalIso } from "@/lib/notify/digest";
import type { DigestFailure } from "@/lib/notify/types";
import type { ChildRecord, ClassDetails } from "@/lib/scraper/types";

const cfg: AttentionConfig = { forgivenessWeeks: 2, lowScoreThreshold: 3 };

function makeChild(id: number, displayName: string): ChildRecord {
  return {
    id,
    displayName,
    portalType: "teacherease",
    baseUrl: "https://school.example.com",
    username: `user${id}@example.com`,
    grade: null,
    school: null,
    homeworkUrl: null,
    createdAt: "2026-01-01 00:00:00",
  };
}

let nextHwId = 1;
function makeHw(
  childId: number,
  hwDate: string,
  subject: string,
  dueDate: string | null = null,
): HomeworkRecord {
  return {
    id: nextHwId++,
    childId,
    hwDate,
    subject,
    content: "x",
    dueDate,
    dueDateInferred: false,
    scrapedAt: "2026-04-19T00:00:00Z",
  };
}

const EMPTY_DETAILS: ClassDetails[] = [];
const FIXED_NOW = new Date("2026-04-19T12:00:00Z");

function emptyInputs() {
  return {
    perChildDetails: new Map<number, ClassDetails[]>(),
    perChildHomeworkForToday: new Map<number, HomeworkRecord[]>(),
    perChildHomeworkDueToday: new Map<number, HomeworkRecord[]>(),
    perChildHeroCounts: new Map<number, ChildHeroCounts>(),
  };
}

describe("buildRefreshDigest", () => {
  it("produces an all-zero digest for empty children", () => {
    const d = buildRefreshDigest({
      children: [],
      ...emptyInputs(),
      failures: [],
      cfg,
      now: FIXED_NOW,
    });
    expect(d.type).toBe("refreshDigest");
    expect(d.family).toEqual({
      childCount: 0,
      attentionCount: 0,
      meetingCount: 0,
      notAssessedCount: 0,
      homeworkForTodayCount: 0,
      homeworkDueTodayCount: 0,
    });
    expect(d.children).toEqual([]);
    expect(d.failures).toEqual([]);
  });

  it("populates both homework sections for a happy-path child", () => {
    const child = makeChild(1, "Alex");
    const hw1 = makeHw(1, "2026-04-19", "Math"); // hwDate=today, dueDate=null
    const hw2 = makeHw(1, "2026-04-19", "English", "2026-04-19"); // both match today
    const inputs = emptyInputs();
    inputs.perChildDetails.set(1, EMPTY_DETAILS);
    inputs.perChildHomeworkForToday.set(1, [hw1, hw2]);
    inputs.perChildHomeworkDueToday.set(1, [hw2]);
    inputs.perChildHeroCounts.set(1, { meetingCount: 4, notAssessedCount: 1 });

    const d = buildRefreshDigest({
      children: [child],
      ...inputs,
      failures: [],
      cfg,
      now: FIXED_NOW,
    });

    const c = d.children[0];
    expect(c).toBeDefined();
    if (!c) return;
    expect(c.homeworkForToday.map((h) => h.subject)).toEqual(["Math", "English"]);
    expect(c.homeworkDueToday.map((h) => h.subject)).toEqual(["English"]);
    // Per-section counts, no cross-section dedup (Q28 family hero is two lines).
    expect(d.family.homeworkForTodayCount).toBe(2);
    expect(d.family.homeworkDueTodayCount).toBe(1);
  });

  it("counts homework per section independently (no cross-section dedup)", () => {
    const child = makeChild(1, "Alex");
    const hwBoth = makeHw(1, "2026-04-19", "Science", "2026-04-19");
    const inputs = emptyInputs();
    inputs.perChildDetails.set(1, EMPTY_DETAILS);
    inputs.perChildHomeworkForToday.set(1, [hwBoth]);
    inputs.perChildHomeworkDueToday.set(1, [hwBoth]);
    inputs.perChildHeroCounts.set(1, { meetingCount: 0, notAssessedCount: 0 });

    const d = buildRefreshDigest({
      children: [child],
      ...inputs,
      failures: [],
      cfg,
      now: FIXED_NOW,
    });
    // Same row appears in both lists → contributes to both counts.
    expect(d.family.homeworkForTodayCount).toBe(1);
    expect(d.family.homeworkDueTodayCount).toBe(1);
  });

  it("always populates hero from DB data regardless of this cycle's failures (D-18)", () => {
    const a = makeChild(1, "Alex");
    const b = makeChild(2, "Sam");
    const failures: DigestFailure[] = [
      { childId: 1, childName: "Alex", source: "teacherease", error: "login failed" },
    ];
    const inputs = emptyInputs();
    inputs.perChildDetails.set(1, EMPTY_DETAILS);
    inputs.perChildDetails.set(2, EMPTY_DETAILS);
    inputs.perChildHomeworkForToday.set(1, [makeHw(1, "2026-04-19", "Science")]);
    inputs.perChildHomeworkDueToday.set(1, []);
    inputs.perChildHeroCounts.set(1, { meetingCount: 7, notAssessedCount: 0 });
    inputs.perChildHeroCounts.set(2, { meetingCount: 5, notAssessedCount: 0 });

    const d = buildRefreshDigest({
      children: [a, b],
      ...inputs,
      failures,
      cfg,
      now: FIXED_NOW,
    });

    const alex = d.children.find((c) => c.childName === "Alex");
    const sam = d.children.find((c) => c.childName === "Sam");
    // Both children have populated heroes — TE failure is not visible
    // in the rendered digest, matching the Today tab behavior.
    expect(alex?.hero.meetingCount).toBe(7);
    expect(sam?.hero.meetingCount).toBe(5);
    expect(alex?.homeworkForToday).toHaveLength(1);
    expect(d.family.childCount).toBe(2);
    expect(d.family.meetingCount).toBe(12);
    expect(d.family.homeworkForTodayCount).toBe(1);
  });

  it("keeps hero populated when only homework source failed", () => {
    const a = makeChild(1, "Alex");
    const failures: DigestFailure[] = [
      { childId: 1, childName: "Alex", source: "homework", error: "404" },
    ];
    const inputs = emptyInputs();
    inputs.perChildDetails.set(1, EMPTY_DETAILS);
    inputs.perChildHeroCounts.set(1, { meetingCount: 3, notAssessedCount: 0 });

    const d = buildRefreshDigest({
      children: [a],
      ...inputs,
      failures,
      cfg,
      now: FIXED_NOW,
    });

    expect(d.children[0]?.hero.meetingCount).toBe(3);
    expect(d.family.childCount).toBe(1);
    expect(d.failures).toHaveLength(1);
  });

  it("uses LOCAL today for the digest (not UTC)", () => {
    const lateEvening = new Date(2026, 3, 19, 23, 30, 0);
    expect(toLocalIso(lateEvening)).toBe("2026-04-19");
    expect(toLocalIso(addDays(lateEvening, 1))).toBe("2026-04-20");
  });

  it("collects multiple per-source failures per child", () => {
    const a = makeChild(1, "Alex");
    const failures: DigestFailure[] = [
      { childId: 1, childName: "Alex", source: "teacherease", error: "te down" },
      { childId: 1, childName: "Alex", source: "homework", error: "404" },
    ];
    const d = buildRefreshDigest({
      children: [a],
      ...emptyInputs(),
      failures,
      cfg,
      now: FIXED_NOW,
    });
    // `failures` is retained on the digest for logging but never null-outs the hero (D-18).
    expect(d.failures).toHaveLength(2);
    expect(d.children[0]?.hero.meetingCount).toBe(0);
  });

  it("child with no homework rows renders empty arrays in both sections", () => {
    const child = makeChild(1, "Alex");
    const inputs = emptyInputs();
    inputs.perChildDetails.set(1, EMPTY_DETAILS);
    inputs.perChildHeroCounts.set(1, { meetingCount: 0, notAssessedCount: 0 });

    const d = buildRefreshDigest({
      children: [child],
      ...inputs,
      failures: [],
      cfg,
      now: FIXED_NOW,
    });
    expect(d.children[0]?.homeworkForToday).toEqual([]);
    expect(d.children[0]?.homeworkDueToday).toEqual([]);
    expect(d.family.homeworkForTodayCount).toBe(0);
    expect(d.family.homeworkDueTodayCount).toBe(0);
  });
});
