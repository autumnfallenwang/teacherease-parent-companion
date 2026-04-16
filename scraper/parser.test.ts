import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractClassesJson, parseClassDetails, parseGradesOverview } from "./parser";

const FIXTURES_DIR = join(__dirname, "../tests/fixtures");
const FIXTURE = readFileSync(join(FIXTURES_DIR, "grades-page.html"), "utf8");

function readClassFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, "classes", name), "utf8");
}

// NOTE: full-data.json is from a DIFFERENT scrape session than the class
// detail fixtures (see tests/fixtures/README.md). We assert against values
// manually verified from the fixture HTML, NOT against full-data.json.

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

// ---------------------------------------------------------------------------
// parseClassDetails (T10) — tests against class detail fixtures validated
// against full-data.json's detailed_classes (same scrape session)
// ---------------------------------------------------------------------------

describe("parseClassDetails", () => {
  // Verified counts from manual fixture inspection (NOT from full-data.json,
  // which is from a different scrape — see tests/fixtures/README.md).

  describe("French 7", () => {
    const html = readClassFixture("french-7.html");
    const result = parseClassDetails(html, "French 7");

    it("extracts 6 root standards", () => {
      expect(result.standards).toHaveLength(6);
    });

    it("counts 2 missing assignments", () => {
      expect(result.summary.missingAssignments).toBe(2);
    });

    it("parses scores in N.NN=L format", () => {
      const first = result.standards[0];
      expect(first?.score).toMatch(/^\d+(\.\d+)?=[A-Z]$/);
      expect(first?.scoreNumeric).toBeGreaterThan(0);
      expect(first?.scoreLetter).toMatch(/^[A-Z]$/);
    });

    it("identifies meeting status from score letter M", () => {
      const meetingStd = result.standards.find((s) => s.scoreLetter === "M");
      expect(meetingStd?.isMeeting).toBe(true);
    });

    it("parses assignments with due date, name, grade", () => {
      const stdWithAssignments = result.standards.find((s) => s.assignments.length > 0);
      expect(stdWithAssignments).toBeDefined();
      const asn = stdWithAssignments?.assignments[0];
      expect(asn?.dueDate).toMatch(/\d+\/\d+/);
      expect(asn?.name.length).toBeGreaterThan(0);
    });
  });

  describe("Social Studies 7", () => {
    const html = readClassFixture("social-studies-7.html");
    const result = parseClassDetails(html, "Social Studies 7");

    it("extracts 4 root standards", () => {
      expect(result.standards).toHaveLength(4);
    });

    it("counts 3 missing assignments", () => {
      expect(result.summary.missingAssignments).toBe(3);
    });

    it("parses nested child standards", () => {
      const withChildren = result.standards.find((s) => s.children.length > 0);
      expect(withChildren).toBeDefined();
      expect(withChildren?.children[0]?.name.length).toBeGreaterThan(0);
    });

    it("identifies non-meeting scores (letter P)", () => {
      const notMeeting = result.standards.find((s) => s.scoreLetter === "P");
      expect(notMeeting).toBeDefined();
      expect(notMeeting?.isMeeting).toBe(false);
    });
  });

  describe("English 7", () => {
    const html = readClassFixture("english-7.html");
    const result = parseClassDetails(html, "English 7");

    it("extracts 5 root standards", () => {
      expect(result.standards).toHaveLength(5);
    });

    it("counts 0 missing assignments", () => {
      expect(result.summary.missingAssignments).toBe(0);
    });
  });

  describe("all 6 detail fixtures parse without error", () => {
    const fixtures = [
      "drama-7.html",
      "english-7.html",
      "french-7.html",
      "health-education-7.html",
      "science-7.html",
      "social-studies-7.html",
    ];

    for (const file of fixtures) {
      it(`parses ${file} and returns at least one standard`, () => {
        const html = readClassFixture(file);
        const result = parseClassDetails(html, file.replace(".html", ""));
        expect(result.standards.length).toBeGreaterThan(0);
      });
    }
  });

  it("returns empty ClassDetails on HTML with no standards", () => {
    const result = parseClassDetails("<html></html>", "Empty");
    expect(result.standards).toEqual([]);
    expect(result.summary.missingAssignments).toBe(0);
  });
});
