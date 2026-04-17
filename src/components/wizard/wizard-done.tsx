"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { buildFetchRunner } from "@/lib/fetch/default";
import { HomeworkSource } from "@/lib/fetch/homework-source";
import { TeacherEaseSource } from "@/lib/fetch/teacherease-source";
import { getGradesForFetchRun, log, logErr } from "@/lib/ipc";
import type { ChildRecord } from "@/lib/scraper/types";

interface WizardDoneProps {
  child: ChildRecord;
  onFinish: () => void;
}

export function WizardDone({ child, onFinish }: WizardDoneProps) {
  const [status, setStatus] = useState<"scraping" | "done" | "error">("scraping");
  const [summary, setSummary] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function runFirstScrape() {
      await log(`wizard: first scrape started childId=${child.id}`);
      try {
        const runner = buildFetchRunner([new TeacherEaseSource(), new HomeworkSource()]);
        const summary = await runner.runAll(child);
        const teRun = summary.runs.find((r) => r.source === "teacherease");

        if (cancelled) return;

        if (!teRun || teRun.status !== "success") {
          throw new Error(teRun?.errorMessage ?? "First scrape failed");
        }

        const grades = await getGradesForFetchRun(teRun.fetchRunId);
        const meeting = grades.filter((g) => !g.needsAttention).length;
        const attention = grades.filter((g) => g.needsAttention).length;

        setSummary(
          `${grades.length} classes — ${meeting} meeting expectations${attention > 0 ? `, ${attention} need attention` : ""}`,
        );
        await log(`wizard: first scrape complete childId=${child.id} classes=${grades.length}`);
        setStatus("done");
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Something went wrong";
        await logErr(`wizard: first scrape failed childId=${child.id} err=${msg}`);
        setError(msg);
        setStatus("error");
      }
    }

    void runFirstScrape();
    return () => {
      cancelled = true;
    };
  }, [child]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-8 py-12 text-center">
      {status === "scraping" && (
        <>
          <div className="rounded-2xl bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <Loader2 className="h-9 w-9 animate-spin text-primary" strokeWidth={1.5} />
          </div>
          <div className="space-y-2">
            <h2
              className="text-[22px] font-medium tracking-tight"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Checking grades...
            </h2>
            <p className="text-[14px] text-muted-foreground">
              Running your first check. This takes a few seconds.
            </p>
          </div>
        </>
      )}

      {status === "done" && (
        <>
          <div className="rounded-2xl bg-meeting/10 p-5">
            <CheckCircle2 className="h-9 w-9 text-meeting" strokeWidth={1.5} />
          </div>
          <div className="space-y-2">
            <h2
              className="text-[22px] font-medium tracking-tight"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              All set!
            </h2>
            <p className="text-[14px] text-muted-foreground">{summary}</p>
          </div>
          <Button size="lg" className="rounded-xl px-8" onClick={onFinish}>
            Open dashboard
          </Button>
        </>
      )}

      {status === "error" && (
        <>
          <div className="space-y-3">
            <h2
              className="text-[22px] font-medium tracking-tight"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Couldn&apos;t finish the check
            </h2>
            <p className="text-[14px] text-muted-foreground">{error}</p>
            <p className="text-[12px] text-muted-foreground">
              Open the dashboard and tap Refresh to try again.
            </p>
          </div>
          <Button size="lg" className="rounded-xl px-8" onClick={onFinish}>
            Open dashboard
          </Button>
        </>
      )}
    </div>
  );
}
