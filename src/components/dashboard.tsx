"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AttentionSection } from "@/components/attention-section";
import { ChildTabs } from "@/components/child-tabs";
import { EmptyState } from "@/components/empty-state";
import { GradesTable } from "@/components/grades-table";
import { Header } from "@/components/header";
import { HomeworkCard } from "@/components/homework-card";
import { StandardsTree } from "@/components/standards-tree";
import type { ChildStatus } from "@/components/status-hero";
import { StatusHero } from "@/components/status-hero";
import { buildFetchRunner } from "@/lib/fetch/default";
import { HomeworkSource } from "@/lib/fetch/homework-source";
import { TeacherEaseSource } from "@/lib/fetch/teacherease-source";
import type {
  AssignmentRecord,
  FetchRunRecord,
  GradeRecord,
  HomeworkRecord,
  StatusHistoryEntry,
} from "@/lib/ipc";
import {
  getAllStatusHistory,
  getAssignmentsForFetchRun,
  getChildren,
  getClassDetail,
  getClasses,
  getGradesForFetchRun,
  getLatestFetchRun,
  getLatestHomework,
  getMissingAssignments,
  initLogging,
  log,
  logErr,
  setupAutostart,
} from "@/lib/ipc";
import type { ChildRecord, ClassDetails } from "@/lib/scraper/types";

const EMPTY_HISTORY = new Map<string, StatusHistoryEntry[]>();
const EMPTY_DETAIL_CACHE = new Map<string, ClassDetails | null>();
const EMPTY_INSTRUCTORS = new Map<number, string>();

