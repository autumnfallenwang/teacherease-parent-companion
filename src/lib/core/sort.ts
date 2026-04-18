// Pure sort utilities — no platform imports.

import type { GradeRecord } from "@/lib/ipc";

const STATUS_PRIORITY: Record<string, number> = {
  needs_attention: 0,
  meeting: 1,
  not_assessed: 2,
};

/**
 * Sort grades by urgency.
 *
 * Per Q25 (Phase 15 AT4), the app's attention engine is the primary sort key:
 * classes our engine flags go first regardless of what TeacherEase thinks.
 * The secondary key is TeacherEase's own `status` (needs_attention, meeting,
 * not_assessed) which drives the "meeting" dimension display.
 *
 * Back-compat: if `attentionClassNames` is empty (or omitted), behavior falls
 * back to pre-AT4 — pure TeacherEase-status sort.
 *
 * Stable sort — preserves original order within each group.
 */
export function sortClassesByUrgency(
  grades: GradeRecord[],
  attentionClassNames: ReadonlySet<string> = new Set(),
): GradeRecord[] {
  return [...grades].sort((a, b) => {
    const aAttn = attentionClassNames.has(a.className) ? 0 : 1;
    const bAttn = attentionClassNames.has(b.className) ? 0 : 1;
    if (aAttn !== bAttn) return aAttn - bAttn;
    const pa = STATUS_PRIORITY[a.status ?? "not_assessed"] ?? 2;
    const pb = STATUS_PRIORITY[b.status ?? "not_assessed"] ?? 2;
    return pa - pb;
  });
}
