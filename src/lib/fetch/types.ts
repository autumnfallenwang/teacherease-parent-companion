// Fetch pipeline contract (Q20). Pure types module — no Tauri, no IPC.
//
// Each data source (TeacherEase scrape, homework page, future portals)
// implements `FetchSource` and gets invoked by `FetchRunner`. The runner
// manages the fetch_runs row lifecycle; sources fetch/parse/persist
// their own domain data, FK-ing to the runner-provided `fetchRunId`.

import type { FetchRunStatus } from "@/lib/ipc";
import type { NotifyRouter } from "@/lib/notify/router";
import type { ChildRecord } from "@/lib/scraper/types";

/** Passed to each source when the runner invokes it. */
export interface FetchContext {
  readonly child: ChildRecord;
  readonly childId: number;
  /** Pre-inserted fetch_runs row id. Sources FK child rows (grades, homework, etc.) to this. */
  readonly fetchRunId: number;
  /** Event dispatcher. Sources call `ctx.notify.dispatch(...)` to surface user-visible updates. */
  readonly notify: NotifyRouter;
}

/** One data source = one `fetch_runs` row per applicable run. */
export interface FetchSource {
  /** Stored in `fetch_runs.source`. Convention: lowercase — `"teacherease"`, `"homework"`. */
  readonly name: string;
  /** Whether this source should run for this child. Skips when false (e.g. homework skips when `homeworkUrl` is null). */
  isApplicable(child: ChildRecord): boolean;
  /** Do the fetch/parse/persist work. Throws on failure — runner translates to a 'failed' row. */
  run(ctx: FetchContext): Promise<void>;
}

export interface FetchRunCompletion {
  readonly status: FetchRunStatus;
  readonly durationMs: number;
  readonly errorMessage?: string;
}

/** Dependencies injected into `FetchRunner`. Makes testability explicit. */
export interface FetchRunnerDeps {
  startFetchRun: (childId: number, source: string) => Promise<number>;
  completeFetchRun: (id: number, result: FetchRunCompletion) => Promise<void>;
  log: (message: string) => Promise<void>;
  logErr: (message: string) => Promise<void>;
  notify: NotifyRouter;
  /** Override for tests; defaults to `Date.now`. */
  now?: () => number;
}

/** One entry per non-skipped source, in the order they ran. */
export interface FetchRunnerRun {
  readonly source: string;
  readonly fetchRunId: number;
  readonly status: FetchRunStatus;
  readonly durationMs: number;
  readonly errorMessage?: string;
}

export interface FetchRunnerSummary {
  readonly successes: number;
  readonly failures: number;
  readonly skipped: number;
  readonly runs: readonly FetchRunnerRun[];
}
