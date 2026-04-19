// Homework FetchSource (P5 / Q20 / Q27). Wraps fetch + parseHomework +
// persistHomework. Runner owns the `fetch_runs` row lifecycle; `homework`
// rows are keyed by (child_id, hw_date, subject) — no fetch_run_id FK by
// design. Notifications live in the dashboard's post-loop digest build.

import { persistHomework, tauriFetch } from "@/lib/ipc";
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

    const res = await tauriFetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`Homework fetch failed: HTTP ${res.status}`);
    const entries = parseHomework(await res.text());
    await persistHomework(ctx.childId, entries);
  }
}
