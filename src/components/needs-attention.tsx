import { BookX, Clock } from "lucide-react";
import type { AssignmentRecord } from "@/lib/ipc";

interface NeedsAttentionProps {
  missingAssignments: AssignmentRecord[];
}

export function NeedsAttention({ missingAssignments }: NeedsAttentionProps) {
  if (missingAssignments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <BookX className="h-4 w-4 text-attention" />
        <h2 className="text-lg font-medium" style={{ fontFamily: "var(--font-heading)" }}>
          Missing Work
        </h2>
        <span className="ml-auto rounded-full bg-attention/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-attention-foreground">
          {missingAssignments.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {missingAssignments.map((asn) => (
          <div
            key={asn.id}
            className="flex items-center justify-between rounded-lg border border-attention/20 bg-attention/5 px-4 py-2.5"
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
  );
}
