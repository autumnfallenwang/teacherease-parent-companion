"use client";

import { CheckCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getChildPassword, getGradesForScrape, getLatestScrape, persistScrape } from "@/lib/ipc";
import { parseClassDetails, parseGradesOverview } from "@/lib/scraper/parser";
import { login } from "@/lib/scraper/teacherease";
import type { ChildRecord, ClassDetails } from "@/lib/scraper/types";

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

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: linear async pipeline, not genuinely complex
    async function runFirstScrape() {
      const start = Date.now();
      try {
        const password = await getChildPassword(child.id);
        if (!password) throw new Error("No stored password");

        const session = await login(child.baseUrl, { username: child.username, password });

        // biome-ignore lint/security/noSecrets: URL path, not a secret
        const gradesPath = "/App/Parents/StandardGrade/GradeViewAllWithProgress";
        const gradesUrl = new URL(gradesPath, session.baseUrl).toString();
        const gradesRes = await fetch(gradesUrl, { headers: { Cookie: session.cookieHeader } });
        const overview = parseGradesOverview(await gradesRes.text());

        const classDetails: ClassDetails[] = [];
        for (const cls of overview.classes.filter((c) => c.needsAttention)) {
          const url = new URL(
            `/common/StudentProgressStandardsDetails.aspx?ClassID=${cls.classId}&CGPID=${cls.cgpId}`,
            session.baseUrl,
          ).toString();
          const res = await fetch(url, { headers: { Cookie: session.cookieHeader } });
          classDetails.push(parseClassDetails(await res.text(), cls.name));
        }

        const scrapeId = await persistScrape({
          childId: child.id,
          status: "success",
          durationMs: Date.now() - start,
          overview,
          classDetails,
          rawPayload: JSON.stringify({ overview, classDetails }),
        });

        if (cancelled) return;

        const scrape = await getLatestScrape(child.id);
        const grades = scrape ? await getGradesForScrape(scrapeId) : [];
        const meeting = grades.filter((g) => !g.needsAttention).length;
        const attention = grades.filter((g) => g.needsAttention).length;

        setSummary(
          `${overview.classes.length} classes — ${meeting} meeting expectations${attention > 0 ? `, ${attention} need attention` : ""}`,
        );
        setStatus("done");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Something went wrong");
        setStatus("error");
      }
    }

    void runFirstScrape();
    return () => {
      cancelled = true;
    };
  }, [child]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 p-12 text-center">
      {status === "scraping" && (
        <>
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Checking grades...</h2>
            <p className="text-muted-foreground">
              Running your first check. This takes a few seconds.
            </p>
          </div>
        </>
      )}

      {status === "done" && (
        <>
          <div className="rounded-full bg-green-100 p-6">
            <CheckCircle className="h-12 w-12 text-green-600" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">All set!</h2>
            <p className="text-muted-foreground">{summary}</p>
          </div>
          <Button size="lg" onClick={onFinish}>
            Open dashboard
          </Button>
        </>
      )}

      {status === "error" && (
        <>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">
              We logged in, but couldn&apos;t finish the check
            </h2>
            <p className="text-muted-foreground">{error}</p>
            <p className="text-sm text-muted-foreground">
              Open the dashboard and tap Refresh to try again.
            </p>
          </div>
          <Button size="lg" onClick={onFinish}>
            Open dashboard
          </Button>
        </>
      )}
    </div>
  );
}
