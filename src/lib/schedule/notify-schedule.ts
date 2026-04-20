// Notify schedule math (Q29 + Q31). Mirrors fetch-schedule: N evenly-spaced
// local slots per day, anchored at a user-chosen "First slot at" HH:MM,
// with an optional weekday-only flag that skips Sat/Sun advances.
// Pure module — no Tauri, no Date.now().

import { nextWeekday } from "@/lib/schedule/weekday";

export const NOTIFY_RUNS_PER_DAY_MIN = 1;
export const NOTIFY_RUNS_PER_DAY_MAX = 8;
export const NOTIFY_RUNS_PER_DAY_DEFAULT = 1;
export const NOTIFY_FIRST_SLOT_DEFAULT = "07:00";

export function parseNotifyRunsPerDay(raw: string | undefined | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return NOTIFY_RUNS_PER_DAY_DEFAULT;
  return Math.max(NOTIFY_RUNS_PER_DAY_MIN, Math.min(NOTIFY_RUNS_PER_DAY_MAX, n));
}

export function parseNotifyFirstSlot(raw: string | undefined | null): string {
  const m = (raw ?? "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NOTIFY_FIRST_SLOT_DEFAULT;
  const h = Number.parseInt(m[1] ?? "", 10);
  const min = Number.parseInt(m[2] ?? "", 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return NOTIFY_FIRST_SLOT_DEFAULT;
  if (h < 0 || h > 23 || min < 0 || min > 59) return NOTIFY_FIRST_SLOT_DEFAULT;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function firstSlotToMinutes(hhmm: string): number {
  const parts = parseNotifyFirstSlot(hhmm).split(":");
  const h = Number.parseInt(parts[0] ?? "0", 10);
  const m = Number.parseInt(parts[1] ?? "0", 10);
  return h * 60 + m;
}

/** Slot list as minutes-of-day (0..1439). Anchored list wraps past midnight
 *  — caller sorts if it needs chronological order. */
export function computeNotifySlots(
  runsPerDay: number,
  firstSlotAt: string = NOTIFY_FIRST_SLOT_DEFAULT,
): readonly number[] {
  const n = Math.max(
    NOTIFY_RUNS_PER_DAY_MIN,
    Math.min(NOTIFY_RUNS_PER_DAY_MAX, Math.floor(runsPerDay)),
  );
  const anchor = firstSlotToMinutes(firstSlotAt);
  const step = 1440 / n;
  return Array.from({ length: n }, (_, i) => (anchor + Math.round(step * i)) % 1440);
}

/** Next slot strictly after `now` (local tz). Rolls to first slot tomorrow
 *  when today's slots are exhausted. When `weekdaysOnly` is true, advances
 *  past Sat/Sun to the following Monday's first slot. DST-safe. */
export function computeNotifyNextRun(
  now: Date,
  runsPerDay: number,
  firstSlotAt: string = NOTIFY_FIRST_SLOT_DEFAULT,
  weekdaysOnly = false,
): Date {
  const slots = [...computeNotifySlots(runsPerDay, firstSlotAt)].sort((a, b) => a - b);
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const minsNow = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const next = slots.find((s) => s > minsNow + 1e-6);
  let candidate =
    next === undefined ? makeLocalDate(y, m, d + 1, slots[0] ?? 0) : makeLocalDate(y, m, d, next);

  if (weekdaysOnly) {
    // If the picked day is a weekend, jump to Monday's first slot.
    const dayOnly = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
    const mon = nextWeekday(dayOnly);
    if (mon.getDate() !== dayOnly.getDate() || mon.getMonth() !== dayOnly.getMonth()) {
      candidate = makeLocalDate(mon.getFullYear(), mon.getMonth(), mon.getDate(), slots[0] ?? 0);
    }
  }
  return candidate;
}

function makeLocalDate(y: number, m: number, d: number, minutes: number): Date {
  const hh = Math.floor(minutes / 60);
  const mm = Math.round(minutes % 60);
  return new Date(y, m, d, hh, mm, 0, 0);
}
