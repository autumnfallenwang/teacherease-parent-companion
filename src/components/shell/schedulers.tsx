"use client";

// Shell-level scheduler mount. Q29's two-cadence separation (fetch + notify)
// is preserved, but per Q36 / Phase 31 the wall-clock timer lives in Rust
// (src-tauri/src/scheduler.rs). This component:
//   - listens for "scheduler:fetch-tick" + "scheduler:notify-tick" events
//     emitted by the Rust worker tasks;
//   - on each tick, runs the existing cycle handler then re-arms by
//     computing the next fire time (TS owns the cadence math) and calling
//     scheduleNextTick();
//   - on settings-changed / boot, also arms both schedulers.
// Side-effect only; renders nothing.

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
  scheduleNextTick,
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

const NOTIFY_CATCHUP_KEY = "notify.catchupOnMiss";
const NOTIFY_LAST_SENT_KEY = "notify.lastSentAt";
const NOTIFY_NEXT_RUN_KEY = "notify.nextRunAt";

interface FetchCadence {
  runsPerDay: number;
  firstSlotAt: string;
  weekdaysOnly: boolean;
}
interface NotifyCadence {
  runsPerDay: number;
  firstSlotAt: string;
  weekdaysOnly: boolean;
}

function asMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

async function loadFetchCadence(): Promise<FetchCadence> {
  return {
    runsPerDay: parseFetchRunsPerDay(
      await getSettingString("fetch.runsPerDay", String(FETCH_RUNS_PER_DAY_DEFAULT)),
    ),
    firstSlotAt: parseFetchFirstSlot(
      await getSettingString("fetch.firstSlotAt", FETCH_FIRST_SLOT_DEFAULT),
    ),
    weekdaysOnly: await getSettingBool("fetch.weekdaysOnly", false),
  };
}

async function loadNotifyCadence(): Promise<NotifyCadence> {
  return {
    runsPerDay: parseNotifyRunsPerDay(
      await getSettingString("notify.runsPerDay", String(NOTIFY_RUNS_PER_DAY_DEFAULT)),
    ),
    firstSlotAt: parseNotifyFirstSlot(
      await getSettingString("notify.firstSlotAt", NOTIFY_FIRST_SLOT_DEFAULT),
    ),
    weekdaysOnly: await getSettingBool("notify.weekdaysOnly", false),
  };
}

async function armFetch(): Promise<void> {
  const c = await loadFetchCadence();
  const next = computeFetchNextRun(new Date(), c.runsPerDay, c.firstSlotAt, c.weekdaysOnly);
  void setSettingString("fetch.nextRunAt", next.toISOString());
  await scheduleNextTick("fetch", next.getTime());
}

async function armNotify(): Promise<void> {
  const c = await loadNotifyCadence();
  const next = computeNotifyNextRun(new Date(), c.runsPerDay, c.firstSlotAt, c.weekdaysOnly);
  void setSettingString(NOTIFY_NEXT_RUN_KEY, next.toISOString());
  await scheduleNextTick("notify", next.getTime());
}

/** Catch-up gate: fire a notify cycle now if the user enabled
 *  `notify.catchupOnMiss`, we're past the previously-armed slot, and the
 *  *next* slot hasn't arrived yet (else the next slot supersedes us).
 *  `lastSentAt` guards against double-firing if we already caught up in
 *  this gap (e.g. live + boot both detect the miss within one session). */
