// FetchRunner (Q20). Orchestrates FetchSource invocations and manages the
// fetch_runs row lifecycle. Sequential execution, per-source error isolation.

import type { ChildRecord } from "@/lib/scraper/types";
import type { FetchRunnerDeps, FetchRunnerRun, FetchRunnerSummary, FetchSource } from "./types";

export class FetchRunner {
  constructor(
    private readonly sources: readonly FetchSource[],
    private readonly deps: FetchRunnerDeps,
  ) {}

  /**
   * Run every applicable source for `child`, sequentially. Each source gets a
   * fresh `fetch_runs` row (created before `run()`, finalized after). A failure
   * in one source is recorded as a 'failed' row and does not stop the next.
   */
  async runAll(child: ChildRecord): Promise<FetchRunnerSummary> {
    const now = this.deps.now ?? Date.now;
    let successes = 0;
    let failures = 0;
    let skipped = 0;
    const runs: FetchRunnerRun[] = [];

    for (const source of this.sources) {
      if (!source.isApplicable(child)) {
        skipped += 1;
        continue;
      }

      const start = now();
      const fetchRunId = await this.deps.startFetchRun(child.id, source.name);
      await this.deps.log(
        `fetch: started source=${source.name} childId=${child.id} id=${fetchRunId}`,
      );

      try {
        await source.run({ child, childId: child.id, fetchRunId });
        const durationMs = now() - start;
        await this.deps.completeFetchRun(fetchRunId, {
          status: "success",
          durationMs,
        });
        await this.deps.log(
          `fetch: complete source=${source.name} childId=${child.id} id=${fetchRunId} durationMs=${durationMs}`,
        );
        successes += 1;
        runs.push({
          source: source.name,
          fetchRunId,
          status: "success",
          durationMs,
        });
      } catch (err) {
        const durationMs = now() - start;
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        await this.deps.completeFetchRun(fetchRunId, {
          status: "failed",
          durationMs,
          errorMessage,
        });
        await this.deps.logErr(
          `fetch: failed source=${source.name} childId=${child.id} id=${fetchRunId} — ${errorMessage}`,
        );
        failures += 1;
        runs.push({
          source: source.name,
          fetchRunId,
          status: "failed",
          durationMs,
          errorMessage,
        });
        // Intentionally swallow — next source runs. Dashboard builds the
        // post-loop digest from summary.runs[].status === "failed".
      }
    }

    return { successes, failures, skipped, runs };
  }
}
