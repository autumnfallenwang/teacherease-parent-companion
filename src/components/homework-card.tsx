"use client";

import { BookOpen, Clock } from "lucide-react";
import type { HomeworkRecord } from "@/lib/ipc";

interface HomeworkCardProps {
  entries: HomeworkRecord[];
}

function parseIsoDay(iso: string): Date | null {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatHomeworkDate(iso: string): string {
  const d = parseIsoDay(iso);
  if (!d) return iso;
  const weekday = d.toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });
  const month = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${weekday} · ${month}`;
}

export function formatDueChip(iso: string, inferred: boolean): string {
  const d = parseIsoDay(iso);
  if (!d) return iso;
  const weekday = d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
  const mm = d.getUTCMonth() + 1;
  const dd = d.getUTCDate();
  const label = `${weekday} ${mm}/${dd}`;
  return inferred ? `~${label}` : label;
}

export function isEmptyContent(content: string): boolean {
  const t = content.trim();
  return t === "" || t.toLowerCase() === "none";
}

export function HomeworkRow({ entry }: { entry: HomeworkRecord }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">{entry.subject}</p>
          {isEmptyContent(entry.content) ? (
            <p className="text-[12px] text-muted-foreground">—</p>
          ) : (
            <p className="whitespace-pre-line text-[12px] text-muted-foreground">{entry.content}</p>
          )}
        </div>
        {entry.dueDate && (
          <span
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] ${
              entry.dueDateInferred ? "italic text-muted-foreground/70" : "text-muted-foreground"
            }`}
            title={
              entry.dueDateInferred
                ? "Due date not posted — estimated to be the next school day"
                : undefined
            }
          >
            <Clock className="h-3 w-3" />
            {formatDueChip(entry.dueDate, entry.dueDateInferred)}
          </span>
        )}
      </div>
    </div>
  );
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
          <HomeworkRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}