async function maybeRunNotifyCatchup(reason: "live" | "boot"): Promise<void> {
  const enabled = await getSettingBool(NOTIFY_CATCHUP_KEY, true);
  if (!enabled) return;

  const now = new Date();
  const c = await loadNotifyCadence();
  const nextSlot = computeNotifyNextRun(now, c.runsPerDay, c.firstSlotAt, c.weekdaysOnly);

  const lastSentIso = await getSettingString(NOTIFY_LAST_SENT_KEY, "");
  if (lastSentIso) {
    const lastSent = new Date(lastSentIso);
    // If we already sent something more recently than one full cadence,
    // the gap is already closed — no catch-up needed.
    if (!Number.isNaN(lastSent.getTime()) && now.getTime() - lastSent.getTime() < STALE_MS) {
      await log(`notify-catchup: skip (${reason}) — last sent ${lastSentIso}`);
      return;
    }
  }

  if (now >= nextSlot) {
    // The next slot is already due/past — let the normal tick handle it.
    return;
  }

  await log(`notify-catchup: firing (${reason})`);
  await runNotifyCycle();
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
  // Anchor for the catch-up gate so we don't double-fire across live + boot.
  void setSettingString(NOTIFY_LAST_SENT_KEY, new Date().toISOString());
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
    let unlistenFetchTick: (() => void) | null = null;
    let unlistenNotifyTick: (() => void) | null = null;
    let unlistenNotifyMissed: (() => void) | null = null;
    let unlistenTray: (() => void) | null = null;
    let cancelled = false;

    const handleFetchTick = (): void => {
      void (async () => {
        try {
          const children = await getChildren();
          await runFetchCycle(children);
        } catch (e) {
          await logErr(`scheduler: fetch tick error — ${asMsg(e)}`);
        } finally {
          // Re-arm even if the cycle failed so a transient error doesn't
          // permanently break the loop.
          try {
            await armFetch();
          } catch (e) {
            await logErr(`scheduler: fetch re-arm failed — ${asMsg(e)}`);
          }
        }
      })();
    };

    const handleNotifyTick = (): void => {
      void (async () => {
        try {
          await runNotifyCycle();
        } catch (e) {
          await logErr(`scheduler: notify tick error — ${asMsg(e)}`);
        } finally {
          try {
            await armNotify();
          } catch (e) {
            await logErr(`scheduler: notify re-arm failed — ${asMsg(e)}`);
          }
        }
      })();
    };

    const handleSchedulesChanged = (): void => {
      void (async () => {
        try {
          await armFetch();
          await armNotify();
        } catch (e) {
          await logErr(`scheduler: re-arm on settings change failed — ${asMsg(e)}`);
        }
      })();
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

    const handleNotifyMissed = (): void => {
      void (async () => {
        try {
          await maybeRunNotifyCatchup("live");
        } catch (e) {
          await logErr(`scheduler: notify catch-up failed — ${asMsg(e)}`);
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

      // Wire tick listeners BEFORE arming so we don't miss the first tick
      // if the Rust worker happens to fire instantly (unlikely but cheap).
      // Guard against React StrictMode in dev: the effect mounts → cleans
      // up → re-mounts, but `listenTauriEvent` is async, so the first
      // mount's listener can register *after* its cleanup ran. Re-check
      // `cancelled` after each await and unlisten immediately if so.
      try {
        const fetchUnlisten = await listenTauriEvent("scheduler:fetch-tick", handleFetchTick);
        if (cancelled) fetchUnlisten();
        else unlistenFetchTick = fetchUnlisten;
        const notifyUnlisten = await listenTauriEvent("scheduler:notify-tick", handleNotifyTick);
        if (cancelled) notifyUnlisten();
        else unlistenNotifyTick = notifyUnlisten;
        const notifyMissedUnlisten = await listenTauriEvent(
          "scheduler:notify-missed",
          handleNotifyMissed,
        );
        if (cancelled) notifyMissedUnlisten();
        else unlistenNotifyMissed = notifyMissedUnlisten;
      } catch (e) {
        await logErr(`scheduler: tick listen failed — ${asMsg(e)}`);
      }

      if (!cancelled) {
        // Boot catch-up — handles the case where the last armed notify slot
        // is in the past (laptop slept past it, OR the app was closed before
        // the live Rust miss event could fire). Honors the same setting as
        // the live path and gives up cleanly if the next slot is already due.
        try {
          const lastArmedIso = await getSettingString(NOTIFY_NEXT_RUN_KEY, "");
          if (lastArmedIso) {
            const lastArmed = new Date(lastArmedIso);
            if (!Number.isNaN(lastArmed.getTime()) && lastArmed.getTime() < Date.now()) {
              await maybeRunNotifyCatchup("boot");
            }
          }
        } catch (e) {
          await logErr(`scheduler: boot catch-up check failed — ${asMsg(e)}`);
        }

        try {
          await armFetch();
          await armNotify();
        } catch (e) {
          await logErr(`scheduler: initial arm failed — ${asMsg(e)}`);
        }
        const fc = await loadFetchCadence();
        const nc = await loadNotifyCadence();
        await log(
          `scheduler: started fetch(n=${fc.runsPerDay} anchor=${fc.firstSlotAt} weekdays=${fc.weekdaysOnly}) notify(n=${nc.runsPerDay} anchor=${nc.firstSlotAt} weekdays=${nc.weekdaysOnly})`,
        );
      }

      // Wire tray "Refresh Now" — separate from the periodic fetch path.
      try {
        const trayUnlisten = await listenTauriEvent("tray-refresh", () => {
          void (async () => {
            const children = await getChildren();
            await runFetchCycle(children);
          })();
        });
        if (cancelled) trayUnlisten();
        else unlistenTray = trayUnlisten;
      } catch (e) {
        await logErr(`scheduler: tray listen failed — ${asMsg(e)}`);
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener(SCHEDULES_CHANGED_EVENT, handleSchedulesChanged);
      window.removeEventListener(FETCH_NOW_EVENT, handleFetchNow);
      window.removeEventListener(SEND_DIGEST_NOW_EVENT, handleSendDigestNow);
      if (unlistenFetchTick) unlistenFetchTick();
      if (unlistenNotifyTick) unlistenNotifyTick();
      if (unlistenNotifyMissed) unlistenNotifyMissed();
      if (unlistenTray) unlistenTray();
    };
  }, []);

  return null;
}
