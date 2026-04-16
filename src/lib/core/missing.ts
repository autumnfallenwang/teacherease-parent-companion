// Pure missing-work grouping — no platform imports.

import type { AssignmentRecord } from "@/lib/ipc";

export type UrgencyGroup = "overdue3w" | "overdue1w" | "recent" | "noDueDate";

export interface GroupedMissing {
  group: UrgencyGroup;
  label: string;
  items: AssignmentRecord[];
}

const MS_PER_DAY = 86_400_000;

function parseDueDate(dueDate: string): Date | null {
  // Handles "M/D" format (e.g., "4/15") — assumes current year
  const match = dueDate.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (match) {
    const month = Number.parseInt(match[1] ?? "0", 10) - 1;
    const day = Number.parseInt(match[2] ?? "0", 10);
    const d = new Date();
    d.setMonth(month, day);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Handles full datetime "M/D/YYYY H:MM AM" or ISO-like strings
  const d = new Date(dueDate);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Group missing assignments by how overdue they are.
 * Returns only non-empty groups, ordered from most urgent to least.
 */
export function groupMissingByUrgency(
  assignments: AssignmentRecord[],
  now: Date = new Date(),
): GroupedMissing[] {
  const buckets: Record<UrgencyGroup, AssignmentRecord[]> = {
    overdue3w: [],
    overdue1w: [],
    recent: [],
    noDueDate: [],
  };

  const nowMs = now.getTime();

  for (const asn of assignments) {
    if (!asn.dueDate) {
      buckets.noDueDate.push(asn);
      continue;
    }

    const due = parseDueDate(asn.dueDate);
    if (!due) {
      buckets.noDueDate.push(asn);
      continue;
    }

    const daysOverdue = (nowMs - due.getTime()) / MS_PER_DAY;

    if (daysOverdue >= 21) {
      buckets.overdue3w.push(asn);
    } else if (daysOverdue >= 7) {
      buckets.overdue1w.push(asn);
    } else {
      buckets.recent.push(asn);
    }
  }

  const labels: Record<UrgencyGroup, string> = {
    overdue3w: "Overdue (3+ weeks)",
    overdue1w: "Overdue (1–3 weeks)",
    recent: "Recent",
    noDueDate: "No due date",
  };

  const order: UrgencyGroup[] = ["overdue3w", "overdue1w", "recent", "noDueDate"];

  return order
    .filter((g) => buckets[g].length > 0)
    .map((g) => ({ group: g, label: labels[g], items: buckets[g] }));
}
