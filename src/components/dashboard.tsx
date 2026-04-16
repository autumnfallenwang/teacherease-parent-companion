"use client";

import { useCallback, useEffect, useState } from "react";
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
  persistScrape,
} from "@/lib/ipc";
import { parseClassDetails, parseGradesOverview } from "@/lib/scraper/parser";
import { login } from "@/lib/scraper/teacherease";
import type { ClassDetails } from "@/lib/scraper/types";

export function Dashboard() {
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
    void getChildren()
      .then((children) => {
        const first = children[0];
        if (first) {
          setChildId(first.id);
          return loadData(first.id);
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

      await persistScrape({
        childId,
        status: "success",
        durationMs: Date.now() - start,
        overview,
        classDetails,
        rawPayload: JSON.stringify({ overview, classDetails }),
      });

      await loadData(childId);
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

  if (childId === null) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header lastRunAt={null} onRefresh={() => undefined} />
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
      />
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
