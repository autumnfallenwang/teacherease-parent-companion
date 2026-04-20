// One-shot fetch cycle across all children. Used by:
//   - Scheduler fetch tick (Phase 19 CF3)
//   - Settings → Fetch "Fetch now" button
//   - Tray "Refresh Now" menu item
// NO digest fires — that's the whole point of Q29's decoupling. Dispatches
// CHILD_DATA_REFRESHED_EVENT on completion so listeners (dashboard sidebar)
// can reload.

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
