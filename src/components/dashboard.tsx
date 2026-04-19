"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AttentionSection } from "@/components/attention-section";
import { EmptyState } from "@/components/empty-state";
import { HomeworkCard } from "@/components/homework-card";
import { RecentActivity } from "@/components/recent-activity";
import { PageHeader } from "@/components/shell/page-header";
import { CHILD_DATA_REFRESHED_EVENT } from "@/components/shell/sidebar-child-selector";
import type { ChildStatus } from "@/components/status-hero";
import { StatusHero } from "@/components/status-hero";
import { Button } from "@/components/ui/button";
import { useSelectedChild } from "@/hooks/use-selected-child";
import { computeRecentActivity } from "@/lib/core/activity";
import {
  type AttentionConfig,
  computeChildAttention,
  DEFAULT_ATTENTION_CONFIG,
} from "@/lib/core/attention-engine";
import { buildFetchRunner } from "@/lib/fetch/default";
import { HomeworkSource } from "@/lib/fetch/homework-source";
import { TeacherEaseSource } from "@/lib/fetch/teacherease-source";
import type { AssignmentRecord, FetchRunRecord, GradeRecord, HomeworkRecord } from "@/lib/ipc";
import {
  getAllClassDetails,
  getAssignmentsForFetchRun,
  getAttentionConfig,
  getChildren,
  getFetchRunBefore,
  getGradesForFetchRun,
  getLatestFetchRun,
  getLatestHomework,
  getLatestSuccessfulFetchRun,
  getSettingBool,
  initLogging,
  log,
  logErr,
  setupAutostart,
} from "@/lib/ipc";
import type { ChildRecord, ClassDetails } from "@/lib/scraper/types";

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface ScrapeFailure {
  readonly name: string;
  readonly message: string;
}

async function scrapeOneChild(child: ChildRecord): Promise<ScrapeFailure | null> {
  try {
    const runner = buildFetchRunner([new TeacherEaseSource(), new HomeworkSource()]);
    const summary = await runner.runAll(child);
    const teRun = summary.runs.find((r) => r.source === "teacherease");
    if (teRun?.status === "failed") {
      return { name: child.displayName, message: teRun.errorMessage ?? "Scrape failed" };
    }
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await logErr(`refresh: child ${child.id} failed ${msg}`);
    return { name: child.displayName, message: msg };
  }
}

function summarizeFailures(failures: readonly ScrapeFailure[]): string | null {
  if (failures.length === 0) return null;
  const first = failures[0];
  if (!first) return null;
  if (failures.length === 1) return `${first.name}: ${first.message}`;
  return `${failures.length} children failed. First: ${first.name} — ${first.message}`;
}

