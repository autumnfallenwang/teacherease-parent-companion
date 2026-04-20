// Digest assembly from current DB state — no fetch is triggered. Used by:
//   - Scheduler notify tick (Phase 19 CF3)
//   - Settings → Notifications "Send digest now" button
// `failures` is always empty per Q29 + D-18 — failure info was removed from
// the digest model; stale data just silently renders. Parents opted out of
// failure noise explicitly.

import { loadHeroStatuses } from "@/lib/hero-statuses";
import type { HomeworkRecord } from "@/lib/ipc";
import { getAttentionConfig, getHomeworkForDay } from "@/lib/ipc";
import { buildRefreshDigest, toLocalIso } from "@/lib/notify/digest";
import type { RefreshDigest } from "@/lib/notify/types";
import type { ChildRecord } from "@/lib/scraper/types";

export async function buildDigestFromDb(
  children: readonly ChildRecord[],
  now: Date,
): Promise<RefreshDigest> {
  const cfg = await getAttentionConfig();
  const hero = await loadHeroStatuses(children, cfg, now);
  const todayIso = toLocalIso(now);

  const perChildHomeworkForToday = new Map<number, readonly HomeworkRecord[]>();
  const perChildHomeworkDueToday = new Map<number, readonly HomeworkRecord[]>();
  for (const c of children) {
    if (!c.homeworkUrl) continue;
    const rows = await getHomeworkForDay(c.id, todayIso);
    perChildHomeworkForToday.set(
      c.id,
      rows.filter((r) => r.hwDate === todayIso),
    );
    perChildHomeworkDueToday.set(
      c.id,
      rows.filter((r) => r.dueDate === todayIso),
    );
  }

  return buildRefreshDigest({
    children,
    perChildDetails: hero.perChildDetails,
    perChildHeroCounts: hero.perChildHeroCounts,
    perChildHomeworkForToday,
    perChildHomeworkDueToday,
    failures: [],
    cfg,
    now,
  });
}
