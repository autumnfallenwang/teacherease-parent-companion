# Homework follow-up questions (2026-04-17)

Questions that came up while validating Phase 8 in the dev app. Collected here to plan together in one pass rather than ad-hoc.

## Q1 — Viewing previous days' homework

**Context:** `HomeworkCard` only renders the newest `hw_date`. Previous days are already persisted in the DB and readable via `getRecentHomework()`, but nothing surfaces them.

**Proposal:** Add a collapsed **"Previous days"** section below today's card in `HomeworkCard`. Reuse the disclosure pattern from `AttentionSection`'s "Older" group — chevron + count, click to expand, renders the same per-subject row UI for each prior date.

**Alternatives considered:**
- Prev/next day arrows on the card — more clicks, feels like a reader app rather than a dashboard.
- Dedicated `/homework` page — breaks Q18's "one scroll" principle.

**Lean:** collapsed accordion below the current-day card.

## Q2 — Normalize `due_date` to ISO

**Context:** `due_date` is stored as the raw page string (e.g. `"Friday 4/17"`). Not sortable, not comparable, can't power "overdue" badges or date math.

**Proposal:** Normalize to ISO `YYYY-MM-DD` in `persistHomework()`. Year-inference strategy: anchor on `hw_date`'s year; if the parsed `M/D` is strictly earlier than `hw_date`'s `M/D`, add one year (handles Dec→Jan wraparound). Drop the weekday from storage — it's derivable at render time via `toLocaleDateString({ weekday: "long" })`.

**Migration:** no schema change needed (column is already TEXT). Existing raw-string rows either get backfilled on next scrape (current-month filter re-upserts daily) or handled by a one-shot cleanup. On a fresh dev DB with `--reset`, this is a non-issue.

**Tradeoffs:**
- **Pro:** sortable DESC by actual chronology, comparable against `new Date()`, enables "Due today" / "Overdue" UI.
- **Con:** raw weekday text lost from DB — but regeneratable from ISO, so no real data loss.

**Lean:** normalize on persist, reformat on render.

## Q3 — Recent Activity "Today" heading is misleading

**Context:** The section header reads "Today" but mixes two different kinds of items:
1. Things that changed in the last ~24h — `improved` / `declined` / `newScores` (genuinely today).
2. Persistent nags — `agingMissing` fires for any assignment missing ≥ 14 days in BOTH the current and prior scrape. These aren't "today" — the seed example "Geography Quiz still missing (2 weeks)" was due 14 days ago and has been missing the whole time.

**Status:** Temporarily disabled — the `<RecentActivity />` render, the `activities` useMemo, the `prevGrades`/`prevAssignments` state, and the `getScrapeBefore` fetch were removed from `dashboard.tsx`. The underlying modules remain intact for future reuse: `src/components/recent-activity.tsx`, `src/lib/core/activity.ts` (and its 12 tests), and the `getScrapeBefore` IPC query.

**Options to consider when re-enabling:**
- Rename the heading (e.g. "Recent changes") and keep the current behavior.
- Drop `agingMissing` from this section — `AttentionSection` already groups missing work and shows aging via the "Older" bucket, so it's duplication.
- Split into two headings: "Today" (genuine deltas) + "Still outstanding" (persistent nags).
- Require a meaningful signal (e.g. only emit `agingMissing` when the aging threshold is freshly crossed since the previous scrape) so the section really reflects change.

**Lean:** drop `agingMissing` entirely, rename heading to something accurate like "Since last check", and reintroduce only the three event-driven types.

