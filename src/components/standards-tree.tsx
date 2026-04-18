import { CheckCircle2, CircleAlert, Clock, Info, TrendingDown } from "lucide-react";
import { useMemo } from "react";
import {
  type AssignmentAttention,
  type AttentionConfig,
  computeClassAttention,
  DEFAULT_ATTENTION_CONFIG,
  type StandardAttentionNode as EngineStandardNode,
} from "@/lib/core/attention-engine";
import type { Assignment, ClassDetails, Standard } from "@/lib/scraper/types";

interface StandardsTreeProps {
  detail: ClassDetails | null;
  isLoading?: boolean;
  attentionCfg?: AttentionConfig;
}

function AssignmentRow({
  assignment,
  attention,
}: {
  assignment: Assignment;
  attention: AssignmentAttention;
}) {
  const isLowScoreAttention = attention.reason === "lowScore" && attention.withinWindow;

  if (assignment.isMissing) {
    const isAgedOut = !attention.withinWindow;
    const rowClasses = isAgedOut
      ? "rounded-md border border-border px-3 py-1.5"
      : "rounded-md border border-attention/20 bg-attention/5 px-3 py-1.5";
    const nameClasses = `truncate text-[12px] font-medium ${
      isAgedOut ? "text-muted-foreground" : ""
    }`;
    const tagClasses = isAgedOut
      ? "text-[11px] font-medium text-muted-foreground"
      : "text-[11px] font-medium text-attention-foreground";

    return (
      <div className={`flex items-center justify-between ${rowClasses}`}>
        <span className={nameClasses}>{assignment.name}</span>
        <div className="flex shrink-0 items-center gap-2">
          {assignment.dueDate && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {assignment.dueDate}
            </span>
          )}
          <span className={tagClasses}>Missing</span>
        </div>
      </div>
    );
  }

  const hasGrade = assignment.gradeLetter !== "" || assignment.grade !== "";

  return (
    <div className="flex items-center justify-between rounded-md px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5">
        {isLowScoreAttention && <TrendingDown className="h-3 w-3 shrink-0 text-attention/70" />}
        <span className="truncate text-[12px] text-foreground/80">{assignment.name}</span>
      </div>
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

function StandardNode({
  standard,
  attention,
  depth,
}: {
  standard: Standard;
  attention: EngineStandardNode;
  depth: number;
}) {
  const hasContent = standard.assignments.length > 0 || standard.children.length > 0;
  const { status, agedOutOnly } = attention.flag;

  // Three-state icon — TeacherEase's M/P/B/PS letter (shown below) carries the
  // meeting dimension.  This icon carries OUR attention dimension (per Q25).
  let Icon = CheckCircle2;
  let iconClass = "text-meeting";
  let iconTitle = "All clear";
  if (status === "attention") {
    Icon = CircleAlert;
    iconClass = "text-attention";
    iconTitle = "Needs attention";
  } else if (agedOutOnly) {
    iconClass = "text-muted-foreground";
    iconTitle = "Older items (resolved)";
  }

  return (
    <div className={depth > 0 ? "ml-4" : ""}>
      <div className="flex items-center gap-2 py-1.5">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClass}`} aria-label={iconTitle} role="img">
          <title>{iconTitle}</title>
        </Icon>
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
          {standard.assignments.map((asn, i) => {
            const asnAttention = attention.assignments[i];
            if (!asnAttention) return null;
            return (
              <AssignmentRow
                key={`${asn.name}-${asn.dueDate}`}
                assignment={asn}
                attention={asnAttention}
              />
            );
          })}
        </div>
      )}

      {standard.children.length > 0 && (
        <div className="ml-1">
          {standard.children.map((child, i) => {
            const childAttention = attention.children[i];
            if (!childAttention) return null;
            return (
              <StandardNode
                key={child.name}
                standard={child}
                attention={childAttention}
                depth={depth + 1}
              />
            );
          })}
        </div>
      )}

      {!hasContent && (
        <p className="ml-5 py-1 text-[11px] italic text-muted-foreground">(no assignments yet)</p>
      )}
    </div>
  );
}

export function StandardsTree({
  detail,
  isLoading,
  attentionCfg = DEFAULT_ATTENTION_CONFIG,
}: StandardsTreeProps) {
  // Compute attention unconditionally — hook rules require it above any
  // early-returns.  `null` when detail isn't ready yet.
  const attention = useMemo(
    () => (detail ? computeClassAttention(detail, new Date(), attentionCfg) : null),
    [detail, attentionCfg],
  );

  if (isLoading) {
    return (
      <div className="px-4 py-4">
        <p className="text-[12px] text-muted-foreground">Loading details...</p>
      </div>
    );
  }

  if (!detail || !attention) {
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
      {detail.standards.map((standard, i) => {
        const node = attention.standards[i];
        if (!node) return null;
        return <StandardNode key={standard.name} standard={standard} attention={node} depth={0} />;
      })}
    </div>
  );
}
