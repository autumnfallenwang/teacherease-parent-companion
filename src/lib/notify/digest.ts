// Pure refresh-digest aggregator (Q27 / Q28). No Tauri, no IPC, no Date.now().
// Composes precomputed inputs (class details, hw/due-today homework, hero
// counts) into the single RefreshDigest event that NotifyRouter dispatches.

import {
  type AttentionConfig,
  type AttentionItem,
  computeChildAttention,
  sortItemsMissingFirst,
} from "@/lib/core/attention-engine";
import type { HomeworkRecord } from "@/lib/ipc";
import type { ChildRecord, ClassDetails } from "@/lib/scraper/types";
import type {
  ChildDigest,
  ChildDigestHero,
  DigestFailure,
  FamilyHero,
  RefreshDigest,
} from "./types";

export interface ChildHeroCounts {
  readonly meetingCount: number;
  readonly notAssessedCount: number;
}

export interface BuildRefreshDigestInput {
  readonly children: readonly ChildRecord[];
  readonly perChildDetails: ReadonlyMap<number, readonly ClassDetails[]>;
  /** Rows where `hwDate === todayLocal` — "Homework for today". */
  readonly perChildHomeworkForToday: ReadonlyMap<number, readonly HomeworkRecord[]>;
  /** Rows where `dueDate === todayLocal` — "Homework due today". */
  readonly perChildHomeworkDueToday: ReadonlyMap<number, readonly HomeworkRecord[]>;
  readonly perChildHeroCounts: ReadonlyMap<number, ChildHeroCounts>;
  readonly failures: readonly DigestFailure[];
  readonly cfg: AttentionConfig;
  readonly now: Date;
}

/** Local-timezone ISO date (YYYY-MM-DD). Never .toISOString() — that's UTC. */
export function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + n);
  return out;
}

export function buildRefreshDigest(input: BuildRefreshDigestInput): RefreshDigest {
  const {
    children,
    perChildDetails,
    perChildHomeworkForToday,
    perChildHomeworkDueToday,
    perChildHeroCounts,
    failures,
    cfg,
    now,
  } = input;

  const todayLocal = toLocalIso(now);

  // Every child gets a populated hero from DB data — mirrors StatusHero's
  // Today-tab behavior where a never-scraped child just shows zeros and a
  // previously-scraped child shows their last-known state. This cycle's
  // scrape-success-vs-failure doesn't affect what we render (D-18).
  const childDigests: ChildDigest[] = children.map((child) => {
    const homeworkConfigured = Boolean(child.homeworkUrl);
    const homeworkForToday = [...(perChildHomeworkForToday.get(child.id) ?? [])];
    const homeworkDueToday = [...(perChildHomeworkDueToday.get(child.id) ?? [])];
    const details = perChildDetails.get(child.id) ?? [];
    const eng = computeChildAttention(details, now, cfg);
    const attentionClassNames = eng.perClass
      .filter((c) => c.classFlag.status === "attention")
      .map((c) => c.className);
    const counts = perChildHeroCounts.get(child.id) ?? { meetingCount: 0, notAssessedCount: 0 };

    const hero: ChildDigestHero = {
      attentionCount: attentionClassNames.length,
      attentionClassNames,
      meetingCount: counts.meetingCount,
      notAssessedCount: counts.notAssessedCount,
    };

    const attention: AttentionItem[] = sortItemsMissingFirst(eng.withinWindow);

    return {
      childId: child.id,
      childName: child.displayName,
      hero,
      attention,
      homeworkConfigured,
      homeworkForToday,
      homeworkDueToday,
    };
  });

  return {
    type: "refreshDigest",
    generatedAt: now.getTime(),
    todayLocal,
    family: rollUpFamily(childDigests),
    children: childDigests,
    failures,
  };
}

function rollUpFamily(children: readonly ChildDigest[]): FamilyHero {
  let attentionCount = 0;
  let meetingCount = 0;
  let notAssessedCount = 0;
  let homeworkForTodayCount = 0;
  let homeworkDueTodayCount = 0;
  for (const c of children) {
    attentionCount += c.hero.attentionCount;
    meetingCount += c.hero.meetingCount;
    notAssessedCount += c.hero.notAssessedCount;
    homeworkForTodayCount += c.homeworkForToday.length;
    homeworkDueTodayCount += c.homeworkDueToday.length;
  }
  return {
    childCount: children.length,
    attentionCount,
    meetingCount,
    notAssessedCount,
    homeworkForTodayCount,
    homeworkDueTodayCount,
  };
}
