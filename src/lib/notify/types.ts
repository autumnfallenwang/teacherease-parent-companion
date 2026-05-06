// Notify pipeline contract (Q21 / Q27). Pure types module — no Tauri, no IPC.
//
// One RefreshDigest event is dispatched once per refresh cycle (not per
// child per source — the old per-event union was collapsed in Q27).
// Channels render the same event at different fidelities: OS → hero-level
// summary; Email → detailed per-child breakdown.

import type { AttentionItem } from "@/lib/core/attention-engine";
import type { Locale } from "@/lib/i18n";
import type { HomeworkRecord } from "@/lib/ipc";

export interface DigestFailure {
  readonly childId: number;
  readonly childName: string;
  /** Matches FetchSource.name — "teacherease" | "homework" | future. */
  readonly source: string;
  readonly error: string;
}

export interface ChildDigestHero {
  readonly attentionCount: number;
  readonly attentionClassNames: readonly string[];
  readonly meetingCount: number;
  readonly notAssessedCount: number;
}

export interface ChildDigest {
  readonly childId: number;
  readonly childName: string;
  /** Always populated — mirrors the Today tab's StatusHero semantics.
   *  Values come from the latest SUCCESSFUL teacherease fetch (zeros when
   *  the child has never been scraped). Whether this cycle's scrape
   *  succeeded is irrelevant to rendering — the email never surfaces
   *  fetch failures, per D-18. */
  readonly hero: ChildDigestHero;
  /** withinWindow items only (dedup + sort handled by caller). */
  readonly attention: readonly AttentionItem[];
  /** True when the child has a `homeworkUrl` saved — renderers use this
   *  to skip homework subsections entirely when absent (absent ≠ empty,
   *  per Q28). `homeworkForToday` / `homeworkDueToday` will also be empty
   *  in the unconfigured case, but this flag distinguishes "not set up"
   *  from "configured but no rows today." */
  readonly homeworkConfigured: boolean;
  /** Rows where `hwDate === todayLocal` (Q28). */
  readonly homeworkForToday: readonly HomeworkRecord[];
  /** Rows where `dueDate === todayLocal` (Q28). An entry can appear in
   *  both this list and `homeworkForToday` — two angles on one row. */
  readonly homeworkDueToday: readonly HomeworkRecord[];
}

export interface FamilyHero {
  /** Count of children with non-null hero (i.e., TE-succeeded this cycle). */
  readonly childCount: number;
  readonly attentionCount: number;
  readonly meetingCount: number;
  readonly notAssessedCount: number;
  /** Homework rows across children with non-null hero, counted per section
   *  (no cross-section dedup — the UI shows each count on its own line). */
  readonly homeworkForTodayCount: number;
  readonly homeworkDueTodayCount: number;
}

export interface RefreshDigest {
  readonly type: "refreshDigest";
  readonly generatedAt: number;
  readonly todayLocal: string;
  readonly family: FamilyHero;
  readonly children: readonly ChildDigest[];
  readonly failures: readonly DigestFailure[];
}

export interface NotifyChannel {
  /** Stored in log lines; convention: lowercase — `"os"` | `"email"`. */
  readonly name: string;
  /** Channel-level gate: OS permission, SMTP configured, per-channel user toggle. */
  isEnabled(digest: RefreshDigest): Promise<boolean>;
  /** Deliver the digest. Throws on failure — router catches and logs.
   *  `locale` is resolved once per cycle by the scheduler from `ui.language`
   *  and threaded through the channel for every translated string. */
  send(digest: RefreshDigest, locale: Locale): Promise<void>;
}

export interface NotifyRouterDeps {
  log: (message: string) => Promise<void>;
  logWarning: (message: string) => Promise<void>;
}
