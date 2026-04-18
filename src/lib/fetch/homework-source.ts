// Homework FetchSource (P5 / Q20). Wraps fetch + parseHomework + persistHomework
// and fires a "new homework day" notification when the newest hw_date advances.
// Runner owns the `fetch_runs` row lifecycle; `homework` rows are keyed by
// (child_id, hw_date, subject) — no fetch_run_id FK by design.

import { getHomeworkForDate, getMaxHomeworkDate, persistHomework, tauriFetch } from "@/lib/ipc";
import { parseHomework } from "@/lib/scraper/homework-parser";
import { USER_AGENT } from "@/lib/scraper/teacherease";
import type { ChildRecord } from "@/lib/scraper/types";
import type { FetchContext, FetchSource } from "./types";

export class HomeworkSource implements FetchSource {
  readonly name = "homework";

  isApplicable(child: ChildRecord): boolean {
    return Boolean(child.homeworkUrl);
  }

  async run(ctx: FetchContext): Promise<void> {
    const url = ctx.child.homeworkUrl;
    if (!url) throw new Error("homework url not set");

    const prevMaxDate = await getMaxHomeworkDate(ctx.childId);
    const res = await tauriFetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`Homework fetch failed: HTTP ${res.status}`);
    const entries = parseHomework(await res.text());
    await persistHomework(ctx.childId, entries);

    const newMaxDate = await getMaxHomeworkDate(ctx.childId);
    if (newMaxDate && (!prevMaxDate || newMaxDate > prevMaxDate)) {
      const newRows = await getHomeworkForDate(ctx.childId, newMaxDate);
      if (newRows.length > 0) {
        await ctx.notify.dispatch({
          type: "newHomework",
          childName: ctx.child.displayName,
          isoDate: newMaxDate,
          subjectCount: newRows.length,
        });
      }
    }
  }
}
