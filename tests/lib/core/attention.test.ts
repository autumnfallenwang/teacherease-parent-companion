import { describe, expect, it } from "vitest";
import { getLowScoreAssignments } from "@/lib/core/attention";
import type { AssignmentRecord } from "@/lib/ipc";

function asn(name: string, scoreNumeric: number | null, isMissing = false): AssignmentRecord {
  return {
    id: 0,
    scrapeId: 0,
    classId: null,
    className: "Test Class",
    assignmentName: name,
    score: scoreNumeric ? `${scoreNumeric}=P` : null,
    scoreNumeric,
    scoreLetter: null,
    weight: null,
    isMissing,
    dueDate: null,
    feedback: null,
    teAssignmentId: null,
  };
}

describe("getLowScoreAssignments", () => {
  it("returns assignments below 3.0", () => {
    const assignments = [
      asn("Quiz 1", 3.0),
      asn("Quiz 2", 2.5),
      asn("Quiz 3", 1.0),
      asn("Quiz 4", 3.0),
    ];
    const result = getLowScoreAssignments(assignments);
    expect(result).toHaveLength(2);
    expect(result[0]?.assignmentName).toBe("Quiz 3"); // worst first
    expect(result[1]?.assignmentName).toBe("Quiz 2");
  });

  it("excludes missing assignments", () => {
    const assignments = [asn("Missing", 0, true), asn("Low", 2.0)];
    const result = getLowScoreAssignments(assignments);
    expect(result).toHaveLength(1);
    expect(result[0]?.assignmentName).toBe("Low");
  });

  it("excludes ungraded (scoreNumeric = 0 or null)", () => {
    const assignments = [asn("Ungraded", 0), asn("Null", null), asn("Low", 1.5)];
    const result = getLowScoreAssignments(assignments);
    expect(result).toHaveLength(1);
    expect(result[0]?.assignmentName).toBe("Low");
  });

  it("returns empty for all-meeting assignments", () => {
    const assignments = [asn("Good", 3.0), asn("Great", 3.0)];
    expect(getLowScoreAssignments(assignments)).toEqual([]);
  });

  it("handles empty array", () => {
    expect(getLowScoreAssignments([])).toEqual([]);
  });
});
