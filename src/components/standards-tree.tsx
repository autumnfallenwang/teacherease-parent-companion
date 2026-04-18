import { CheckCircle2, CircleAlert, Clock, Info } from "lucide-react";
import type { Assignment, ClassDetails, Standard } from "@/lib/scraper/types";

interface StandardsTreeProps {
  detail: ClassDetails | null;
  isLoading?: boolean;
}

function AssignmentRow({ assignment }: { assignment: Assignment }) {
  if (assignment.isMissing) {
    return (
      <div className="flex items-center justify-between rounded-md border border-attention/20 bg-attention/5 px-3 py-1.5">
        <span className="truncate text-[12px] font-medium">{assignment.name}</span>
        <div className="flex shrink-0 items-center gap-2">
          {assignment.dueDate && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {assignment.dueDate}
            </span>
          )}
          <span className="text-[11px] font-medium text-attention-foreground">Missing</span>
        </div>
      </div>
    );
  }

  const hasGrade = assignment.gradeLetter !== "" || assignment.grade !== "";

  return (
    <div className="flex items-center justify-between rounded-md px-3 py-1.5">
      <span className="truncate text-[12px] text-foreground/80">{assignment.name}</span>
      <div className="flex shrink-0 items-center gap-2">
        {assignment.dueDate && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {assignment.dueDate}
          </span>
        )}
        {hasGrade ? (
          <>
            {assignment.gradeLetter && (
              <span className="min-w-[2rem] text-right text-[12px] font-medium tabular-nums">
                {assignment.gradeLetter}
              </span>
            )}
            {assignment.grade && (
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {assignment.grade}
              </span>
            )}
          </>
        ) : (
          <span className="text-[11px] italic text-muted-foreground">Not graded</span>
        )}
      </div>
    </div>
  );
}

function StandardNode({ standard, depth }: { standard: Standard; depth: number }) {
  const hasContent = standard.assignments.length > 0 || standard.children.length > 0;

  return (
    <div className={depth > 0 ? "ml-4" : ""}>
      <div className="flex items-center gap-2 py-1.5">
        {standard.isMeeting ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-meeting" />
        ) : (
          <CircleAlert className="h-3.5 w-3.5 shrink-0 text-attention" />
        )}
        <span className="text-[13px] font-medium" style={{ fontFamily: "var(--font-heading)" }}>
          {standard.name}
        </span>
        {standard.scoreLetter && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {standard.scoreLetter}
          </span>
        )}
      </div>

      {standard.assignments.length > 0 && (
        <div className="ml-5 space-y-0.5">
          {standard.assignments.map((asn) => (
            <AssignmentRow key={`${asn.name}-${asn.dueDate}`} assignment={asn} />
          ))}
        </div>
      )}

      {standard.children.length > 0 && (
        <div className="ml-1">
          {standard.children.map((child) => (
            <StandardNode key={child.name} standard={child} depth={depth + 1} />
          ))}
        </div>
      )}

      {!hasContent && (
        <p className="ml-5 py-1 text-[11px] italic text-muted-foreground">(no assignments yet)</p>
      )}
    </div>
  );
}

export function StandardsTree({ detail, isLoading }: StandardsTreeProps) {
  if (isLoading) {
    return (
      <div className="px-4 py-4">
        <p className="text-[12px] text-muted-foreground">Loading details...</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex items-center gap-2 px-4 py-4">
        <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[12px] text-muted-foreground">No standards data available.</p>
      </div>
    );
  }

  if (detail.standards.length === 0) {
    return (
      <div className="px-4 py-4">
        <p className="text-[12px] text-muted-foreground">No standards data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 px-4 py-3">
      {detail.standards.map((standard) => (
        <StandardNode key={standard.name} standard={standard} depth={0} />
      ))}
    </div>
  );
}
