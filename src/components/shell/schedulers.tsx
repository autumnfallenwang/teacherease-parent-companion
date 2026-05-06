"use client";

// Shell-level scheduler mount (Phase 19 CF3). Two independent ScheduleLoop
// instances — fetch (N×/day) + notify (1×/day at HH:MM) — live for the
// app's lifetime. Side-effect only; renders nothing. Q29 details.

import { useEffect } from "react";
import { runFetchCycle } from "@/lib/fetch/cycle";
import { LANGUAGE_SETTING_DEFAULT, LANGUAGE_SETTING_KEY, resolveLocale } from "@/lib/i18n";
import {
  getChildren,
  getLatestSuccessfulFetchRun,
  getSettingBool,
  getSettingString,
  listenTauriEvent,
  log,
  logErr,
  setSettingString,
} from "@/lib/ipc";
import { buildDigestFromDb } from "@/lib/notify/build-from-db";
import { buildNotifyRouter } from "@/lib/notify/default";
import {
  computeFetchNextRun,
  FETCH_FIRST_SLOT_DEFAULT,
  FETCH_RUNS_PER_DAY_DEFAULT,
  parseFetchFirstSlot,
  parseFetchRunsPerDay,
} from "@/lib/schedule/fetch-schedule";
import { ScheduleLoop } from "@/lib/schedule/loop";
import {
  computeNotifyNextRun,
  NOTIFY_FIRST_SLOT_DEFAULT,
  NOTIFY_RUNS_PER_DAY_DEFAULT,
  parseNotifyFirstSlot,
  parseNotifyRunsPerDay,
} from "@/lib/schedule/notify-schedule";

export const SCHEDULES_CHANGED_EVENT = "schedules-changed";
export const SEND_DIGEST_NOW_EVENT = "send-digest-now";
export const FETCH_NOW_EVENT = "fetch-now";

const STALE_MS = 6 * 60 * 60 * 1000;

function asMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

async function runNotifyCycle(): Promise<void> {
  const children = await getChildren();
  if (children.length === 0) return;
  // Q35 — notify dispatch defaults to fetch-then-dispatch so the digest
  // always reflects current portal state. Schedulers stay decoupled at the
  // code level; only the notify *action* coordinates. The escape-hatch
  // setting `notify.fetchBeforeDispatch` (default true) lets a parent
  // restore the legacy Q29 "read DB only, may be stale" behavior — useful
  // if double-fetches at adjacent slots ever become a concern.
  const fetchBefore = await getSettingBool("notify.fetchBeforeDispatch", true);
  if (fetchBefore) {
    await log("notify-cycle: fetching before dispatch");
    await runFetchCycle(children);
  } else {
    await log("notify-cycle: fetch-before-dispatch disabled, reading DB only");
  }
  const digest = await buildDigestFromDb(children, new Date());
  // Phase 32 / B3 — resolve locale once per cycle from `ui.language` so the
  // notify pipeline (email + OS) renders in the user's chosen language.
  // Falls through to English when the catalog lacks a key (translate's
  // built-in fallback chain).
  const langSetting = await getSettingString(LANGUAGE_SETTING_KEY, LANGUAGE_SETTING_DEFAULT);
  const locale = resolveLocale(
    langSetting === "system" || langSetting === "en" || langSetting === "es" || langSetting === "zh"
      ? langSetting
      : LANGUAGE_SETTING_DEFAULT,
  );
  await buildNotifyRouter().dispatch(digest, locale);
}

async function shouldColdStartFetch(): Promise<boolean> {
  const children = await getChildren();
  if (children.length === 0) return false;
  const now = Date.now();
  for (const c of children) {
    const latest = await getLatestSuccessfulFetchRun(c.id, "teacherease");
    if (!latest || now - new Date(latest.runAt).getTime() > STALE_MS) {
      return true;
    }
  }
  return false;
}

