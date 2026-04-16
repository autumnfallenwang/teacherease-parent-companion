// Pure attention logic — no platform imports.

import type { AssignmentRecord } from "@/lib/ipc";

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
