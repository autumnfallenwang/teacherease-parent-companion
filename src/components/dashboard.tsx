"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AttentionSection } from "@/components/attention-section";
import { ChildTabs } from "@/components/child-tabs";
import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";
import { HomeworkCard } from "@/components/homework-card";
import { RecentActivity } from "@/components/recent-activity";
import type { ChildStatus } from "@/components/status-hero";
import { StatusHero } from "@/components/status-hero";
import { computeRecentActivity } from "@/lib/core/activity";
import { buildFetchRunner } from "@/lib/fetch/default";
import { HomeworkSource } from "@/lib/fetch/homework-source";
import { TeacherEaseSource } from "@/lib/fetch/teacherease-source";
import type { AssignmentRecord, FetchRunRecord, GradeRecord, HomeworkRecord } from "@/lib/ipc";
import {
  getAssignmentsForFetchRun,
  getChildren,
  getFetchRunBefore,
  getGradesForFetchRun,
  getLatestFetchRun,
  getLatestHomework,
  getMissingAssignments,
  getSettingBool,
  initLogging,
  log,
  logErr,
  setupAutostart,
} from "@/lib/ipc";
import type { ChildRecord } from "@/lib/scraper/types";

export function Dashboard() {
  const router = useRouter();
  const [allChildren, setAllChildren] = useState<ChildRecord[]>([]);
  const [childId, setChildId] = useState<number | null>(null);
  const [lastFetchRun, setLastFetchRun] = useState<FetchRunRecord | null>(null);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [missing, setMissing] = useState<AssignmentRecord[]>([]);
  const [allAssignments, setAllAssignments] = useState<AssignmentRecord[]>([]);
  const [prevGrades, setPrevGrades] = useState<GradeRecord[]>([]);
  const [prevAssignments, setPrevAssignments] = useState<AssignmentRecord[]>([]);
  const [homework, setHomework] = useState<HomeworkRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Family-wide status for the hero
  const [heroStatuses, setHeroStatuses] = useState<ChildStatus[]>([]);
  const attentionChildIds = useMemo(
    () => new Set(heroStatuses.filter((s) => s.attentionCount > 0).map((s) => s.childId)),
    [heroStatuses],
  );

  const activities = useMemo(
    () => computeRecentActivity(grades, allAssignments, prevGrades, prevAssignments),
    [grades, allAssignments, prevGrades, prevAssignments],
  );

  const loadData = useCallback(async (cId: number) => {
    const run = await getLatestFetchRun(cId);
    setLastFetchRun(run);
    if (run) {
      const [g, m, a] = await Promise.all([
        getGradesForFetchRun(run.id),
        getMissingAssignments(run.id),
        getAssignmentsForFetchRun(run.id),
      ]);
      setGrades(g);
      setMissing(m);
      setAllAssignments(a);

      const prevRun = await getFetchRunBefore(cId, run.runAt);
      if (prevRun) {
        const [pg, pa] = await Promise.all([
          getGradesForFetchRun(prevRun.id),
          getAssignmentsForFetchRun(prevRun.id),
        ]);
        setPrevGrades(pg);
        setPrevAssignments(pa);
      } else {
        setPrevGrades([]);
        setPrevAssignments([]);
      }
    }
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
    void getSettingBool("autostart.enabled", true)
      .then((enabled) => (enabled ? setupAutostart() : undefined))
      .catch(() => undefined);

    void getChildren()
      .then(async (children) => {
        await log(`dashboard: found ${children.length} children`);
        setAllChildren(children);
        if (children.length === 0) return;

        const statuses = await loadHeroStatuses(children);

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
      await loadHeroStatuses(children);
    } catch (e) {
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
      setPrevGrades([]);
      setPrevAssignments([]);
      setHomework([]);
      setLastFetchRun(null);
      void loadData(newChildId);
    },
    [childId, loadData],
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
        <StatusHero statuses={heroStatuses} onChildSelect={handleChildSelect} />

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

        <AttentionSection missingAssignments={missing} allAssignments={allAssignments} />

        <RecentActivity activities={activities} />

        <HomeworkCard entries={homework} />

        <div className="pt-2 text-center">
          <Link
            href={childId ? `/classes?child=${childId}` : "/classes"}
            className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            View all classes →
          </Link>
        </div>
      </main>
    </div>
  );
}
