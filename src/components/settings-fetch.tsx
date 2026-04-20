"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { FETCH_NOW_EVENT, SCHEDULES_CHANGED_EVENT } from "@/components/shell/schedulers";
import { CHILD_DATA_REFRESHED_EVENT } from "@/components/shell/sidebar-child-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type FetchRunRecord,
  getChildren,
  getLatestSuccessfulFetchRun,
  getSettingString,
  log,
  logErr,
  setSettingString,
} from "@/lib/ipc";
import {
  FETCH_RUNS_PER_DAY_DEFAULT,
  FETCH_RUNS_PER_DAY_MAX,
  FETCH_RUNS_PER_DAY_MIN,
  parseFetchRunsPerDay,
} from "@/lib/schedule/fetch-schedule";
import type { ChildRecord } from "@/lib/scraper/types";

const KEY_RUNS_PER_DAY = "fetch.runsPerDay";
const KEY_NEXT_RUN_AT = "fetch.nextRunAt";

interface ChildLastRun {
  readonly child: ChildRecord;
  readonly latest: FetchRunRecord | null;
}

function formatLocal(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function SettingsFetch() {
  const [runsPerDay, setRunsPerDay] = useState<number>(FETCH_RUNS_PER_DAY_DEFAULT);
  const [draft, setDraft] = useState<string>(String(FETCH_RUNS_PER_DAY_DEFAULT));
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  const [childLastRuns, setChildLastRuns] = useState<ChildLastRun[]>([]);
  const [fetching, setFetching] = useState(false);

  const reloadChildren = useCallback(async () => {
    const children = await getChildren();
    const rows: ChildLastRun[] = [];
    for (const c of children) {
      const latest = await getLatestSuccessfulFetchRun(c.id, "teacherease");
      rows.push({ child: c, latest });
    }
    setChildLastRuns(rows);
  }, []);

  const reloadNextRunAt = useCallback(async () => {
    const iso = await getSettingString(KEY_NEXT_RUN_AT, "");
    setNextRunAt(iso || null);
  }, []);

  useEffect(() => {
    void (async () => {
      const raw = await getSettingString(KEY_RUNS_PER_DAY, String(FETCH_RUNS_PER_DAY_DEFAULT));
      const parsed = parseFetchRunsPerDay(raw);
      setRunsPerDay(parsed);
      setDraft(String(parsed));
      await reloadNextRunAt();
      await reloadChildren();
    })();

    const handleDataRefreshed = () => {
      void reloadChildren();
      // Scheduler writes nextRunAt after each tick — refresh the display too.
      void reloadNextRunAt();
    };
    window.addEventListener(CHILD_DATA_REFRESHED_EVENT, handleDataRefreshed);
    return () => window.removeEventListener(CHILD_DATA_REFRESHED_EVENT, handleDataRefreshed);
  }, [reloadChildren, reloadNextRunAt]);

  const commitRunsPerDay = () => {
    const parsed = parseFetchRunsPerDay(draft);
    setDraft(String(parsed));
    if (parsed === runsPerDay) return;
    setRunsPerDay(parsed);
    void (async () => {
      try {
        await setSettingString(KEY_RUNS_PER_DAY, String(parsed));
        await log(`settings: fetch.runsPerDay=${parsed}`);
        window.dispatchEvent(new CustomEvent(SCHEDULES_CHANGED_EVENT));
        await reloadNextRunAt();
      } catch (e) {
        await logErr(
          `settings: fetch.runsPerDay save failed — ${e instanceof Error ? e.message : "unknown"}`,
        );
      }
    })();
  };

  const handleFetchNow = () => {
    setFetching(true);
    window.dispatchEvent(new CustomEvent(FETCH_NOW_EVENT));
    const handleDone = () => {
      setFetching(false);
      void reloadChildren();
      void reloadNextRunAt();
      window.removeEventListener(CHILD_DATA_REFRESHED_EVENT, handleDone);
    };
    window.addEventListener(CHILD_DATA_REFRESHED_EVENT, handleDone);
    // Safety timeout — if scheduler silently skips (mutex), stop spinning.
    setTimeout(() => {
      setFetching(false);
      window.removeEventListener(CHILD_DATA_REFRESHED_EVENT, handleDone);
    }, 60_000);
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-lg border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div>
          <h2 className="text-[14px] font-medium">Schedule</h2>
          <p className="text-[12px] text-muted-foreground">
            How often the app pulls fresh data from the portal. Runs at evenly-spaced times during
            the day. Only fires while the app is open — autostart keeps it ticking.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="fetch-runs-per-day" className="text-[13px]">
              Fetches per day ({FETCH_RUNS_PER_DAY_MIN}–{FETCH_RUNS_PER_DAY_MAX})
            </Label>
            <Input
              id="fetch-runs-per-day"
              type="number"
              min={FETCH_RUNS_PER_DAY_MIN}
              max={FETCH_RUNS_PER_DAY_MAX}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRunsPerDay}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRunsPerDay();
                }
              }}
              className="h-9 w-24 rounded-lg"
            />
          </div>
          <p className="pb-2 text-[12px] text-muted-foreground">
            Next run: <span className="font-medium text-foreground">{formatLocal(nextRunAt)}</span>
          </p>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[14px] font-medium">Fetch now</h2>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Pulls the latest data for every child immediately. No notification fires — only the DB
          updates. Use this when you want to see current data without waiting for the next scheduled
          run.
        </p>
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={fetching}
            onClick={handleFetchNow}
            className="gap-1.5"
          >
            {fetching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {fetching ? "Fetching…" : "Fetch now"}
          </Button>
        </div>
      </section>

      {childLastRuns.length > 0 && (
        <section className="space-y-2">
          <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            Last successful fetch
          </p>
          <div className="divide-y divide-border rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {childLastRuns.map(({ child, latest }) => (
              <div key={child.id} className="flex items-center gap-3 px-4 py-2.5">
                <p className="min-w-0 flex-1 truncate text-[13px] font-medium">
                  {child.displayName}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {latest ? formatLocal(latest.runAt) : "Never"}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
