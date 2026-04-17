// Pure recent-activity diff — no platform imports.

import type { AssignmentRecord, GradeRecord } from "@/lib/ipc";

export type ActivityType = "improved" | "declined" | "newScores" | "agingMissing";

export interface ActivityItem {
  type: ActivityType;
  className: string;
  scoreFrom?: number;
  scoreTo?: number;
  count?: number;
  assignmentName?: string;
  weeksOverdue?: number;
}

const MS_PER_DAY = 86_400_000;
const SCORE_CHANGE_THRESHOLD = 0.1;
const AGING_MISSING_DAYS = 14;

function parseDueDate(dueDate: string): Date | null {
  const match = dueDate.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (match) {
    const month = Number.parseInt(match[1] ?? "0", 10) - 1;
    const day = Number.parseInt(match[2] ?? "0", 10);
    const d = new Date();
    d.setMonth(month, day);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(dueDate);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseGrade(grade: string | null): number | null {
  if (!grade) return null;
  const n = Number.parseFloat(grade);
  return Number.isNaN(n) ? null : n;
}

function assignmentKey(asn: AssignmentRecord): string {
  return asn.teAssignmentId != null && asn.teAssignmentId > 0
    ? `id:${asn.teAssignmentId}`
    : `name:${asn.className}::${asn.assignmentName}`;
}

function typeRank(t: ActivityType): number {
  switch (t) {
    case "improved":
      return 0;
    case "newScores":
      return 1;
    case "declined":
      return 2;
    case "agingMissing":
      return 3;
  }
}

/**
 * Diff the current scrape against a previous one and derive a list of
 * noteworthy changes for the "Recent Activity" dashboard section.
 *
 * Returns an empty array when there is no previous scrape (first run) or
 * when nothing changed beyond thresholds.
 */
export function computeRecentActivity(
  currGrades: GradeRecord[],
  currAssignments: AssignmentRecord[],
  prevGrades: GradeRecord[] | null,
  prevAssignments: AssignmentRecord[] | null,
  now: Date = new Date(),
): ActivityItem[] {
  if (!prevGrades || !prevAssignments) return [];

  const items: ActivityItem[] = [];

  // 1. Grade moves (improved / declined)
  const prevGradeByName = new Map<string, GradeRecord>();
  for (const g of prevGrades) prevGradeByName.set(g.className, g);

  for (const curr of currGrades) {
    const prev = prevGradeByName.get(curr.className);
    if (!prev) continue;
    const currNum = parseGrade(curr.currentGrade);
    const prevNum = parseGrade(prev.currentGrade);
    if (currNum == null || prevNum == null) continue;
    const diff = currNum - prevNum;
    if (Math.abs(diff) < SCORE_CHANGE_THRESHOLD) continue;
    items.push({
      type: diff > 0 ? "improved" : "declined",
      className: curr.className,
      scoreFrom: prevNum,
      scoreTo: currNum,
    });
  }

  // 2. New scores (assignments present+graded now, not present in prev)
  const prevAsnKeys = new Set(prevAssignments.map(assignmentKey));
  const newScoreCounts = new Map<string, number>();
  for (const curr of currAssignments) {
    const key = assignmentKey(curr);
    if (prevAsnKeys.has(key)) continue;
    if (curr.isMissing) continue;
    if (curr.scoreNumeric == null || curr.scoreNumeric <= 0) continue;
    newScoreCounts.set(curr.className, (newScoreCounts.get(curr.className) ?? 0) + 1);
  }
  for (const [className, count] of newScoreCounts) {
    items.push({ type: "newScores", className, count });
  }

  // 3. Aging missing (still missing and overdue >= 14 days)
  const prevMissingKeys = new Set(prevAssignments.filter((a) => a.isMissing).map(assignmentKey));
  for (const curr of currAssignments) {
    if (!curr.isMissing) continue;
    if (!prevMissingKeys.has(assignmentKey(curr))) continue;
    if (!curr.dueDate) continue;
    const due = parseDueDate(curr.dueDate);
    if (!due) continue;
    const daysOverdue = (now.getTime() - due.getTime()) / MS_PER_DAY;
    if (daysOverdue < AGING_MISSING_DAYS) continue;
    items.push({
      type: "agingMissing",
      className: curr.className,
      assignmentName: curr.assignmentName,
      weeksOverdue: Math.floor(daysOverdue / 7),
    });
  }

  items.sort((a, b) => {
    const r = typeRank(a.type) - typeRank(b.type);
    if (r !== 0) return r;
    return a.className.localeCompare(b.className);
  });

  return items;
}
