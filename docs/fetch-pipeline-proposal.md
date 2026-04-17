# Fetch pipeline proposal (2026-04-17)

Unify the runtime layer of data sources (TeacherEase scrape, homework page, future sources) behind a common contract + runner + observability table. Do **not** unify data schemas — each source keeps its own tables.

Status: **proposal, not yet scheduled.**

## Why now

Two sources live as two inline blocks in `dashboard.tsx:handleRefresh`. It works, but:
- Duplicated try/catch/log boilerplate per source.
- Homework has zero observability in the DB (no last-run time, no last-error). Q4 in `homework-followups.md` was going to bolt three columns onto `children` — that's a narrow fix for a problem the whole pipeline has.
- Adding a 3rd source (PowerSchool, school calendar, attendance, announcements) means another inline block and another set of ad-hoc observability columns.

Early stage is the right time to set the shape — before it calcifies into copies.

## What this proposal is NOT

- **Not a data-schema unification.** `grades` / `standards` / `assignments` / `homework` keep their current shapes. TeacherEase and homework have genuinely different structure (nested vs flat, graded vs not) — forcing one schema loses information.
- **Not a plugin system.** Sources are a hardcoded enum, not dynamically registered.
- **Not a scheduler rework.** Q2's 6h internal timer stays as-is. Per-source cadence can come when a real user asks.
- **Not an auth abstraction.** TeacherEase uses keychain + cookies; homework uses none. Pushing those into a generic `Auth` interface now is premature.

## Proposed design

### Module layout

```
src/lib/fetch/
  types.ts              # FetchSource<TResult> contract
  runner.ts             # FetchRunner: iterates sources, records runs
  teacherease-source.ts # wraps login + overview + details + persistScrape
  homework-source.ts    # wraps fetch + parseHomework + persistHomework
```

### Contract (sketch)

```ts
export interface FetchContext {
  readonly childId: number;
  readonly child: ChildRecord;
  readonly fetchRunId: number;   // row in fetch_runs, set by the runner
}

export interface FetchSource<TResult = void> {
  readonly name: string;         // "teacherease" | "homework" | ...
  /** Return true to run this source for this child (e.g. homeworkUrl set). */
  isApplicable(child: ChildRecord): boolean;
  /** Fetch + parse + persist. Throws on any failure. */
  run(ctx: FetchContext): Promise<TResult>;
}
```

Each source owns its own tables. A source is free to do anything internally — the runner only cares that it resolves or throws.

### Runner (sketch)

```ts
export class FetchRunner {
  constructor(private readonly sources: readonly FetchSource[]) {}

  async runAll(child: ChildRecord): Promise<void> {
    for (const source of this.sources) {
      if (!source.isApplicable(child)) continue;
      const runId = await startFetchRun(child.id, source.name);
      try {
        await source.run({ childId: child.id, child, fetchRunId: runId });
        await completeFetchRun(runId, "success");
      } catch (err) {
        await completeFetchRun(runId, "failed", err);
        // Continue to the next source — one failure doesn't kill the batch.
      }
    }
  }
}
```

- Sources run **sequentially** (v1). Parallel execution can come later if anyone ever has > 3 sources.
- Each source writes its own domain rows AND updates `fetch_runs` indirectly through the runner.
- One source failure doesn't abort the rest.

### New table

Migration v4:

```sql
CREATE TABLE fetch_runs (
  id            INTEGER PRIMARY KEY,
  source        TEXT NOT NULL,
  child_id      INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT,
  status        TEXT NOT NULL CHECK (status IN ('running','success','failed')),
  duration_ms   INTEGER,
  error_message TEXT
);
CREATE INDEX idx_fetch_runs_child_source ON fetch_runs(child_id, source, started_at DESC);
```

Supersedes:
- The per-source "last run" columns that Q4 in `homework-followups.md` proposed on `children`.
- The narrower `scrapes` table (see migration decision below).

### Migration decision: rename `scrapes` or keep both?

Two paths, pick one:

**(a) Rename `scrapes` → `fetch_runs`, add `source` column defaulted to 'teacherease'.**
- Rename FK column `scrape_id` → `fetch_run_id` in `grades`, `raw_payloads`, `standards`, `assignments`.
- One history table for all sources.
- Migration touches every scrape-related table. Bigger diff, but cleaner end state.

