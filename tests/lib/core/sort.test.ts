import { describe, expect, it } from "vitest";
import { sortClassesByUrgency } from "@/lib/core/sort";
import type { GradeRecord } from "@/lib/ipc";

function grade(status: string, className: string): GradeRecord {
  return {
    id: 0,
    fetchRunId: 0,
    classId: null,
    className,
    currentGrade: null,
    status,
    needsAttention: status === "needs_attention",
    targetsMeeting: null,
    targetsNotMeeting: null,
    targetsNotAssessed: null,
  };
}

describe("sortClassesByUrgency", () => {
  it("sorts needs_attention first, then meeting, then not_assessed", () => {
    const grades = [
      grade("meeting", "Math"),
      grade("not_assessed", "Art"),
      grade("needs_attention", "Social Studies"),
      grade("meeting", "English"),
    ];

    const sorted = sortClassesByUrgency(grades);
    expect(sorted.map((g) => g.className)).toEqual(["Social Studies", "Math", "English", "Art"]);
  });

  it("preserves order within same status group", () => {
    const grades = [grade("meeting", "B"), grade("meeting", "A"), grade("meeting", "C")];

    const sorted = sortClassesByUrgency(grades);
    expect(sorted.map((g) => g.className)).toEqual(["B", "A", "C"]);
  });

  it("handles empty array", () => {
    expect(sortClassesByUrgency([])).toEqual([]);
  });

  it("handles null status as not_assessed", () => {
    const grades = [grade("meeting", "Math"), { ...grade("meeting", "X"), status: null }];
    const sorted = sortClassesByUrgency(grades);
    expect(sorted[0]?.className).toBe("Math");
    expect(sorted[1]?.className).toBe("X");
  });

  it("puts engine-attention classes before TeacherEase needs_attention", () => {
    const grades = [grade("needs_attention", "TE-attention"), grade("meeting", "Engine-attention")];
    const sorted = sortClassesByUrgency(grades, new Set(["Engine-attention"]));
    expect(sorted.map((g) => g.className)).toEqual(["Engine-attention", "TE-attention"]);
  });

  it("engine-attention is primary over meeting / not_assessed / needs_attention", () => {
    const grades = [
      grade("meeting", "Math"),
      grade("not_assessed", "Art"),
      grade("needs_attention", "TE-SS"),
      grade("meeting", "English"), // engine-attention target
    ];
    const sorted = sortClassesByUrgency(grades, new Set(["English"]));
    expect(sorted.map((g) => g.className)).toEqual(["English", "TE-SS", "Math", "Art"]);
  });

  it("no engine set == pre-AT4 behavior (sort by TeacherEase status only)", () => {
    const grades = [
      grade("meeting", "Math"),
      grade("needs_attention", "Social Studies"),
      grade("not_assessed", "Art"),
    ];
    const sorted = sortClassesByUrgency(grades);
    expect(sorted.map((g) => g.className)).toEqual(["Social Studies", "Math", "Art"]);
  });
});
