import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import type { GradeRecord } from "@/lib/ipc";

interface GradesTableProps {
  grades: GradeRecord[];
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

export function GradesTable({ grades }: GradesTableProps) {
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
        {grades.map((grade) => (
          <div
            key={grade.id}
            className={`flex items-center justify-between rounded-lg border-l-[3px] bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-accent/50 ${getClassTabColor(grade.className)}`}
          >
            <span className="text-[14px] font-medium">{grade.className}</span>
            <StatusIndicator grade={grade} />
          </div>
        ))}
      </div>
    </div>
  );
}
