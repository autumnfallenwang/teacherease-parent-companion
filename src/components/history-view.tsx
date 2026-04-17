"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChildTabs } from "@/components/child-tabs";
import { formatHomeworkDate, HomeworkRow } from "@/components/homework-card";
import type { FetchRunRecord, FetchRunStatus, HomeworkRecord } from "@/lib/ipc";
import {
  getChildren,
  getFetchRunsForChild,
  getLatestFetchRun,
  getNeedsAttentionGrades,
  getRecentHomework,
  log,
} from "@/lib/ipc";
import type { ChildRecord } from "@/lib/scraper/types";

type HistoryTab = "homework" | "scrapes";

function formatRunAt(runAt: string): string {
  const d = new Date(`${runAt.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return runAt;
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

function StatusPill({ status }: { status: FetchRunStatus }) {
  const base =
    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider";
  if (status === "success") {
    return <span className={`${base} bg-meeting/10 text-meeting`}>OK</span>;
  }
  if (status === "failed") {
    return <span className={`${base} bg-destructive/10 text-destructive`}>Failed</span>;
  }
  return <span className={`${base} bg-muted text-muted-foreground`}>Parse err</span>;
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border py-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function HomeworkSection({ rows }: { rows: HomeworkRecord[] }) {
  if (rows.length === 0) return <EmptyRow text="No homework yet." />;

  const groups = new Map<string, HomeworkRecord[]>();
  for (const r of rows) {
    const existing = groups.get(r.hwDate);
    if (existing) existing.push(r);
    else groups.set(r.hwDate, [r]);
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([date, entries]) => (
        <div key={date} className="space-y-2">
          <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            {formatHomeworkDate(date)}
          </p>
          <div className="space-y-1.5">
            {entries.map((entry) => (
              <HomeworkRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScrapesSection({ runs }: { runs: FetchRunRecord[] }) {
  if (runs.length === 0) return <EmptyRow text="No fetch runs yet." />;

  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {runs.map((run) => (
        <div key={run.id} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
          <span className="w-24 shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">
            {run.source}
          </span>
          <div className="min-w-0 flex-1">
            <p className="tabular-nums">{formatRunAt(run.runAt)}</p>
            {run.errorMessage && (
              <p className="truncate text-[11px] text-destructive" title={run.errorMessage}>
                {run.errorMessage}
              </p>
            )}
          </div>
          <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
            {run.durationMs == null ? "—" : `${(run.durationMs / 1000).toFixed(1)}s`}
          </span>
          <StatusPill status={run.status} />
        </div>
      ))}
    </div>
  );
}

export function HistoryView() {
  const searchParams = useSearchParams();

  const [allChildren, setAllChildren] = useState<ChildRecord[]>([]);
  const [childId, setChildId] = useState<number | null>(null);
  const [attentionChildIds, setAttentionChildIds] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<HistoryTab>("homework");
  const [homeworkRows, setHomeworkRows] = useState<HomeworkRecord[]>([]);
  const [fetchRuns, setFetchRuns] = useState<FetchRunRecord[]>([]);

  const loadData = useCallback(async (cId: number) => {
    const [hw, runs] = await Promise.all([
      getRecentHomework(cId, 50),
      getFetchRunsForChild(cId, 100),
    ]);
    setHomeworkRows(hw);
    setFetchRuns(runs);
  }, []);

  useEffect(() => {
    void getChildren()
      .then(async (children) => {
        setAllChildren(children);
        if (children.length === 0) return;

        const attnSet = new Set<number>();
        for (const c of children) {
          const run = await getLatestFetchRun(c.id);
          if (!run) continue;
          const attn = await getNeedsAttentionGrades(run.id);
          if (attn.length > 0) attnSet.add(c.id);
        }
        setAttentionChildIds(attnSet);

        const fromUrl = Number(searchParams.get("child")) || null;
        const validFromUrl = fromUrl && children.some((c) => c.id === fromUrl) ? fromUrl : null;
        const preferred = validFromUrl ?? Array.from(attnSet)[0] ?? children[0]?.id ?? null;
        if (preferred != null) {
          setChildId(preferred);
          await loadData(preferred);
        }
      })
      .catch(() => undefined);
  }, [loadData, searchParams]);

  const handleChildSelect = useCallback(
    (newChildId: number) => {
      if (newChildId === childId) return;
      void log(`history: switched to childId=${newChildId}`);
      setChildId(newChildId);
      setHomeworkRows([]);
      setFetchRuns([]);
      void loadData(newChildId);
    },
    [childId, loadData],
  );

  const tabs: Array<{ key: HistoryTab; label: string }> = [
    { key: "homework", label: "Homework" },
    { key: "scrapes", label: "Scrapes" },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-5 py-5">
      <h1
        className="text-xl font-medium tracking-tight"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        History
      </h1>

      {childId && allChildren.length > 1 && (
        <ChildTabs
          items={allChildren}
          selectedId={childId}
          attentionChildIds={attentionChildIds}
          onSelect={handleChildSelect}
        />
      )}

      <div className="flex gap-5 border-b border-border">
        {tabs.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`-mb-px border-b-2 pb-2 text-[13px] transition-colors ${
              activeTab === t.key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "homework" ? (
        <HomeworkSection rows={homeworkRows} />
      ) : (
        <ScrapesSection runs={fetchRuns} />
      )}
    </div>
  );
}