export function Dashboard() {
  const { selectedChildId: childId, setSelectedChildId } = useSelectedChild();
  const [allChildren, setAllChildren] = useState<ChildRecord[]>([]);
  const [lastFetchRun, setLastFetchRun] = useState<FetchRunRecord | null>(null);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [allAssignments, setAllAssignments] = useState<AssignmentRecord[]>([]);
  const [classDetails, setClassDetails] = useState<ClassDetails[]>([]);
  const [attentionCfg, setAttentionCfg] = useState<AttentionConfig>(DEFAULT_ATTENTION_CONFIG);
  const [prevGrades, setPrevGrades] = useState<GradeRecord[]>([]);
  const [prevAssignments, setPrevAssignments] = useState<AssignmentRecord[]>([]);
  const [homework, setHomework] = useState<HomeworkRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Family-wide status for the hero
  const [heroStatuses, setHeroStatuses] = useState<ChildStatus[]>([]);

  const activities = useMemo(
    () => computeRecentActivity(grades, allAssignments, prevGrades, prevAssignments),
    [grades, allAssignments, prevGrades, prevAssignments],
  );

  // Attention engine (Phase 15 AT2) — computed from the full ClassDetails tree
  // and the per-user forgiveness + low-score config. `new Date()` re-evaluates
  // on every data refresh (manual or 6h auto), which is sufficient for v1 —
  // age boundaries don't flip mid-session unless the app is idle for 14+ days.
  const attentionResult = useMemo(
    () => computeChildAttention(classDetails, new Date(), attentionCfg),
    [classDetails, attentionCfg],
  );

  const loadData = useCallback(async (cId: number) => {
    // "Checked Xm ago" timestamp uses the most recent attempt regardless of
    // source/status (it represents "when did we last try?"), but the actual
    // grade/assignment reads come from the latest SUCCESSFUL teacherease
    // run — otherwise a failed TE scrape or a success-only homework scrape
    // would make prior good data look like it disappeared.
    const [latestRun, teRun] = await Promise.all([
      getLatestFetchRun(cId),
      getLatestSuccessfulFetchRun(cId, "teacherease"),
    ]);
    setLastFetchRun(latestRun);
    if (teRun) {
      const [g, a, cd, cfg] = await Promise.all([
        getGradesForFetchRun(teRun.id),
        getAssignmentsForFetchRun(teRun.id),
        getAllClassDetails(teRun.id),
        getAttentionConfig(),
      ]);
      setGrades(g);
      setAllAssignments(a);
      setClassDetails(cd);
      setAttentionCfg(cfg);

      const prevRun = await getFetchRunBefore(cId, teRun.runAt);
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
    } else {
      // Freshly-added child has no successful teacherease scrape yet —
      // clear any stale data carried over from the previously-selected
      // child so Today renders the empty "click Refresh" state.
      setGrades([]);
      setAllAssignments([]);
      setClassDetails([]);
      setPrevGrades([]);
      setPrevAssignments([]);
    }
    setHomework(await getLatestHomework(cId));
  }, []);

  // Load hero statuses for ALL children.  Per Q25 (AT4) the hero's
  // attention count + class-name list come from our engine, not TeacherEase's
  // `needsAttention` column.  `meetingCount` / `notAssessedCount` stay on the
  // portal's `status` field — they're the orthogonal "meeting" dimension.
  const loadHeroStatuses = useCallback(async (children: ChildRecord[]) => {
    const cfg = await getAttentionConfig();
    const statuses: ChildStatus[] = [];
    for (const child of children) {
      const run = await getLatestSuccessfulFetchRun(child.id, "teacherease");
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
      const [g, cd] = await Promise.all([getGradesForFetchRun(run.id), getAllClassDetails(run.id)]);
      const engine = computeChildAttention(cd, new Date(), cfg);
      const attnClasses = engine.perClass
        .filter((c) => c.classFlag.status === "attention")
        .map((c) => c.className);
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
        await loadHeroStatuses(children);
      })
      .catch(() => undefined);
  }, [loadHeroStatuses]);

  // Load per-child data whenever the sidebar-driven selection changes.
  useEffect(() => {
    if (childId == null) return;
    void loadData(childId);
  }, [childId, loadData]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const children = await getChildren();
      if (children.length === 0) return;
      await log(`refresh: started children=${children.length}`);

      // Scrape every child sequentially. Per-child failures don't block
      // the others — each child's fetch_run row captures its own status;
      // we surface a compact summary banner when any fail.
      const failures: ScrapeFailure[] = [];
      for (const child of children) {
        const failure = await scrapeOneChild(child);
        if (failure) failures.push(failure);
      }
      setError(summarizeFailures(failures));

      if (childId != null) await loadData(childId);
      await loadHeroStatuses(children);
      window.dispatchEvent(new CustomEvent(CHILD_DATA_REFRESHED_EVENT));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      await logErr(`refresh failed: ${msg}`);
      setError(msg);
    } finally {
      setIsRefreshing(false);
    }
  }, [childId, loadData, loadHeroStatuses]);

  const handleChildSelect = useCallback(
    async (newChildId: number) => {
      if (newChildId === childId) return;
      await log(`dashboard: switched to childId=${newChildId}`);
      await setSelectedChildId(newChildId);
    },
    [childId, setSelectedChildId],
  );

  if (childId === null && allChildren.length === 0) {
    return (
      <>
        <PageHeader title="Today" />
        <div className="flex flex-1 flex-col">
          <EmptyState />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Today"
        actions={
          <>
            {lastFetchRun?.runAt ? (
              <span className="text-[11px] text-muted-foreground">
                Checked {formatTimeAgo(lastFetchRun.runAt)}
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              disabled={isRefreshing}
              onClick={handleRefresh}
              className="h-8 gap-1.5 px-2.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Checking" : "Refresh"}
            </Button>
          </>
        }
      />
      <div className="mx-auto w-full max-w-2xl space-y-5 px-5 py-5">
        <StatusHero statuses={heroStatuses} onChildSelect={handleChildSelect} />

        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
            {error}
          </div>
        )}

        <AttentionSection
          withinWindow={attentionResult.withinWindow}
          agedOut={attentionResult.agedOut}
        />

        <RecentActivity activities={activities} />

        <HomeworkCard entries={homework} />

        <div className="pt-2 text-center">
          <Link
            href="/classes"
            className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            View all classes →
          </Link>
        </div>
      </div>
    </>
  );
}
