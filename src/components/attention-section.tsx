import { AlertTriangle, BookX, Clock, TrendingDown } from "lucide-react";
import { getLowScoreAssignments } from "@/lib/core/attention";
import type { UrgencyGroup } from "@/lib/core/missing";
import { groupMissingByUrgency } from "@/lib/core/missing";
import type { AssignmentRecord } from "@/lib/ipc";

interface AttentionSectionProps {
  missingAssignments: AssignmentRecord[];
  allAssignments: AssignmentRecord[];
}

const MISSING_STYLES: Record<UrgencyGroup, string> = {
  overdue3w: "border-attention/30 bg-attention/10",
  overdue1w: "border-attention/20 bg-attention/5",
  recent: "border-attention/15",
  noDueDate: "border-muted",
};

export function AttentionSection({ missingAssignments, allAssignments }: AttentionSectionProps) {
  const missingGroups = groupMissingByUrgency(missingAssignments);
  const lowScores = getLowScoreAssignments(allAssignments);
  const totalCount = missingAssignments.length + lowScores.length;

  if (totalCount === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <AlertTriangle className="h-4 w-4 text-attention" />
        <h2 className="text-lg font-medium" style={{ fontFamily: "var(--font-heading)" }}>
          Attention
        </h2>
        <span className="ml-auto rounded-full bg-attention/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-attention-foreground">
          {totalCount}
        </span>
      </div>

      {/* Missing work */}
      {missingAssignments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <BookX className="h-3.5 w-3.5 text-attention" />
            <p className="text-[12px] font-medium text-attention-foreground">
              Missing ({missingAssignments.length})
            </p>
          </div>
          {missingGroups.map((group) => (
            <div key={group.group}>
              <p className="px-1 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((asn) => (
                  <div
                    key={asn.id}
                    className={`flex items-center justify-between rounded-lg border px-4 py-2.5 ${MISSING_STYLES[group.group]}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{asn.assignmentName}</p>
                      <p className="text-[11px] text-muted-foreground">{asn.className}</p>
                    </div>
                    {asn.dueDate && (
                      <div className="ml-3 flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {asn.dueDate}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Low scores */}
      {lowScores.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <TrendingDown className="h-3.5 w-3.5 text-attention/70" />
            <p className="text-[12px] font-medium text-muted-foreground">
              Low scores ({lowScores.length})
            </p>
          </div>
          <div className="space-y-1">
            {lowScores.map((asn) => (
              <div
                key={asn.id}
                className="flex items-center justify-between rounded-lg border border-border bg-amber-50/30 px-4 py-2.5 dark:bg-amber-950/10"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]">{asn.assignmentName}</p>
                  <p className="text-[11px] text-muted-foreground">{asn.className}</p>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  {asn.dueDate && (
                    <span className="text-[11px] text-muted-foreground">{asn.dueDate}</span>
                  )}
                  <span
                    className={`text-[12px] font-semibold tabular-nums ${
                      (asn.scoreNumeric ?? 0) < 2.0
                        ? "text-attention-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {asn.score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
