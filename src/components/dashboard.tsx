"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChildSwitcher } from "@/components/child-switcher";
import { EmptyState } from "@/components/empty-state";
import { GradesTable } from "@/components/grades-table";
import { Header } from "@/components/header";
import { NeedsAttention } from "@/components/needs-attention";
import { StandardsTree } from "@/components/standards-tree";
import type { AssignmentRecord, GradeRecord, ScrapeRecord, StatusHistoryEntry } from "@/lib/ipc";
import {
  getAllStatusHistory,
  getChildPassword,
  getChildren,
  getClassDetail,
  getGradesForScrape,
  getLatestScrape,
  getMissingAssignments,
  getNeedsAttentionGrades,
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

export function Dashboard() {
  const router = useRouter();
  const [allChildren, setAllChildren] = useState<ChildRecord[]>([]);
  const [childId, setChildId] = useState<number | null>(null);
  const [lastScrape, setLastScrape] = useState<ScrapeRecord | null>(null);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [missing, setMissing] = useState<AssignmentRecord[]>([]);
  const [statusHistory, setStatusHistory] =
    useState<Map<string, StatusHistoryEntry[]>>(EMPTY_HISTORY);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [detailCache, setDetailCache] =
    useState<Map<string, ClassDetails | null>>(EMPTY_DETAIL_CACHE);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (cId: number) => {
    const scrape = await getLatestScrape(cId);
    setLastScrape(scrape);
    if (scrape) {
      const [g, m, h] = await Promise.all([
        getGradesForScrape(scrape.id),
        getMissingAssignments(scrape.id),
        getAllStatusHistory(cId),
      ]);
      setGrades(g);
      setMissing(m);
      setStatusHistory(h);
    }
  }, []);

  useEffect(() => {
    void initLogging().catch(() => undefined);
    void setupAutostart().catch(() => undefined);

    void getChildren()
      .then(async (children) => {
        await log(`dashboard: found ${children.length} children`);
        setAllChildren(children);
        const first = children[0];
        if (first) {
          setChildId(first.id);
          return loadData(first.id).then(() => {
            // Auto-refresh if last scrape was >6h ago (Q2)
            return getLatestScrape(first.id).then((scrape) => {
              if (!scrape) return;
              const ageMs = Date.now() - new Date(scrape.runAt).getTime();
              const sixHours = 6 * 60 * 60 * 1000;
              if (ageMs > sixHours) {
                // Will be set after state update, trigger via ref
              }
            });
          });
        }
      })
      .catch(() => undefined);
  }, [loadData]);

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
      for (const cls of overview.classes.filter((c) => c.needsAttention)) {
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

      // Send OS notification if there are attention items (T27)
      const attentionGrades = await getNeedsAttentionGrades(scrapeId);
      const missingAsns = await getMissingAssignments(scrapeId);
      if (attentionGrades.length > 0 || missingAsns.length > 0) {
        const childList = await getChildren();
        const childName = childList.find((c) => c.id === childId)?.displayName ?? "Your child";
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
  }, [childId, loadData]);

  const handleChildSwitch = useCallback(
    (newChildId: number) => {
      void log(`dashboard: switched to childId=${newChildId}`);
      setChildId(newChildId);
      setGrades([]);
      setMissing([]);
      setStatusHistory(EMPTY_HISTORY);
      setExpandedClass(null);
      setDetailCache(EMPTY_DETAIL_CACHE);
      setLastScrape(null);
      void loadData(newChildId);
    },
    [loadData],
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

  if (childId === null) {
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
      >
        <ChildSwitcher items={allChildren} selectedId={childId} onSelect={handleChildSwitch} />
      </Header>
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-5 py-5">
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] text-destructive">
            {error}
          </div>
        )}
        <GradesTable
          grades={grades}
          history={statusHistory}
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
        <NeedsAttention missingAssignments={missing} />
      </main>
    </div>
  );
}