export function Dashboard() {
  const router = useRouter();
  const [allChildren, setAllChildren] = useState<ChildRecord[]>([]);
  const [childId, setChildId] = useState<number | null>(null);
  const [lastFetchRun, setLastFetchRun] = useState<FetchRunRecord | null>(null);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [missing, setMissing] = useState<AssignmentRecord[]>([]);
  const [allAssignments, setAllAssignments] = useState<AssignmentRecord[]>([]);
  const [homework, setHomework] = useState<HomeworkRecord[]>([]);
  const [statusHistory, setStatusHistory] =
    useState<Map<string, StatusHistoryEntry[]>>(EMPTY_HISTORY);
  const [instructors, setInstructors] = useState<Map<number, string>>(EMPTY_INSTRUCTORS);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [detailCache, setDetailCache] =
    useState<Map<string, ClassDetails | null>>(EMPTY_DETAIL_CACHE);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Family-wide status for the hero
  const [heroStatuses, setHeroStatuses] = useState<ChildStatus[]>([]);
  const attentionChildIds = useMemo(
    () => new Set(heroStatuses.filter((s) => s.attentionCount > 0).map((s) => s.childId)),
    [heroStatuses],
  );

  const loadData = useCallback(async (cId: number) => {
    const run = await getLatestFetchRun(cId);
    setLastFetchRun(run);
    if (run) {
      const [g, m, h, a] = await Promise.all([
        getGradesForFetchRun(run.id),
        getMissingAssignments(run.id),
        getAllStatusHistory(cId),
        getAssignmentsForFetchRun(run.id),
      ]);
      setGrades(g);
      setMissing(m);
      setStatusHistory(h);
      setAllAssignments(a);
    }

    // Load instructor map from classes table
    const classes = await getClasses(cId);
    const instrMap = new Map<number, string>();
    for (const cls of classes) {
      if (cls.instructor) instrMap.set(cls.id, cls.instructor);
    }
    setInstructors(instrMap);

    // Latest homework entries (H5)
    setHomework(await getLatestHomework(cId));
  }, []);

  // Load hero statuses for ALL children
  const loadHeroStatuses = useCallback(async (children: ChildRecord[]) => {
    const statuses: ChildStatus[] = [];
    for (const child of children) {
      const run = await getLatestFetchRun(child.id);
      if (!run) {
        statuses.push({
          childId: child.id,
          name: child.displayName,
          meetingCount: 0,
          attentionCount: 0,
          notAssessedCount: 0,
          attentionClassNames: [],
        });
        continue;
      }
      const g = await getGradesForFetchRun(run.id);
      const attnClasses = g.filter((gr) => gr.needsAttention).map((gr) => gr.className);
      statuses.push({
        childId: child.id,
        name: child.displayName,
        meetingCount: g.filter((gr) => gr.status === "meeting").length,
        attentionCount: attnClasses.length,
        notAssessedCount: g.filter((gr) => gr.status === "not_assessed").length,
        attentionClassNames: attnClasses,
      });
    }
    setHeroStatuses(statuses);
    return statuses;
  }, []);

  useEffect(() => {
    void initLogging().catch(() => undefined);
    void setupAutostart().catch(() => undefined);

    void getChildren()
      .then(async (children) => {
        await log(`dashboard: found ${children.length} children`);
        setAllChildren(children);
        if (children.length === 0) return;

        // Load hero statuses for all children
        const statuses = await loadHeroStatuses(children);

        // Auto-select: first child needing attention, or first child
        const attnChild = statuses.find((s) => s.attentionCount > 0);
        const selectedId = attnChild?.childId ?? children[0]?.id;
        if (selectedId != null) {
          setChildId(selectedId);
          await loadData(selectedId);
        }
      })
      .catch(() => undefined);
  }, [loadData, loadHeroStatuses]);

  const handleRefresh = useCallback(async () => {
    if (!childId) return;
    await log(`refresh: started childId=${childId}`);
    setIsRefreshing(true);
    setError(null);

    try {
      const children = await getChildren();
      const child = children.find((c) => c.id === childId);
      if (!child) throw new Error("Child not found");

      const runner = buildFetchRunner([new TeacherEaseSource(), new HomeworkSource()]);
      const summary = await runner.runAll(child);
      const teRun = summary.runs.find((r) => r.source === "teacherease");

      if (teRun?.status === "failed") {
        setError(teRun.errorMessage ?? "Scrape failed");
      }

      await loadData(childId);
      setDetailCache(EMPTY_DETAIL_CACHE);
      await loadHeroStatuses(children);
    } catch (e) {
      // Pre-runner errors only (child lookup, etc). Per-source failures are
      // recorded in fetch_runs by the runner and surfaced via `teRun.status`
      // above — they don't hit this catch.
      const msg = e instanceof Error ? e.message : "Unknown error";
      await logErr(`refresh failed: ${msg}`);
      setError(msg);
    } finally {
      setIsRefreshing(false);
    }
  }, [childId, loadData, loadHeroStatuses]);

  const handleChildSelect = useCallback(
    (newChildId: number) => {
      if (newChildId === childId) return;
      void log(`dashboard: switched to childId=${newChildId}`);
      setChildId(newChildId);
      setGrades([]);
      setMissing([]);
      setAllAssignments([]);
      setHomework([]);
      setStatusHistory(EMPTY_HISTORY);
      setInstructors(EMPTY_INSTRUCTORS);
      setExpandedClass(null);
      setDetailCache(EMPTY_DETAIL_CACHE);
      setLastFetchRun(null);
      void loadData(newChildId);
    },
    [childId, loadData],
  );

  const handleClassClick = useCallback(
    (className: string) => {
      setExpandedClass((prev) => {
        const next = prev === className ? null : className;
        if (next && !detailCache.has(next) && lastFetchRun) {
          setDetailLoading(true);
          void getClassDetail(lastFetchRun.id, next)
            .then((detail) => {
              setDetailCache((cache) => new Map(cache).set(next, detail));
            })
            .catch(() => undefined)
            .finally(() => setDetailLoading(false));
        }
        return next;
      });
    },
    [detailCache, lastFetchRun],
  );

  const goSettings = useCallback(() => router.push("/settings"), [router]);

  if (childId === null && allChildren.length === 0) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header lastRunAt={null} onRefresh={() => undefined} onSettings={goSettings} />
        <main className="flex flex-1 flex-col">
          <EmptyState />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        lastRunAt={lastFetchRun?.runAt ?? null}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        onSettings={goSettings}
      />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-5 py-5">
        {/* Layer 1: Status Hero (family-wide) */}
        <StatusHero statuses={heroStatuses} onChildSelect={handleChildSelect} />

        {/* Child Tabs (hidden if 1 child) */}
        {childId && (
          <ChildTabs
            items={allChildren}
            selectedId={childId}
            attentionChildIds={attentionChildIds}
            onSelect={handleChildSelect}
          />
        )}

        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
            {error}
          </div>
        )}

        {/* Layer 2 (Recent Activity) disabled — see docs/homework-followups.md Q3. */}

        {/* Layer 3: Missing Work (if any) */}
        <AttentionSection missingAssignments={missing} allAssignments={allAssignments} />

        {/* Tonight's Homework (Q19 / H5) — renders only if data exists */}
        <HomeworkCard entries={homework} />

        {/* Layer 4: All Classes + Layer 5: Accordion */}
        <GradesTable
          grades={grades}
          history={statusHistory}
          instructors={instructors}
          expandedClass={expandedClass}
          onClassClick={handleClassClick}
        >
          {(className) => (
            <StandardsTree
              detail={detailCache.get(className) ?? null}
              isLoading={
                detailLoading && expandedClass === className && !detailCache.has(className)
              }
            />
          )}
        </GradesTable>
      </main>
    </div>
  );
}
