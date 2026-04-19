"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AttentionSection } from "@/components/attention-section";
import { EmptyState } from "@/components/empty-state";
import { HomeworkTodaySections } from "@/components/homework-card";
import { PageHeader } from "@/components/shell/page-header";
import { CHILD_DATA_REFRESHED_EVENT } from "@/components/shell/sidebar-child-selector";
import type { ChildStatus } from "@/components/status-hero";
import { StatusHero } from "@/components/status-hero";
import { Button } from "@/components/ui/button";
import { useSelectedChild } from "@/hooks/use-selected-child";
import {
  type AttentionConfig,
  computeChildAttention,
  DEFAULT_ATTENTION_CONFIG,
} from "@/lib/core/attention-engine";
import { buildFetchRunner } from "@/lib/fetch/default";
import { HomeworkSource } from "@/lib/fetch/homework-source";
import { TeacherEaseSource } from "@/lib/fetch/teacherease-source";
import type { FetchRunnerSummary } from "@/lib/fetch/types";
import type { FetchRunRecord, HomeworkRecord } from "@/lib/ipc";
import {
  getAllClassDetails,
  getAttentionConfig,
  getChildren,
  getGradesForFetchRun,
  getHomeworkForDay,
  getLatestFetchRun,
  getLatestSuccessfulFetchRun,
  getSettingBool,
  initLogging,
  log,
  logErr,
  setupAutostart,
} from "@/lib/ipc";
import { buildNotifyRouter } from "@/lib/notify/default";
import { buildRefreshDigest, type ChildHeroCounts, toLocalIso } from "@/lib/notify/digest";
import type { DigestFailure } from "@/lib/notify/types";
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

interface ScrapeOutcome {
  readonly child: ChildRecord;
  readonly summary: FetchRunnerSummary | null;
  readonly hardError: string | null;
}

