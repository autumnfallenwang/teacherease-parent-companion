"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AttentionSection } from "@/components/attention-section";
import { ChildTabs } from "@/components/child-tabs";
import { EmptyState } from "@/components/empty-state";
import { GradesTable } from "@/components/grades-table";
import { Header } from "@/components/header";
import { RecentActivity } from "@/components/recent-activity";
import { StandardsTree } from "@/components/standards-tree";
import type { ChildStatus } from "@/components/status-hero";
import { StatusHero } from "@/components/status-hero";
import { computeRecentActivity } from "@/lib/core/activity";
import type { AssignmentRecord, GradeRecord, ScrapeRecord, StatusHistoryEntry } from "@/lib/ipc";
import {
  getAllStatusHistory,
  getAssignmentsForScrape,
  getChildPassword,
  getChildren,
  getClassDetail,
  getClasses,
  getGradesForScrape,
  getLatestScrape,
  getMissingAssignments,
  getNeedsAttentionGrades,
  getScrapeBefore,
  initLogging,
  log,
  logErr,
  notifyNeedsAttention,
  persistScrape,
  setupAutostart,
} from "@/lib/ipc";
import { parseClassDetails, parseGradesOverview } from "@/lib/scraper/parser";
import { login, USER_AGENT } from "@/lib/scraper/teacherease";
import type { ChildRecord, ClassDetails } from "@/lib/scraper/types";

const EMPTY_HISTORY = new Map<string, StatusHistoryEntry[]>();
const EMPTY_DETAIL_CACHE = new Map<string, ClassDetails | null>();
const EMPTY_INSTRUCTORS = new Map<number, string>();

