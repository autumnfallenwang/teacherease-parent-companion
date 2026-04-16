"use client";

import { AlertTriangle, BookX, ChevronRight, Clock, TrendingDown } from "lucide-react";
import { useState } from "react";
import type { AttentionItem } from "@/lib/core/attention";
import { groupAttentionByRecency } from "@/lib/core/attention";
import type { AssignmentRecord } from "@/lib/ipc";

interface AttentionSectionProps {
  missingAssignments: AssignmentRecord[];
  allAssignments: AssignmentRecord[];
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const { assignment: asn, type } = item;
  const isMissing = type === "missing";

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 ${
        isMissing
          ? "border-attention/20 bg-attention/5"
          : "border-border bg-amber-50/30 dark:bg-amber-950/10"
      }`}
    >
      {isMissing ? (
        <BookX className="h-3.5 w-3.5 shrink-0 text-attention" />
      ) : (
        <TrendingDown className="h-3.5 w-3.5 shrink-0 text-attention/60" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{asn.assignmentName}</p>
        <p className="text-[11px] text-muted-foreground">{asn.className}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {asn.dueDate && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {asn.dueDate}
          </span>
        )}
        {!isMissing && asn.score && (
          <span
            className={`text-[12px] font-semibold tabular-nums ${
              (asn.scoreNumeric ?? 0) < 2.0 ? "text-attention-foreground" : "text-muted-foreground"
            }`}
          >
            {asn.score}
          </span>
        )}
      </div>
    </div>
  );
}

export function AttentionSection({ missingAssignments, allAssignments }: AttentionSectionProps) {
  const { thisWeek, older } = groupAttentionByRecency(missingAssignments, allAssignments);
  const totalCount = thisWeek.length + older.length;
  const [olderExpanded, setOlderExpanded] = useState(false);

  if (totalCount === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <AlertTriangle className="h-4 w-4 text-attention" />
        <h2 className="text-lg font-medium" style={{ fontFamily: "var(--font-heading)" }}>
          Attention
        </h2>
        <span className="ml-auto rounded-full bg-attention/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-attention-foreground">
          {totalCount}
        </span>
      </div>

      {/* This week — expanded by default */}
      {thisWeek.length > 0 && (
        <div className="space-y-1.5">
          <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            This week
          </p>
          {thisWeek.map((item) => (
            <AttentionRow key={item.assignment.id} item={item} />
          ))}
        </div>
      )}

      {/* Older — collapsed by default */}
      {older.length > 0 && (
        <div>
          <button
            type="button"
            className="flex w-full items-center gap-1 px-1 py-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
            onClick={() => setOlderExpanded((prev) => !prev)}
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform duration-200 ${olderExpanded ? "rotate-90" : ""}`}
            />
            Older ({older.length})
          </button>
          <div
            className="grid transition-[grid-template-rows] duration-200 ease-out"
            style={{ gridTemplateRows: olderExpanded ? "1fr" : "0fr" }}
          >
            <div className="space-y-1.5 overflow-hidden">
              {older.map((item) => (
                <AttentionRow key={item.assignment.id} item={item} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