export function Schedulers() {
  useEffect(() => {
    let fetchLoop: ScheduleLoop | null = null;
    let notifyLoop: ScheduleLoop | null = null;
    let unlistenTray: (() => void) | null = null;
    let cancelled = false;

    const tearDown = (): void => {
      fetchLoop?.stop();
      notifyLoop?.stop();
      fetchLoop = null;
      notifyLoop = null;
    };

    const bootstrap = async (): Promise<void> => {
      if (cancelled) return;
      const runsPerDay = parseFetchRunsPerDay(
        await getSettingString("fetch.runsPerDay", String(FETCH_RUNS_PER_DAY_DEFAULT)),
      );
      const firstSlotAt = parseFetchFirstSlot(
        await getSettingString("fetch.firstSlotAt", FETCH_FIRST_SLOT_DEFAULT),
      );
      const fetchWeekdaysOnly = await getSettingBool("fetch.weekdaysOnly", false);
      const notifyRunsPerDay = parseNotifyRunsPerDay(
        await getSettingString("notify.runsPerDay", String(NOTIFY_RUNS_PER_DAY_DEFAULT)),
      );
      const notifyFirstSlotAt = parseNotifyFirstSlot(
        await getSettingString("notify.firstSlotAt", NOTIFY_FIRST_SLOT_DEFAULT),
      );
      const notifyWeekdaysOnly = await getSettingBool("notify.weekdaysOnly", false);

      fetchLoop = new ScheduleLoop({
        nextRunAt: (n) => {
          const next = computeFetchNextRun(n, runsPerDay, firstSlotAt, fetchWeekdaysOnly);
          void setSettingString("fetch.nextRunAt", next.toISOString());
          return next;
        },
        tick: async () => {
          const children = await getChildren();
          await runFetchCycle(children);
        },
        onError: (e) => void logErr(`scheduler: fetch tick error — ${asMsg(e)}`),
      });
      fetchLoop.start();

      notifyLoop = new ScheduleLoop({
        nextRunAt: (n) => {
          const next = computeNotifyNextRun(
            n,
            notifyRunsPerDay,
            notifyFirstSlotAt,
            notifyWeekdaysOnly,
          );
          void setSettingString("notify.nextRunAt", next.toISOString());
          return next;
        },
        tick: runNotifyCycle,
        onError: (e) => void logErr(`scheduler: notify tick error — ${asMsg(e)}`),
      });
      notifyLoop.start();

      await log(
        `scheduler: started fetch(n=${runsPerDay} anchor=${firstSlotAt} weekdays=${fetchWeekdaysOnly}) notify(n=${notifyRunsPerDay} anchor=${notifyFirstSlotAt} weekdays=${notifyWeekdaysOnly})`,
      );
    };

    const handleSchedulesChanged = (): void => {
      tearDown();
      void bootstrap();
    };

    const handleFetchNow = (): void => {
      void (async () => {
        const children = await getChildren();
        await runFetchCycle(children);
      })();
    };

    const handleSendDigestNow = (): void => {
      void (async () => {
        try {
          await runNotifyCycle();
        } catch (e) {
          await logErr(`scheduler: send digest now failed — ${asMsg(e)}`);
        }
      })();
    };

    window.addEventListener(SCHEDULES_CHANGED_EVENT, handleSchedulesChanged);
    window.addEventListener(FETCH_NOW_EVENT, handleFetchNow);
    window.addEventListener(SEND_DIGEST_NOW_EVENT, handleSendDigestNow);

    void (async () => {
      // Cold-start silent fetch when last TE success is >6h stale (Q29 point 4).
      try {
        if (await shouldColdStartFetch()) {
          await log("scheduler: cold-start stale fetch");
          const children = await getChildren();
          await runFetchCycle(children);
        }
      } catch (e) {
        await logErr(`scheduler: cold-start check failed — ${asMsg(e)}`);
      }

      await bootstrap();

      // Wire tray "Refresh Now" — previously a no-op listener target.
      try {
        unlistenTray = await listenTauriEvent("tray-refresh", () => {
          void (async () => {
            const children = await getChildren();
            await runFetchCycle(children);
          })();
        });
      } catch (e) {
        await logErr(`scheduler: tray listen failed — ${asMsg(e)}`);
      }
    })();

    return () => {
      cancelled = true;
      tearDown();
      window.removeEventListener(SCHEDULES_CHANGED_EVENT, handleSchedulesChanged);
      window.removeEventListener(FETCH_NOW_EVENT, handleFetchNow);
      window.removeEventListener(SEND_DIGEST_NOW_EVENT, handleSendDigestNow);
      if (unlistenTray) unlistenTray();
    };
  }, []);

  return null;
}
