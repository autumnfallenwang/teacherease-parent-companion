import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { StatusDots } from "@/components/status-dots";
import type { TrendDirection } from "@/lib/core/trend";
import { computeTrend } from "@/lib/core/trend";
import type { GradeRecord, StatusHistoryEntry } from "@/lib/ipc";

interface GradesTableProps {
  grades: GradeRecord[];
  history: Map<string, StatusHistoryEntry[]>;
  expandedClass: string | null;
  onClassClick: (className: string) => void;
  children?: (className: string) => ReactNode;
}

function getClassTabColor(className: string): string {
  const name = className.toLowerCase();
  if (name.includes("math")) return "class-tab-math";
  if (name.includes("science")) return "class-tab-science";
  if (name.includes("english")) return "class-tab-english";
  if (name.includes("social")) return "class-tab-social";
  if (name.includes("french")) return "class-tab-french";
  if (name.includes("art")) return "class-tab-art";
  if (name.includes("music")) return "class-tab-music";
  if (name.includes("physical") || name.includes("pe ")) return "class-tab-pe";
  if (name.includes("computer")) return "class-tab-cs";
  if (name.includes("health")) return "class-tab-health";
  return "class-tab-default";
}

function StatusIndicator({ grade }: { grade: GradeRecord }) {
  if (grade.needsAttention) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-attention/15 px-2.5 py-1 text-xs font-medium text-attention-foreground">
        <CircleAlert className="h-3 w-3 fill-attention text-attention" />
        Needs Attention
      </span>
    );
  }
  if (grade.status === "meeting") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-meeting/15 px-2.5 py-1 text-xs font-medium text-meeting">
        <CheckCircle2 className="h-3 w-3" />
        Meeting
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ungraded/10 px-2.5 py-1 text-xs font-medium text-ungraded-foreground">
      <CircleDashed className="h-3 w-3" />
      Not Assessed
    </span>
  );
}

function TrendArrow({ direction }: { direction: TrendDirection }) {
  if (direction === "up") {
    return <TrendingUp className="h-3.5 w-3.5 text-meeting" />;
  }
  if (direction === "down") {
    return <TrendingDown className="h-3.5 w-3.5 text-attention" />;
  }
  return null;
}

export function GradesTable({
  grades,
  history,
  expandedClass,
  onClassClick,
  children,
}: GradesTableProps) {
  if (grades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">No grade data yet. Tap Refresh to check.</p>
      </div>
    );
  }

  const meetingCount = grades.filter((g) => g.status === "meeting").length;
  const attentionCount = grades.filter((g) => g.needsAttention).length;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-lg font-medium" style={{ fontFamily: "var(--font-heading)" }}>
          Classes
        </h2>
        <p className="text-xs text-muted-foreground">
          {meetingCount} meeting
          {attentionCount > 0 && (
            <span className="text-attention-foreground"> · {attentionCount} need attention</span>
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        {grades.map((grade) => {
          const classHistory = history.get(grade.className) ?? [];
          const trend = computeTrend(classHistory);
          const isExpanded = expandedClass === grade.className;

          return (
            <div key={grade.id}>
              <button
                type="button"
                className={`flex w-full items-center gap-3 rounded-lg border-l-[3px] bg-card px-4 py-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-accent/50 ${getClassTabColor(grade.className)}`}
                onClick={() => onClassClick(grade.className)}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                  {grade.className}
                </span>
                <StatusDots history={classHistory} />
                <TrendArrow direction={trend} />
                <StatusIndicator grade={grade} />
              </button>

              {/* Accordion panel — T34 drilldown */}
              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  {isExpanded && (
                    <div className="ml-3 rounded-b-lg border-t border-border/50 bg-secondary/40">
                      {children?.(grade.className)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