**(b) Keep `scrapes` as the teacherease-specific log; `fetch_runs` is new and only tracks homework (+ future sources).**
- Two parallel history tables forever.
- Smaller diff. Accumulates tech debt.

**Recommendation: (a).** The rename is mechanical, caught by type checking, and gives us a clean foundation. Worth the extra migration work.

### Dashboard impact

```ts
// before
if (gradesRefreshNeeded) { /* 30 lines of teacherease fetch/parse/persist */ }
if (child.homeworkUrl) { /* 20 lines of homework fetch/parse/persist */ }

// after
const runner = new FetchRunner([teacherEaseSource, homeworkSource]);
await runner.runAll(child);
```

The notification dispatch (`notifyNeedsAttention`, `notifyNewHomework`) moves out of `handleRefresh` and into the sources themselves — each source knows what's notification-worthy.

## Step-by-step refactor

1. **Migration v4** — add `fetch_runs`, rename `scrapes` → `fetch_runs` scrape rows get `source='teacherease'`, rename FK columns in dependent tables. Update `migrations.rs` + `seed-dev-db.ts` `SCHEMA_SQL`.
2. **`FetchSource` contract** — `src/lib/fetch/types.ts`.
3. **`FetchRunner`** — `src/lib/fetch/runner.ts`, including `startFetchRun` / `completeFetchRun` IPC helpers in `ipc.ts`.
4. **Extract TeacherEase source** — `teacherease-source.ts`. The bulk of today's `handleRefresh` code moves here. Keeps talking to existing `persistScrape` which continues to write to `grades` / `standards` / `assignments` (just now references `fetch_run_id` instead of `scrape_id`).
5. **Extract Homework source** — `homework-source.ts`. Wraps parseHomework + persistHomework + notifyNewHomework. Drops the ad-hoc try/catch from `handleRefresh`.
6. **Thin `handleRefresh`** — constructs the runner, calls `runAll`, handles top-level errors (permission denied, etc).
7. **Update existing IPC read queries** — any code using `scrape_id` column names. TypeScript will catch these at compile time.
8. **Update seed script** — same rename.
9. **Update tests** — integration tests reference `scrapes` table directly in a few places; update to `fetch_runs`.
10. **Update design-plan.md Q8 / Q17** — add a locked-decision entry ("Q20 — Fetch pipeline abstraction") pointing to this proposal.

Estimated scope: ~2 days of focused work, ~500–700 lines of diff, no user-visible changes.

## Open questions before implementing

1. **Sequential or parallel source execution?** Sequential keeps logs readable and error handling simple; parallel is faster but harder to reason about. Start sequential, parallelize only if needed.
2. **Where do notifications live?** Two options:
   - Inside each source (simpler, coupled to data source).
   - In a post-runner hook (decoupled, needs a uniform "did anything new happen?" signal).
   - Lean: inside each source for v1.
3. **How aggressive is the `scrapes` → `fetch_runs` rename?** If (a) feels too invasive, we can deliver the runner against option (b) now and do the table rename later.
4. **Should the runner handle retries?** Current code has no retry logic. Design plan Q2 mentions "exponential backoff with hard retry cap (3)" for scheduled scrapes — that's a scheduler concern, not a source concern. Leave retries out of the runner; scheduler wraps the runner.
5. **Testability of the runner itself?** The runner has side-effects (DB writes). Unit-testable with a mock `FetchSource[]`. Integration-test by running a fake source + real DB. Out of scope of today's test suite pattern.
6. **Do we keep `scrape_id` → `fetch_run_id` rename, or stop at just adding `fetch_run_id` as a second FK column?** Renaming is cleaner; dual columns are safer during rollout but permanently confusing. Lean: rename.

## Decision to make

- **Ship this now?** If yes, schedule as Phase 8.5 or Phase 9 before anything else, since it reshapes `handleRefresh` and the scrapes schema.
- **Defer until a 3rd source is real?** Totally defensible — the current code works and the refactor is mechanical once we commit.