export function Dashboard() {
  const router = useRouter();
  const [allChildren, setAllChildren] = useState<ChildRecord[]>([]);
  const [childId, setChildId] = useState<number | null>(null);
  const [lastScrape, setLastScrape] = useState<ScrapeRecord | null>(null);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [missing, setMissing] = useState<AssignmentRecord[]>([]);
  const [allAssignments, setAllAssignments] = useState<AssignmentRecord[]>([]);
  const [prevGrades, setPrevGrades] = useState<GradeRecord[] | null>(null);
  const [prevAssignments, setPrevAssignments] = useState<AssignmentRecord[] | null>(null);
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

  const activities = useMemo(
    () => computeRecentActivity(grades, allAssignments, prevGrades, prevAssignments),
    [grades, allAssignments, prevGrades, prevAssignments],
  );

  const loadData = useCallback(async (cId: number) => {
    const scrape = await getLatestScrape(cId);
    setLastScrape(scrape);
    if (scrape) {
      const [g, m, h, a] = await Promise.all([
        getGradesForScrape(scrape.id),
        getMissingAssignments(scrape.id),
        getAllStatusHistory(cId),
        getAssignmentsForScrape(scrape.id),
      ]);
      setGrades(g);
      setMissing(m);
      setStatusHistory(h);
      setAllAssignments(a);

      // Load the prior successful scrape for Recent Activity diffing
      const prev = await getScrapeBefore(cId, scrape.runAt);
      if (prev) {
        const [pg, pa] = await Promise.all([
          getGradesForScrape(prev.id),
          getAssignmentsForScrape(prev.id),
        ]);
        setPrevGrades(pg);
        setPrevAssignments(pa);
      } else {
        setPrevGrades(null);
        setPrevAssignments(null);
      }
    } else {
      setPrevGrades(null);
      setPrevAssignments(null);
    }

    // Load instructor map from classes table
    const classes = await getClasses(cId);
    const instrMap = new Map<number, string>();
    for (const cls of classes) {
      if (cls.instructor) instrMap.set(cls.id, cls.instructor);
    }
    setInstructors(instrMap);
  }, []);

  // Load hero statuses for ALL children
  const loadHeroStatuses = useCallback(async (children: ChildRecord[]) => {
    const statuses: ChildStatus[] = [];
    for (const child of children) {
      const scrape = await getLatestScrape(child.id);
      if (!scrape) {
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
      const g = await getGradesForScrape(scrape.id);
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
    await log(`scrape: started childId=${childId}`);
    setIsRefreshing(true);
    setError(null);
    const start = Date.now();

    try {
      const children = await getChildren();
      const child = children.find((c) => c.id === childId);
      if (!child) throw new Error("Child not found");

      const password = await getChildPassword(childId);
      if (!password) throw new Error("No stored password — re-add this child");

      const session = await login(child.baseUrl, {
        username: child.username,
        password,
      });

      // biome-ignore lint/security/noSecrets: URL path, not a secret
      const gradesPath = "/App/Parents/StandardGrade/GradeViewAllWithProgress";
      const gradesUrl = new URL(gradesPath, session.baseUrl).toString();
      const gradesRes = await fetch(gradesUrl, {
        headers: { Cookie: session.cookieHeader, "User-Agent": USER_AGENT },
      });
      const gradesHtml = await gradesRes.text();
      const overview = parseGradesOverview(gradesHtml);

      const classDetails: ClassDetails[] = [];
      for (const cls of overview.classes) {
        const detailUrl = new URL(
          `/common/StudentProgressStandardsDetails.aspx?ClassID=${cls.classId}&CGPID=${cls.cgpId}`,
          session.baseUrl,
        ).toString();
        const detailRes = await fetch(detailUrl, {
          headers: { Cookie: session.cookieHeader, "User-Agent": USER_AGENT },
        });
        const detail = parseClassDetails(await detailRes.text(), cls.name);
        classDetails.push(detail);
      }

      const scrapeId = await persistScrape({
        childId,
        status: "success",
        durationMs: Date.now() - start,
        overview,
        classDetails,
        rawPayload: JSON.stringify({ overview, classDetails }),
      });

      await log(
        `scrape: complete childId=${childId} duration=${Date.now() - start}ms classes=${overview.classes.length} details=${classDetails.length}`,
      );
      await loadData(childId);
      setDetailCache(EMPTY_DETAIL_CACHE);

      // Refresh hero statuses
      await loadHeroStatuses(children);

      // Send OS notification if there are attention items (T27)
      const attentionGrades = await getNeedsAttentionGrades(scrapeId);
      const missingAsns = await getMissingAssignments(scrapeId);
      if (attentionGrades.length > 0 || missingAsns.length > 0) {
        const childName = children.find((c) => c.id === childId)?.displayName ?? "Your child";
        await notifyNeedsAttention(childName, attentionGrades.length, missingAsns.length);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      await logErr(`scrape failed: ${msg}`);
      setError(msg);
      await persistScrape({
        childId,
        status: "failed",
        durationMs: Date.now() - start,
        errorMessage: msg,
      }).catch(() => undefined);
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
      setPrevGrades(null);
      setPrevAssignments(null);
      setStatusHistory(EMPTY_HISTORY);
      setInstructors(EMPTY_INSTRUCTORS);
      setExpandedClass(null);
      setDetailCache(EMPTY_DETAIL_CACHE);
      setLastScrape(null);
      void loadData(newChildId);
    },
    [childId, loadData],
  );

  const handleClassClick = useCallback(
    (className: string) => {
      setExpandedClass((prev) => {
        const next = prev === className ? null : className;
        if (next && !detailCache.has(next) && lastScrape) {
          setDetailLoading(true);
          void getClassDetail(lastScrape.id, next)
            .then((detail) => {
              setDetailCache((cache) => new Map(cache).set(next, detail));
            })
            .catch(() => undefined)
            .finally(() => setDetailLoading(false));
        }
        return next;
      });
    },
    [detailCache, lastScrape],
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
        lastRunAt={lastScrape?.runAt ?? null}
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

        {/* Layer 2: Recent Activity (time-based diff vs prior scrape) */}
        <RecentActivity activities={activities} />

        {/* Layer 3: Missing Work (if any) */}
        <AttentionSection missingAssignments={missing} allAssignments={allAssignments} />

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
