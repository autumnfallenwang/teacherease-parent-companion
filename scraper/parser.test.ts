import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractClassesJson, parseGradesOverview } from "./parser";

const FIXTURE = readFileSync(join(__dirname, "../tests/fixtures/grades-page.html"), "utf8");

describe("extractClassesJson", () => {
  it("returns 8 raw class objects from the fixture", () => {
    const classes = extractClassesJson(FIXTURE);
    expect(classes).toHaveLength(8);
  });

  it("returns [] when HTML has no kendoListView data", () => {
    expect(extractClassesJson("<html><body>nothing</body></html>")).toEqual([]);
  });

  it("returns [] on malformed JSON inside the blob", () => {
    const broken = '"data":{"Data":[{broken json}],"Total"';
    expect(extractClassesJson(broken)).toEqual([]);
  });
});

describe("parseGradesOverview", () => {
  const overview = parseGradesOverview(FIXTURE);

  it("extracts all 8 class names", () => {
    const names = overview.classes.map((c) => c.name);
    expect(names).toEqual([
      "Mathematics 7",
      "Computer Science 7",
      "Music 7",
      "French 7",
      "Science 7",
      "Social Studies 7",
      "English 7",
      "Physical Education 7",
    ]);
  });

  it("maps instructor from InstructorDescription[0]", () => {
    const mathClass = overview.classes.find((c) => c.name === "Mathematics 7");
    expect(mathClass?.instructor).toBe("Instructor Two");
  });

  it("returns 'Unknown' for missing InstructorDescription", () => {
    const html = '"data":{"Data":[{"ClassDescription":"Test","GradeStatus":{"Status":0}}],"Total"';
    const result = parseGradesOverview(html);
    expect(result.classes[0]?.instructor).toBe("Unknown");
  });

  it("maps status code 1→meeting, 2→needs_attention, 0→not_assessed", () => {
    const byName = (name: string) => overview.classes.find((c) => c.name === name);
    expect(byName("Mathematics 7")?.status).toBe("meeting");
    expect(byName("Social Studies 7")?.status).toBe("needs_attention");
    expect(byName("Science 7")?.status).toBe("not_assessed");
  });

  it("sets needsAttention=true only for status code 2", () => {
    const attentionClasses = overview.classes.filter((c) => c.needsAttention);
    expect(attentionClasses).toHaveLength(1);
    expect(attentionClasses[0]?.name).toBe("Social Studies 7");
  });

  it("counts summary correctly: 6 meeting, 1 needs_attention, 1 not_assessed", () => {
    expect(overview.summary).toEqual({
      totalClasses: 8,
      meetingExpectations: 6,
      needsAttention: 1,
      notAssessed: 1,
      totalTargetsMeeting: expect.any(Number),
      totalTargetsNotMeeting: expect.any(Number),
    });
  });

  it("extracts classId and cgpId from each class", () => {
    for (const cls of overview.classes) {
      expect(cls.classId).toBeGreaterThan(0);
      expect(cls.cgpId).toBeGreaterThan(0);
    }
  });

  it("sums learning targets across all classes", () => {
    expect(overview.summary.totalTargetsMeeting).toBeGreaterThan(0);
    expect(overview.summary.totalTargetsNotMeeting).toBeGreaterThanOrEqual(0);
  });

  it("returns empty GradesOverview with zero summary on empty HTML", () => {
    const empty = parseGradesOverview("<html></html>");
    expect(empty.classes).toEqual([]);
    expect(empty.summary).toEqual({
      totalClasses: 0,
      meetingExpectations: 0,
      needsAttention: 0,
      notAssessed: 0,
      totalTargetsMeeting: 0,
      totalTargetsNotMeeting: 0,
    });
  });
});
