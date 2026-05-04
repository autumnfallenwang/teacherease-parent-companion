// One-shot fetch cycle across all children. Used by:
//   - Scheduler fetch tick (Phase 19 CF3)
//   - Settings → Fetch "Fetch now" button
//   - Tray "Refresh Now" menu item
//   - runNotifyCycle (Q35 — notify action fetches before dispatch)
// This function itself fires NO digest — schedulers stay decoupled at the
// code level (Q29). The notify path coordinates fetch-then-dispatch
// externally. Dispatches CHILD_DATA_REFRESHED_EVENT on completion so
// listeners (dashboard sidebar) can reload.

import { CHILD_DATA_REFRESHED_EVENT } from "@/components/shell/sidebar-child-selector";
import { buildFetchRunner } from "@/lib/fetch/default";
import { HomeworkSource } from "@/lib/fetch/homework-source";
import { TeacherEaseSource } from "@/lib/fetch/teacherease-source";
import { log, logErr } from "@/lib/ipc";
import type { ChildRecord } from "@/lib/scraper/types";

let running = false;

export async function runFetchCycle(children: readonly ChildRecord[]): Promise<void> {
  if (running) {
    await log("fetch-cycle: skipped (another cycle is in flight)");
    return;
  }
  if (children.length === 0) return;
  running = true;
  try {
    await log(`fetch-cycle: started children=${children.length}`);
    const runner = buildFetchRunner([new TeacherEaseSource(), new HomeworkSource()]);
    for (const child of children) {
      try {
        await runner.runAll(child);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        await logErr(`fetch-cycle: child ${child.id} failed — ${msg}`);
      }
    }
    window.dispatchEvent(new CustomEvent(CHILD_DATA_REFRESHED_EVENT));
    await log("fetch-cycle: complete");
  } finally {
    running = false;
  }
}

export function isFetchCycleRunning(): boolean {
  return running;
}
