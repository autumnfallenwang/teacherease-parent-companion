// Pure sort utilities — no platform imports.

import type { GradeRecord } from "@/lib/ipc";

const STATUS_PRIORITY: Record<string, number> = {
  needs_attention: 0,
  meeting: 1,
  not_assessed: 2,
};

/**
 * Sort grades by urgency: needs_attention first, then meeting, then not_assessed.
 * Stable sort — preserves original order within each group.
 */
export function sortClassesByUrgency(grades: GradeRecord[]): GradeRecord[] {
  return [...grades].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status ?? "not_assessed"] ?? 2;
    const pb = STATUS_PRIORITY[b.status ?? "not_assessed"] ?? 2;
    return pa - pb;
  });
}
