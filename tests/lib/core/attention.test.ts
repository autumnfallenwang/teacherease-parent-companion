import { describe, expect, it } from "vitest";
import { getLowScoreAssignments, groupAttentionByRecency } from "@/lib/core/attention";
import type { AssignmentRecord } from "@/lib/ipc";

function asn(
  name: string,
  opts: { scoreNumeric?: number | null; isMissing?: boolean; dueDate?: string | null } = {},
): AssignmentRecord {
  return {
    id: Math.random() * 10000,
    scrapeId: 0,
    classId: null,
    className: "Test Class",
    assignmentName: name,
    score: opts.scoreNumeric ? `${opts.scoreNumeric}=P` : null,
    scoreNumeric: opts.scoreNumeric ?? null,
    scoreLetter: null,
    weight: null,
    isMissing: opts.isMissing ?? false,
    dueDate: opts.dueDate ?? null,
    feedback: null,
    teAssignmentId: null,
  };
}

describe("getLowScoreAssignments", () => {
  it("returns assignments below 3.0", () => {
    const assignments = [
      asn("Good", { scoreNumeric: 3.0 }),
      asn("Low", { scoreNumeric: 2.5 }),
      asn("Bad", { scoreNumeric: 1.0 }),
    ];
    const result = getLowScoreAssignments(assignments);
    expect(result).toHaveLength(2);
    expect(result[0]?.assignmentName).toBe("Bad");
    expect(result[1]?.assignmentName).toBe("Low");
  });

  it("excludes missing assignments", () => {
    const assignments = [
      asn("Missing", { scoreNumeric: 0, isMissing: true }),
      asn("Low", { scoreNumeric: 2.0 }),
    ];
    expect(getLowScoreAssignments(assignments)).toHaveLength(1);
  });

  it("excludes ungraded", () => {
    const assignments = [asn("Zero", { scoreNumeric: 0 }), asn("Null", { scoreNumeric: null })];
    expect(getLowScoreAssignments(assignments)).toHaveLength(0);
  });

  it("returns empty for all-meeting", () => {
    expect(getLowScoreAssignments([asn("Good", { scoreNumeric: 3.0 })])).toEqual([]);
  });

  it("handles empty array", () => {
    expect(getLowScoreAssignments([])).toEqual([]);
  });
});

describe("groupAttentionByRecency", () => {
  const now = new Date(2026, 3, 16); // April 16, 2026

  it("separates this week from older", () => {
    const missing = [
      asn("Recent missing", { isMissing: true, dueDate: "4/14" }), // 2 days ago
      asn("Old missing", { isMissing: true, dueDate: "3/25" }), // 22 days ago
    ];
    const all = [
      asn("Recent low", { scoreNumeric: 2.0, dueDate: "4/13" }), // 3 days ago
      asn("Old low", { scoreNumeric: 1.0, dueDate: "3/20" }), // 27 days ago
      asn("Good", { scoreNumeric: 3.0, dueDate: "4/10" }), // not flagged
    ];

    const result = groupAttentionByRecency(missing, all, now);
    expect(result.thisWeek).toHaveLength(2);
    expect(result.older).toHaveLength(2);
  });

  it("puts missing before low scores within each group", () => {
    const missing = [asn("Missing", { isMissing: true, dueDate: "4/14" })];
    const all = [asn("Low", { scoreNumeric: 2.0, dueDate: "4/13" })];

    const result = groupAttentionByRecency(missing, all, now);
    expect(result.thisWeek[0]?.type).toBe("missing");
    expect(result.thisWeek[1]?.type).toBe("lowScore");
  });

  it("returns empty groups when no attention items", () => {
    const result = groupAttentionByRecency([], [asn("Good", { scoreNumeric: 3.0 })], now);
    expect(result.thisWeek).toHaveLength(0);
    expect(result.older).toHaveLength(0);
  });

  it("puts items with no due date in this week", () => {
    const missing = [asn("No date", { isMissing: true, dueDate: null })];
    const result = groupAttentionByRecency(missing, [], now);
    expect(result.thisWeek).toHaveLength(1);
    expect(result.older).toHaveLength(0);
  });
});
