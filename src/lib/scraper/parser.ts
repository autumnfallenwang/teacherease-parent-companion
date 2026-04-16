// Pure HTML/JSON → data transformation for TeacherEase pages. No HTTP, no
// side effects, no platform imports. Separate from teacherease.ts (login) —
// same split as the Python ref (data_parser.py vs scraper.py).

import * as cheerio from "cheerio";
import type { Assignment, ClassDetails, ClassOverview, GradesOverview, Standard } from "./types";

type Doc = cheerio.CheerioAPI;
type El = ReturnType<Doc>;

const STATUS_NOT_ASSESSED = 0;
const STATUS_MEETING = 1;
const STATUS_NEEDS_ATTENTION = 2;

type StatusString = ClassOverview["status"];

function mapStatus(code: number): StatusString {
  if (code === STATUS_MEETING) return "meeting";
  if (code === STATUS_NEEDS_ATTENTION) return "needs_attention";
  return "not_assessed";
}

/**
 * Extract the classes JSON array from the kendoListView initialization
 * embedded in the grades overview page's JavaScript. The page has two JSON
 * blobs; the lazy regex captures the first one (classes). Returns [] on no
 * match or malformed JSON — never throws.
 */
export function extractClassesJson(html: string): unknown[] {
  // biome-ignore lint/security/noSecrets: regex pattern, not a secret
  const match = html.match(/"data":\{"Data":\[(.*?)\],"Total"/s);
  if (!match?.[1]) return [];

  try {
    const parsed: unknown = JSON.parse(`[${match[1]}]`);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Parse the grades overview page into a typed structure. Returns a
 * zero-count empty overview (not null/error) when no data is found.
 */
export function parseGradesOverview(html: string): GradesOverview {
  const raw = extractClassesJson(html);

  const classes: ClassOverview[] = [];
  let meetingExpectations = 0;
  let needsAttention = 0;
  let notAssessed = 0;
  let totalTargetsMeeting = 0;
  let totalTargetsNotMeeting = 0;

  for (const entry of raw) {
    const cls = entry as Record<string, unknown>;

    const gradeStatus = (cls.GradeStatus as Record<string, unknown>) ?? {};
    const statusCode =
      typeof gradeStatus.Status === "number" ? gradeStatus.Status : STATUS_NOT_ASSESSED;
    const status = mapStatus(statusCode);

    const progress = (cls.Progress as Record<string, unknown>) ?? {};
    const targetsMeeting =
      typeof progress.LearningTargetsMeeting === "number" ? progress.LearningTargetsMeeting : 0;
    const targetsNotMeeting =
      typeof progress.LearningTargetsNotMeeting === "number"
        ? progress.LearningTargetsNotMeeting
        : 0;
    const totalTargets =
      typeof progress.TotalLeafLearningTargets === "number" ? progress.TotalLeafLearningTargets : 0;

    const instrArr = cls.InstructorDescription;
    const instructor =
      Array.isArray(instrArr) && typeof instrArr[0] === "string" ? instrArr[0] : "Unknown";

    classes.push({
      name: typeof cls.ClassDescription === "string" ? cls.ClassDescription : "Unknown Class",
      instructor,
      status,
      statusCode,
      needsAttention: statusCode === STATUS_NEEDS_ATTENTION,
      targetsMeeting,
      targetsNotMeeting,
      totalTargets,
      classId: typeof cls.ClassID === "number" ? cls.ClassID : 0,
      cgpId: typeof cls.CurrentCGPID === "number" ? cls.CurrentCGPID : 0,
    });

    if (statusCode === STATUS_MEETING) meetingExpectations++;
    else if (statusCode === STATUS_NEEDS_ATTENTION) needsAttention++;
    else notAssessed++;

    totalTargetsMeeting += targetsMeeting;
    totalTargetsNotMeeting += targetsNotMeeting;
  }

  return {
    classes,
    summary: {
      totalClasses: classes.length,
      meetingExpectations,
      needsAttention,
      notAssessed,
      totalTargetsMeeting,
      totalTargetsNotMeeting,
    },
  };
}

// ---------------------------------------------------------------------------
// Class detail parser (T10)
// ---------------------------------------------------------------------------

const MEETING_GRADE_THRESHOLD = 3.0;

function parseScore(raw: string): {
  score: string;
  scoreNumeric: number;
  scoreLetter: string;
  isMeeting: boolean;
} {
  const cleaned = raw.split("\n")[0]?.trim() ?? "";
  if (!cleaned.includes("=")) {
    return { score: cleaned, scoreNumeric: 0, scoreLetter: "", isMeeting: false };
  }
  const [numStr, letter] = cleaned.split("=", 2) as [string, string];
  const scoreNumeric = Number.parseFloat(numStr) || 0;
  return { score: cleaned, scoreNumeric, scoreLetter: letter ?? "", isMeeting: letter === "M" };
}

function parseAssignmentRow(doc: Doc, row: El): Assignment | null {
  const cells = row.find("td");
  if (cells.length < 4) return null;

  const cell = (i: number) => doc(cells[i]).find("span.tablesaw-cell-content");

  const dueDate = cell(0).text().trim();
  const nameSpan = cell(1);
  const nameLink = nameSpan.find("a");
  const name = nameLink.text().trim() || nameSpan.text().trim();
  const weight = cell(2).text().trim();

  let grade = "";
  let gradeNumeric = 0;
  let gradeLetter = "";
  let isMissing = false;

  const gradeSpan = cell(3);
  const statusImg = gradeSpan.find("img[title]");
  if (statusImg.length > 0) {
    const title = statusImg.attr("title") ?? "";
    grade = title;
    if (title === "Missing") isMissing = true;
  } else {
    const gradeText = gradeSpan.text().trim();
    grade = gradeText;
    if (gradeText.includes("=")) {
      const [numStr, letter] = gradeText.split("=", 2) as [string, string];
      gradeNumeric = Number.parseFloat(numStr) || 0;
      gradeLetter = letter ?? "";
    }
  }

  if (nameLink.attr("style")?.includes("color:red")) isMissing = true;
  if (row.attr("data-bmissing") === "1") isMissing = true;

  const feedback =
    cells.length > 4 ? doc(cells[4]).find("span.tablesaw-cell-content").text().trim() : "";

  return { dueDate, name, weight, grade, gradeNumeric, gradeLetter, isMissing, feedback };
}

function parseStandardItem(doc: Doc, element: El): Standard | null {
  const stdData = element.children("div.standard-item-data").first();
  if (stdData.length === 0) return null;

  const name = stdData.find("span.standard-item-desc").first().text().trim();
  const scoreRaw = stdData.find("span.standard-item-score-inner").first().text().trim();
  const { score, scoreNumeric, scoreLetter, isMeeting } = parseScore(scoreRaw);

  const children: Standard[] = [];
  let missingCount = 0;
  let lowScoreCount = 0;

  element.children("ul.standard-item").each((_i, childUl) => {
    doc(childUl)
      .children("li")
      .each((_j, childLi) => {
        const child = parseStandardItem(doc, doc(childLi));
        if (child) {
          children.push(child);
          missingCount += child.missingCount;
          lowScoreCount += child.lowScoreCount;
        }
      });
  });

  const assignments: Assignment[] = [];
  const asnContainer = element.children("div.divAsnContainer").first();
  asnContainer.find("table.assignmentTable tbody tr").each((_i, tr) => {
    const assignment = parseAssignmentRow(doc, doc(tr));
    if (assignment) {
      assignments.push(assignment);
      if (assignment.isMissing) {
        missingCount++;
      } else if (assignment.gradeNumeric > 0 && assignment.gradeNumeric < MEETING_GRADE_THRESHOLD) {
        lowScoreCount++;
      }
    }
  });

  return {
    name,
    score,
    scoreNumeric,
    scoreLetter,
    isMeeting,
    children,
    assignments,
    missingCount,
    lowScoreCount,
  };
}

/**
 * Parse a class detail page into a typed structure with standards hierarchy
 * and assignments. Uses cheerio — this is real HTML parsing, unlike the
 * overview page which uses embedded JSON.
 */
export function parseClassDetails(html: string, className: string): ClassDetails {
  const doc = cheerio.load(html);

  const standards: Standard[] = [];
  let missingAssignments = 0;

  doc("ul.root-standard-item").each((_i, rootUl) => {
    doc(rootUl)
      .children("li")
      .each((_j, li) => {
        const standard = parseStandardItem(doc, doc(li));
        if (standard) {
          standards.push(standard);
          missingAssignments += standard.missingCount;
        }
      });
  });

  return { className, standards, summary: { missingAssignments } };
}