async function scrapeOneChild(child: ChildRecord): Promise<ScrapeOutcome> {
  try {
    const runner = buildFetchRunner([new TeacherEaseSource(), new HomeworkSource()]);
    const summary = await runner.runAll(child);
    return { child, summary, hardError: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await logErr(`refresh: child ${child.id} failed ${msg}`);
    return { child, summary: null, hardError: msg };
  }
}

/** Collect every failure across the cycle, per (child, source).
 *  A `hardError` (thrown outside the runner) is attributed to the TE source so
 *  it still counts as a grade-data failure. */
function collectFailures(outcomes: readonly ScrapeOutcome[]): DigestFailure[] {
  const out: DigestFailure[] = [];
  for (const o of outcomes) {
    if (o.hardError) {
      out.push({
        childId: o.child.id,
        childName: o.child.displayName,
        source: "teacherease",
        error: o.hardError,
      });
      continue;
    }
    if (!o.summary) continue;
    for (const run of o.summary.runs) {
      if (run.status === "failed") {
        out.push({
          childId: o.child.id,
          childName: o.child.displayName,
          source: run.source,
          error: run.errorMessage ?? "Scrape failed",
        });
      }
    }
  }
  return out;
}

/** User-visible banner — only surfaces TE failures ("your grade data is
 *  stale"). The digest carries every source's failures; homework-only
 *  failures are quieter by design. */
function summarizeFailures(failures: readonly DigestFailure[]): string | null {
  const teFailures = failures.filter((f) => f.source === "teacherease");
  if (teFailures.length === 0) return null;
  const first = teFailures[0];
  if (!first) return null;
  if (teFailures.length === 1) return `${first.childName}: ${first.error}`;
  return `${teFailures.length} children failed. First: ${first.childName} — ${first.error}`;
}

export function Dashboard() {
  const { selectedChildId: childId, setSelectedChildId } = useSelectedChild();
  const [allChildren, setAllChildren] = useState<ChildRecord[]>([]);
  const [lastFetchRun, setLastFetchRun] = useState<FetchRunRecord | null>(null);
  const [classDetails, setClassDetails] = useState<ClassDetails[]>([]);
  const [attentionCfg, setAttentionCfg] = useState<AttentionConfig>(DEFAULT_ATTENTION_CONFIG);
  const [homeworkForToday, setHomeworkForToday] = useState<HomeworkRecord[]>([]);
  const [homeworkDueToday, setHomeworkDueToday] = useState<HomeworkRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Family-wide status for the hero
  const [heroStatuses, setHeroStatuses] = useState<ChildStatus[]>([]);

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
      const [cd, cfg] = await Promise.all([getAllClassDetails(teRun.id), getAttentionConfig()]);
      setClassDetails(cd);
      setAttentionCfg(cfg);
    } else {
      // Freshly-added child has no successful teacherease scrape yet —
      // clear any stale data carried over from the previously-selected
      // child so Today renders the empty "click Refresh" state.
      setClassDetails([]);
    }
    // Homework: strict today-match (Q28). Split one query into the two
    // Today-tab sections client-side. Entries can appear in both (posted
    // today AND due today — two angles on the same row).
    const today = toLocalIso(new Date());
    const rows = await getHomeworkForDay(cId, today);
    setHomeworkForToday(rows.filter((r) => r.hwDate === today));
    setHomeworkDueToday(rows.filter((r) => r.dueDate === today));
  }, []);

  // Load hero statuses for ALL children and, as a byproduct, the per-child
  // class-details + hero-counts maps used by the refresh-digest builder.
  // Per Q25 (AT4) the hero's attention count + class-name list come from
  // our engine, not TeacherEase's `needsAttention` column. `meetingCount` /
  // `notAssessedCount` stay on the portal's `status` field — they're the
  // orthogonal "meeting" dimension.
  const loadHeroStatuses = useCallback(async (children: ChildRecord[]) => {
    const cfg = await getAttentionConfig();
    const todayIso = toLocalIso(new Date());
    const statuses: ChildStatus[] = [];
    const perChildDetails = new Map<number, ClassDetails[]>();
    const perChildHeroCounts = new Map<number, ChildHeroCounts>();
    for (const child of children) {
      // Homework counts come from the child's DB rows regardless of TE status
      // — they're a separate source. Used by both the StatusHero block and
      // the refresh-digest family hero.
      const homeworkConfigured = Boolean(child.homeworkUrl);
      const hwRows = homeworkConfigured ? await getHomeworkForDay(child.id, todayIso) : [];
      const homeworkForTodayCount = hwRows.filter((r) => r.hwDate === todayIso).length;
      const homeworkDueTodayCount = hwRows.filter((r) => r.dueDate === todayIso).length;

      const run = await getLatestSuccessfulFetchRun(child.id, "teacherease");
      if (!run) {
        statuses.push({
          childId: child.id,
          name: child.displayName,
          meetingCount: 0,
          attentionCount: 0,
          notAssessedCount: 0,
          attentionClassNames: [],
          homeworkConfigured,
          homeworkForTodayCount,
          homeworkDueTodayCount,
        });
        perChildDetails.set(child.id, []);
        perChildHeroCounts.set(child.id, { meetingCount: 0, notAssessedCount: 0 });
        continue;
      }
      const [g, cd] = await Promise.all([getGradesForFetchRun(run.id), getAllClassDetails(run.id)]);
      const engine = computeChildAttention(cd, new Date(), cfg);
      const attnClasses = engine.perClass
        .filter((c) => c.classFlag.status === "attention")
        .map((c) => c.className);
      // Partition per Classes tab — attention preempts meeting/not_assessed so
      // each class lands in exactly one hero bucket (matches the tab's
      // StatusIndicator rule where the "Needs Attention" badge wins).
      const attnSet = new Set(attnClasses);
      const meetingCount = g.filter(
        (gr) => gr.status === "meeting" && !attnSet.has(gr.className),
      ).length;
      const notAssessedCount = g.filter(
        (gr) => gr.status === "not_assessed" && !attnSet.has(gr.className),
      ).length;
      statuses.push({
        childId: child.id,
        name: child.displayName,
        meetingCount,
        attentionCount: attnClasses.length,
        notAssessedCount,
        attentionClassNames: attnClasses,
        homeworkConfigured,
        homeworkForTodayCount,
        homeworkDueTodayCount,
      });
      perChildDetails.set(child.id, cd);
      perChildHeroCounts.set(child.id, { meetingCount, notAssessedCount });
    }
    setHeroStatuses(statuses);
    return { statuses, perChildDetails, perChildHeroCounts };
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
      // the others — each child's fetch_run row captures its own status.
      const outcomes: ScrapeOutcome[] = [];
      for (const child of children) outcomes.push(await scrapeOneChild(child));

      const failures = collectFailures(outcomes);
      setError(summarizeFailures(failures));

      if (childId != null) await loadData(childId);
      const hero = await loadHeroStatuses(children);

      // Build + dispatch the post-loop refresh digest (Q27 / Q28). Homework
      // is strict today-match with two lists per child — "for today"
      // (hwDate === today) and "due today" (dueDate === today). Router
      // fanout respects per-channel toggles (notify.refreshDigest.os / .email).
      const now = new Date();
      const todayIso = toLocalIso(now);
      const perChildHomeworkForToday = new Map<number, HomeworkRecord[]>();
      const perChildHomeworkDueToday = new Map<number, HomeworkRecord[]>();
      for (const c of children) {
        const rows = await getHomeworkForDay(c.id, todayIso);
        perChildHomeworkForToday.set(
          c.id,
          rows.filter((r) => r.hwDate === todayIso),
        );
        perChildHomeworkDueToday.set(
          c.id,
          rows.filter((r) => r.dueDate === todayIso),
        );
      }
      const cfg = await getAttentionConfig();
      const digest = buildRefreshDigest({
        children,
        perChildDetails: hero.perChildDetails,
        perChildHomeworkForToday,
        perChildHomeworkDueToday,
        perChildHeroCounts: hero.perChildHeroCounts,
        failures,
        cfg,
        now,
      });
      await buildNotifyRouter().dispatch(digest);

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

        {allChildren.find((c) => c.id === childId)?.homeworkUrl && (
          <HomeworkTodaySections forToday={homeworkForToday} dueToday={homeworkDueToday} />
        )}

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
