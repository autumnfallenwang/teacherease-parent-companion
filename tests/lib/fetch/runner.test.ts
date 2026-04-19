import { describe, expect, it, vi } from "vitest";
import { FetchRunner } from "@/lib/fetch/runner";
import type { FetchContext, FetchRunnerDeps, FetchSource } from "@/lib/fetch/types";
import type { ChildRecord } from "@/lib/scraper/types";

function makeChild(overrides: Partial<ChildRecord> = {}): ChildRecord {
  return {
    id: 1,
    displayName: "Alex",
    portalType: "teacherease",
    baseUrl: "https://example.com",
    username: "alex@example.com",
    grade: null,
    school: null,
    homeworkUrl: null,
    createdAt: "2026-01-01 00:00:00",
    ...overrides,
  };
}

function makeDeps(): FetchRunnerDeps & {
  startFetchRun: ReturnType<typeof vi.fn>;
  completeFetchRun: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
  logErr: ReturnType<typeof vi.fn>;
  now: ReturnType<typeof vi.fn>;
} {
  let nextId = 100;
  const times = [1000, 1500, 2000, 2500, 3000, 3500];
  let timeIdx = 0;
  return {
    startFetchRun: vi.fn().mockImplementation(async () => nextId++),
    completeFetchRun: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    logErr: vi.fn().mockResolvedValue(undefined),
    now: vi.fn().mockImplementation(() => times[timeIdx++ % times.length] ?? 0),
  };
}

function source(opts: {
  name: string;
  applicable?: boolean;
  run?: (ctx: FetchContext) => Promise<void>;
}): FetchSource {
  return {
    name: opts.name,
    isApplicable: () => opts.applicable ?? true,
    run: opts.run ?? (() => Promise.resolve()),
  };
}

describe("FetchRunner", () => {
  it("runs a single applicable source and records success", async () => {
    const deps = makeDeps();
    const s = source({ name: "teacherease", run: vi.fn().mockResolvedValue(undefined) });
    const runner = new FetchRunner([s], deps);

    const summary = await runner.runAll(makeChild());

    expect(summary.successes).toBe(1);
    expect(summary.failures).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(summary.runs).toEqual([
      expect.objectContaining({
        source: "teacherease",
        fetchRunId: 100,
        status: "success",
      }),
    ]);
    expect(deps.startFetchRun).toHaveBeenCalledWith(1, "teacherease");
    expect(deps.completeFetchRun).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ status: "success" }),
    );
  });

  it("skips non-applicable sources", async () => {
    const deps = makeDeps();
    const s = source({ name: "homework", applicable: false, run: vi.fn() });
    const runner = new FetchRunner([s], deps);

    const summary = await runner.runAll(makeChild());

    expect(summary).toEqual({ successes: 0, failures: 0, skipped: 1, runs: [] });
    expect(deps.startFetchRun).not.toHaveBeenCalled();
    expect(s.run).not.toHaveBeenCalled();
  });

  it("calls startFetchRun before source.run and completeFetchRun after", async () => {
    const deps = makeDeps();
    const callOrder: string[] = [];
    deps.startFetchRun.mockImplementation(() => {
      callOrder.push("start");
      return Promise.resolve(42);
    });
    const runFn = vi.fn().mockImplementation(() => {
      callOrder.push("run");
      return Promise.resolve();
    });
    deps.completeFetchRun.mockImplementation(() => {
      callOrder.push("complete");
      return Promise.resolve();
    });

    const runner = new FetchRunner([source({ name: "teacherease", run: runFn })], deps);
    await runner.runAll(makeChild());

    expect(callOrder).toEqual(["start", "run", "complete"]);
  });

  it("passes the fetchRunId from startFetchRun to source.run", async () => {
    const deps = makeDeps();
    deps.startFetchRun.mockResolvedValue(999);
    const runFn = vi.fn().mockResolvedValue(undefined);

    const runner = new FetchRunner([source({ name: "teacherease", run: runFn })], deps);
    await runner.runAll(makeChild({ id: 7 }));

    expect(runFn).toHaveBeenCalledWith(expect.objectContaining({ fetchRunId: 999, childId: 7 }));
  });

  it("catches source errors, records failed completion, and continues", async () => {
    const deps = makeDeps();
    const s1 = source({
      name: "teacherease",
      run: vi.fn().mockRejectedValue(new Error("network down")),
    });
    const s2 = source({ name: "homework", run: vi.fn().mockResolvedValue(undefined) });
    const runner = new FetchRunner([s1, s2], deps);

    const summary = await runner.runAll(makeChild());

    expect(summary.successes).toBe(1);
    expect(summary.failures).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(summary.runs.map((r) => ({ source: r.source, status: r.status }))).toEqual([
      { source: "teacherease", status: "failed" },
      { source: "homework", status: "success" },
    ]);
    expect(s2.run).toHaveBeenCalled();
    expect(deps.completeFetchRun).toHaveBeenNthCalledWith(
      1,
      expect.any(Number),
      expect.objectContaining({ status: "failed", errorMessage: "network down" }),
    );
    expect(deps.completeFetchRun).toHaveBeenNthCalledWith(
      2,
      expect.any(Number),
      expect.objectContaining({ status: "success" }),
    );
    expect(deps.logErr).toHaveBeenCalledWith(expect.stringContaining("network down"));
  });

  it("runs multiple sources in declared order", async () => {
    const deps = makeDeps();
    const order: string[] = [];
    const s1 = source({
      name: "alpha",
      run: vi.fn().mockImplementation(() => {
        order.push("alpha");
        return Promise.resolve();
      }),
    });
    const s2 = source({
      name: "beta",
      run: vi.fn().mockImplementation(() => {
        order.push("beta");
        return Promise.resolve();
      }),
    });
    const runner = new FetchRunner([s1, s2], deps);
    await runner.runAll(makeChild());

    expect(order).toEqual(["alpha", "beta"]);
  });

  it("returns zero summary when no sources are applicable", async () => {
    const deps = makeDeps();
    const runner = new FetchRunner(
      [source({ name: "a", applicable: false }), source({ name: "b", applicable: false })],
      deps,
    );

    const summary = await runner.runAll(makeChild());

    expect(summary).toEqual({ successes: 0, failures: 0, skipped: 2, runs: [] });
    expect(deps.startFetchRun).not.toHaveBeenCalled();
  });

  it("uses injected now() for duration calculation", async () => {
    const deps = makeDeps();
    // First call = start, second call = end. Difference = 500ms.
    deps.now.mockReturnValueOnce(1000).mockReturnValueOnce(1500);
    const runner = new FetchRunner([source({ name: "teacherease" })], deps);

    await runner.runAll(makeChild());

    expect(deps.completeFetchRun).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ durationMs: 500, status: "success" }),
    );
  });

  it("translates non-Error throws to 'Unknown error' message", async () => {
    const deps = makeDeps();
    const s = source({
      name: "teacherease",
      run: () => Promise.reject("not an Error object"),
    });
    const runner = new FetchRunner([s], deps);

    await runner.runAll(makeChild());

    expect(deps.completeFetchRun).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ status: "failed", errorMessage: "Unknown error" }),
    );
  });
});
