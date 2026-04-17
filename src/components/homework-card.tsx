"use client";

import { BookOpen, Clock } from "lucide-react";
import type { HomeworkRecord } from "@/lib/ipc";

interface HomeworkCardProps {
  entries: HomeworkRecord[];
}

function formatHomeworkDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const weekday = d.toLocaleDateString(undefined, { weekday: "long" });
  const month = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${weekday} · ${month}`;
}

function isEmptyContent(content: string): boolean {
  const t = content.trim();
  return t === "" || t.toLowerCase() === "none";
}

export function HomeworkCard({ entries }: HomeworkCardProps) {
  if (entries.length === 0) return null;
  const firstDate = entries[0]?.hwDate ?? "";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <BookOpen className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-medium" style={{ fontFamily: "var(--font-heading)" }}>
          Tonight&apos;s Homework
        </h2>
        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {entries.length}
        </span>
      </div>

      {firstDate && (
        <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          {formatHomeworkDate(firstDate)}
        </p>
      )}

      <div className="space-y-1.5">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="rounded-lg border border-border bg-card px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{entry.subject}</p>
                {isEmptyContent(entry.content) ? (
                  <p className="text-[12px] text-muted-foreground">—</p>
                ) : (
                  <p className="whitespace-pre-line text-[12px] text-muted-foreground">
                    {entry.content}
                  </p>
                )}
              </div>
              {entry.dueDate && (
                <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {entry.dueDate}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
