// Pure HTML/JSON → data transformation for TeacherEase pages. No HTTP, no
// side effects, no platform imports. Separate from teacherease.ts (login) —
// same split as the Python ref (data_parser.py vs scraper.py).
//
// T9: parseGradesOverview (this file)
// T10: parseClassDetails (will be added here)

import type { ClassOverview, GradesOverview } from "./types";

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
