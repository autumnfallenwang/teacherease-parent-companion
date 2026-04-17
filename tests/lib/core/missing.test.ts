import { describe, expect, it } from "vitest";
import { groupMissingByUrgency } from "@/lib/core/missing";
import type { AssignmentRecord } from "@/lib/ipc";

function missing(name: string, dueDate: string | null): AssignmentRecord {
  return {
    id: 0,
    fetchRunId: 0,
    classId: null,
    className: "Test Class",
    assignmentName: name,
    score: null,
    scoreNumeric: null,
    scoreLetter: null,
    weight: null,
    isMissing: true,
    dueDate,
    feedback: null,
    teAssignmentId: null,
  };
}

describe("groupMissingByUrgency", () => {
  // Fix "now" to 2026-04-16 for deterministic tests
  const now = new Date(2026, 3, 16); // April 16, 2026

  it("groups by overdue duration", () => {
    const assignments = [
      missing("3 weeks ago", "3/20"), // 27 days ago → overdue3w
      missing("2 weeks ago", "4/2"), // 14 days ago → overdue1w
      missing("3 days ago", "4/13"), // 3 days ago → recent
      missing("no date", null), // no due date
    ];

    const groups = groupMissingByUrgency(assignments, now);
    expect(groups).toHaveLength(4);
    expect(groups[0]?.group).toBe("overdue3w");
    expect(groups[0]?.items).toHaveLength(1);
    expect(groups[0]?.items[0]?.assignmentName).toBe("3 weeks ago");

    expect(groups[1]?.group).toBe("overdue1w");
    expect(groups[1]?.items[0]?.assignmentName).toBe("2 weeks ago");

    expect(groups[2]?.group).toBe("recent");
    expect(groups[2]?.items[0]?.assignmentName).toBe("3 days ago");

    expect(groups[3]?.group).toBe("noDueDate");
    expect(groups[3]?.items[0]?.assignmentName).toBe("no date");
  });

  it("returns empty array for no assignments", () => {
    expect(groupMissingByUrgency([], now)).toEqual([]);
  });

  it("omits empty groups", () => {
    const assignments = [missing("recent", "4/14")];
    const groups = groupMissingByUrgency(assignments, now);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.group).toBe("recent");
  });

  it("handles full datetime due dates", () => {
    const assignments = [missing("old", "9/4/2025 9:22 AM")];
    const groups = groupMissingByUrgency(assignments, now);
    expect(groups[0]?.group).toBe("overdue3w");
  });
});
