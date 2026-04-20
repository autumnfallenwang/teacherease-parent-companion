// Per-child hero data loader. Shared by the Today-tab StatusHero render
// and the refresh-digest builder (scheduler + "Send digest now" button).
// Queries: getLatestSuccessfulFetchRun, getGradesForFetchRun,
// getAllClassDetails, getHomeworkForDay. Pure per-child aggregation logic
// around those IPC calls — caller owns `now` + `cfg` for testability.

import { type AttentionConfig, computeChildAttention } from "@/lib/core/attention-engine";
import {
  getAllClassDetails,
  getGradesForFetchRun,
  getHomeworkForDay,
  getLatestSuccessfulFetchRun,
} from "@/lib/ipc";
import type { ChildHeroCounts } from "@/lib/notify/digest";
import { toLocalIso } from "@/lib/notify/digest";
import type { ChildRecord, ClassDetails } from "@/lib/scraper/types";

export interface ChildStatus {
  childId: number;
  name: string;
  meetingCount: number;
  attentionCount: number;
  notAssessedCount: number;
  attentionClassNames: string[];
  /** True when the child has a `homeworkUrl` saved. Hero row skips the
   *  homework count lines entirely when false — absent ≠ empty (Q28). */
  homeworkConfigured: boolean;
  homeworkForTodayCount: number;
  homeworkDueTodayCount: number;
}

export interface HeroLoadResult {
  readonly statuses: ChildStatus[];
  readonly perChildDetails: Map<number, ClassDetails[]>;
  readonly perChildHeroCounts: Map<number, ChildHeroCounts>;
}

export async function loadHeroStatuses(
  children: readonly ChildRecord[],
  cfg: AttentionConfig,
  now: Date,
): Promise<HeroLoadResult> {
  const todayIso = toLocalIso(now);
  const statuses: ChildStatus[] = [];
  const perChildDetails = new Map<number, ClassDetails[]>();
  const perChildHeroCounts = new Map<number, ChildHeroCounts>();

  for (const child of children) {
    // Homework counts come from DB regardless of TE status — separate source.
    const homeworkConfigured = Boolean(child.homeworkUrl);
    const hwRows = homeworkConfigured ? await getHomeworkForDay(child.id, todayIso) : [];
    const homeworkForTodayCount = hwRows.filter((r) => r.hwDate === todayIso).length;
    const homeworkDueTodayCount = hwRows.filter((r) => r.dueDate === todayIso).length;

    const run = await getLatestSuccessfulFetchRun(child.id, "teacherease");
    if (!run) {
      statuses.push({
        childId: child.id,
        name: child.displayName,
        meetingCount: 0,
        attentionCount: 0,
        notAssessedCount: 0,
        attentionClassNames: [],
        homeworkConfigured,
        homeworkForTodayCount,
        homeworkDueTodayCount,
      });
      perChildDetails.set(child.id, []);
      perChildHeroCounts.set(child.id, { meetingCount: 0, notAssessedCount: 0 });
      continue;
    }

    const [g, cd] = await Promise.all([getGradesForFetchRun(run.id), getAllClassDetails(run.id)]);
    const engine = computeChildAttention(cd, now, cfg);
    const attnClasses = engine.perClass
      .filter((c) => c.classFlag.status === "attention")
      .map((c) => c.className);
    const attnSet = new Set(attnClasses);
    // Attention preempts meeting/not_assessed so each class lands in exactly
    // one hero bucket (matches Classes-tab StatusIndicator partition rule).
    const meetingCount = g.filter(
      (gr) => gr.status === "meeting" && !attnSet.has(gr.className),
    ).length;
    const notAssessedCount = g.filter(
      (gr) => gr.status === "not_assessed" && !attnSet.has(gr.className),
    ).length;

    statuses.push({
      childId: child.id,
      name: child.displayName,
      meetingCount,
      attentionCount: attnClasses.length,
      notAssessedCount,
      attentionClassNames: attnClasses,
      homeworkConfigured,
      homeworkForTodayCount,
      homeworkDueTodayCount,
    });
    perChildDetails.set(child.id, cd);
    perChildHeroCounts.set(child.id, { meetingCount, notAssessedCount });
  }

  return { statuses, perChildDetails, perChildHeroCounts };
}
