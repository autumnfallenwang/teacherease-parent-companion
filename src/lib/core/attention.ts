// Pure attention logic — no platform imports.

import type { AssignmentRecord } from "@/lib/ipc";

export type AttentionItemType = "missing" | "lowScore";

export interface AttentionItem {
  type: AttentionItemType;
  assignment: AssignmentRecord;
}

export interface GroupedAttention {
  thisWeek: AttentionItem[];
  older: AttentionItem[];
}

const MS_PER_DAY = 86_400_000;

function parseDueDate(dueDate: string): Date | null {
  // "M/D" format — assumes current year
  const match = dueDate.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (match) {
    const month = Number.parseInt(match[1] ?? "0", 10) - 1;
    const day = Number.parseInt(match[2] ?? "0", 10);
    const d = new Date();
    d.setMonth(month, day);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  // Full datetime
  const d = new Date(dueDate);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isThisWeek(dueDate: string | null, now: Date): boolean {
  if (!dueDate) return true; // No due date → show in "this week" (recent/unknown)
  const d = parseDueDate(dueDate);
  if (!d) return true;
  const daysAgo = (now.getTime() - d.getTime()) / MS_PER_DAY;
  return daysAgo < 7;
}

/**
 * Filter assignments that have a score below Meeting (3.0).
 * Only includes graded assignments (scoreNumeric > 0) — excludes missing and ungraded.
 * Returns sorted by score ascending (worst first).
 */
export function getLowScoreAssignments(assignments: AssignmentRecord[]): AssignmentRecord[] {
  return assignments
    .filter(
      (a) => !a.isMissing && a.scoreNumeric != null && a.scoreNumeric > 0 && a.scoreNumeric < 3.0,
    )
    .sort((a, b) => (a.scoreNumeric ?? 0) - (b.scoreNumeric ?? 0));
}

/**
 * Group attention items (missing + low scores) by recency.
 * "This week" = due date within last 7 days (or no due date).
 * "Older" = everything else.
 * Within each group: missing items first, then low scores.
 */
export function groupAttentionByRecency(
  missingAssignments: AssignmentRecord[],
  allAssignments: AssignmentRecord[],
  now: Date = new Date(),
): GroupedAttention {
  const lowScores = getLowScoreAssignments(allAssignments);

  const thisWeek: AttentionItem[] = [];
  const older: AttentionItem[] = [];

  // Add missing items
  for (const asn of missingAssignments) {
    const item: AttentionItem = { type: "missing", assignment: asn };
    if (isThisWeek(asn.dueDate, now)) {
      thisWeek.push(item);
    } else {
      older.push(item);
    }
  }

  // Add low scores
  for (const asn of lowScores) {
    const item: AttentionItem = { type: "lowScore", assignment: asn };
    if (isThisWeek(asn.dueDate, now)) {
      thisWeek.push(item);
    } else {
      older.push(item);
    }
  }

  // Sort within groups: missing first, then low scores
  const sortItems = (items: AttentionItem[]) =>
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === "missing" ? -1 : 1;
      return 0;
    });

  return {
    thisWeek: sortItems(thisWeek),
    older: sortItems(older),
  };
}
