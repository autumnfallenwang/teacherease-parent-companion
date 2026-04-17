import { describe, expect, it } from "vitest";
import { computeRecentActivity } from "@/lib/core/activity";
import type { AssignmentRecord, GradeRecord } from "@/lib/ipc";

function grade(
  className: string,
  opts: { currentGrade?: string | null; needsAttention?: boolean; status?: string } = {},
): GradeRecord {
  return {
    id: Math.floor(Math.random() * 100000),
    fetchRunId: 0,
    classId: null,
    className,
    currentGrade: opts.currentGrade ?? null,
    status: opts.status ?? "meeting",
    needsAttention: opts.needsAttention ?? false,
    targetsMeeting: null,
    targetsNotMeeting: null,
    targetsNotAssessed: null,
  };
}

function asn(
  name: string,
  className: string,
  opts: {
    teAssignmentId?: number | null;
    scoreNumeric?: number | null;
    isMissing?: boolean;
    dueDate?: string | null;
  } = {},
): AssignmentRecord {
  return {
    id: Math.floor(Math.random() * 100000),
    fetchRunId: 0,
    classId: null,
    className,
    assignmentName: name,
    score: opts.scoreNumeric ? `${opts.scoreNumeric}=P` : null,
    scoreNumeric: opts.scoreNumeric ?? null,
    scoreLetter: null,
    weight: null,
    isMissing: opts.isMissing ?? false,
    dueDate: opts.dueDate ?? null,
    feedback: null,
    teAssignmentId: opts.teAssignmentId ?? null,
  };
}

const NOW = new Date(2026, 3, 16); // April 16, 2026

describe("computeRecentActivity", () => {
  it("returns empty when no previous scrape", () => {
    const result = computeRecentActivity([grade("Math", { currentGrade: "3.0" })], [], null, null);
    expect(result).toEqual([]);
  });

  it("returns empty when nothing changed", () => {
    const curr = [grade("Math", { currentGrade: "3.0" })];
    const prev = [grade("Math", { currentGrade: "3.0" })];
    expect(computeRecentActivity(curr, [], prev, [])).toEqual([]);
  });

  it("emits 'improved' when class grade went up", () => {
    const curr = [grade("Geography", { currentGrade: "2.84" })];
    const prev = [grade("Geography", { currentGrade: "2.50" })];
    const result = computeRecentActivity(curr, [], prev, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "improved",
      className: "Geography",
      scoreFrom: 2.5,
      scoreTo: 2.84,
    });
  });

  it("emits 'declined' when class grade went down", () => {
    const curr = [grade("Algebra", { currentGrade: "2.5" })];
    const prev = [grade("Algebra", { currentGrade: "3.0" })];
    const result = computeRecentActivity(curr, [], prev, []);
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("declined");
  });

  it("ignores grade moves below 0.1 threshold", () => {
    const curr = [grade("Math", { currentGrade: "3.05" })];
    const prev = [grade("Math", { currentGrade: "3.00" })];
    expect(computeRecentActivity(curr, [], prev, [])).toHaveLength(0);
  });

  it("counts only assignments missing from prev with scores", () => {
    const curr = [
      asn("Quiz", "Math", { teAssignmentId: 1, scoreNumeric: 3.0 }),
      asn("Test", "Math", { teAssignmentId: 2, scoreNumeric: 3.0 }),
      asn("Old", "Math", { teAssignmentId: 3, scoreNumeric: 3.0 }),
    ];
    const prev = [asn("Old", "Math", { teAssignmentId: 3, scoreNumeric: 3.0 })];
    const result = computeRecentActivity([], curr, [], prev);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: "newScores", className: "Math", count: 2 });
  });

  it("does not emit newScores for ungraded or missing new assignments", () => {
    const curr = [
      asn("Ungraded", "Math", { teAssignmentId: 1, scoreNumeric: null }),
      asn("MissingNew", "Math", { teAssignmentId: 2, isMissing: true }),
    ];
    const result = computeRecentActivity([], curr, [], []);
    expect(result).toHaveLength(0);
  });

  it("emits agingMissing when persistently missing and overdue >= 14 days", () => {
    const curr = [
      asn("Mount Everest", "Social Studies", {
        teAssignmentId: 10,
        isMissing: true,
        dueDate: "3/25", // ~22 days before NOW (4/16)
      }),
    ];
    const prev = [
      asn("Mount Everest", "Social Studies", {
        teAssignmentId: 10,
        isMissing: true,
        dueDate: "3/25",
      }),
    ];
    const result = computeRecentActivity([], curr, [], prev, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "agingMissing",
      className: "Social Studies",
      assignmentName: "Mount Everest",
    });
    expect(result[0]?.weeksOverdue).toBeGreaterThanOrEqual(3);
  });

  it("does not emit agingMissing for newly missing assignments", () => {
    const curr = [
      asn("Fresh Miss", "Math", {
        teAssignmentId: 5,
        isMissing: true,
        dueDate: "3/25",
      }),
    ];
    const prev: AssignmentRecord[] = [];
    const result = computeRecentActivity([], curr, [], prev, NOW);
    expect(result).toHaveLength(0);
  });

  it("does not emit agingMissing under the 14-day threshold", () => {
    const curr = [
      asn("Recent Miss", "Math", {
        teAssignmentId: 6,
        isMissing: true,
        dueDate: "4/10", // 6 days before NOW
      }),
    ];
    const prev = [
      asn("Recent Miss", "Math", {
        teAssignmentId: 6,
        isMissing: true,
        dueDate: "4/10",
      }),
    ];
    const result = computeRecentActivity([], curr, [], prev, NOW);
    expect(result).toHaveLength(0);
  });

  it("skips classes missing from prev without crashing", () => {
    const curr = [grade("New Class", { currentGrade: "3.0" })];
    const result = computeRecentActivity(curr, [], [], []);
    expect(result).toEqual([]);
  });

  it("orders items: improved → newScores → declined → agingMissing", () => {
    const curr = [grade("A Up", { currentGrade: "3.0" }), grade("B Down", { currentGrade: "2.0" })];
    const prev = [grade("A Up", { currentGrade: "2.5" }), grade("B Down", { currentGrade: "3.0" })];
    const currAsns = [
      asn("NewOne", "C New", { teAssignmentId: 99, scoreNumeric: 3.0 }),
      asn("Old", "D Old", {
        teAssignmentId: 100,
        isMissing: true,
        dueDate: "3/25",
      }),
    ];
    const prevAsns = [
      asn("Old", "D Old", {
        teAssignmentId: 100,
        isMissing: true,
        dueDate: "3/25",
      }),
    ];
    const result = computeRecentActivity(curr, currAsns, prev, prevAsns, NOW);
    expect(result.map((i) => i.type)).toEqual([
      "improved",
      "newScores",
      "declined",
      "agingMissing",
    ]);
  });
});
