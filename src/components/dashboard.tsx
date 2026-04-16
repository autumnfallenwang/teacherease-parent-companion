"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChildSwitcher } from "@/components/child-switcher";
import { EmptyState } from "@/components/empty-state";
import { GradesTable } from "@/components/grades-table";
import { Header } from "@/components/header";
import { NeedsAttention } from "@/components/needs-attention";
import type { AssignmentRecord, GradeRecord, ScrapeRecord } from "@/lib/ipc";
import {
  getChildPassword,
  getChildren,
  getGradesForScrape,
  getLatestScrape,
  getMissingAssignments,
  getNeedsAttentionGrades,
  notifyNeedsAttention,
  persistScrape,
  setupAutostart,
} from "@/lib/ipc";
import { parseClassDetails, parseGradesOverview } from "@/lib/scraper/parser";
import { login } from "@/lib/scraper/teacherease";
import type { ChildRecord, ClassDetails } from "@/lib/scraper/types";

export function Dashboard() {
  const router = useRouter();
  const [allChildren, setAllChildren] = useState<ChildRecord[]>([]);
  const [childId, setChildId] = useState<number | null>(null);
  const [lastScrape, setLastScrape] = useState<ScrapeRecord | null>(null);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [missing, setMissing] = useState<AssignmentRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (cId: number) => {
    const scrape = await getLatestScrape(cId);
    setLastScrape(scrape);
    if (scrape) {
      setGrades(await getGradesForScrape(scrape.id));
      setMissing(await getMissingAssignments(scrape.id));
    }
  }, []);

  useEffect(() => {
    void setupAutostart().catch(() => undefined);

    void getChildren()
      .then((children) => {
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
        headers: { Cookie: session.cookieHeader },
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
          headers: { Cookie: session.cookieHeader },
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

      await loadData(childId);

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
      setChildId(newChildId);
      setGrades([]);
      setMissing([]);
      setLastScrape(null);
      void loadData(newChildId);
    },
    [loadData],
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
      <main className="flex-1 space-y-6 p-6">
        {error && (
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
        )}
        <GradesTable grades={grades} />
        <NeedsAttention missingAssignments={missing} />
      </main>
    </div>
  );
}
