// Fetch schedule math (Q29 + Q30 + Q31). N evenly-spaced local slots per
// day anchored at a user-chosen "First slot at" HH:MM, with an optional
// weekday-only flag that advances across Sat/Sun.
// Pure module — no Tauri, no Date.now().

import { nextWeekday } from "@/lib/schedule/weekday";

export const FETCH_RUNS_PER_DAY_MIN = 1;
export const FETCH_RUNS_PER_DAY_MAX = 8;
export const FETCH_RUNS_PER_DAY_DEFAULT = 4;
export const FETCH_FIRST_SLOT_DEFAULT = "00:00";

export function parseFetchRunsPerDay(raw: string | undefined | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return FETCH_RUNS_PER_DAY_DEFAULT;
  return Math.max(FETCH_RUNS_PER_DAY_MIN, Math.min(FETCH_RUNS_PER_DAY_MAX, n));
}

/** Clamps to a valid "HH:MM" (00:00–23:59) or the default when invalid. */
export function parseFetchFirstSlot(raw: string | undefined | null): string {
  const m = (raw ?? "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return FETCH_FIRST_SLOT_DEFAULT;
  const h = Number.parseInt(m[1] ?? "", 10);
  const min = Number.parseInt(m[2] ?? "", 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return FETCH_FIRST_SLOT_DEFAULT;
  if (h < 0 || h > 23 || min < 0 || min > 59) return FETCH_FIRST_SLOT_DEFAULT;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function firstSlotToMinutes(hhmm: string): number {
  const parts = parseFetchFirstSlot(hhmm).split(":");
  const h = Number.parseInt(parts[0] ?? "0", 10);
  const m = Number.parseInt(parts[1] ?? "0", 10);
  return h * 60 + m;
}

/** Slot list as minutes-of-day (0..1439). Anchored list wraps past midnight
 *  — caller sorts if it needs chronological order. Order preserves the
 *  "starting at {firstSlotAt}" conceptual sequence. */
export function computeFetchSlots(
  runsPerDay: number,
  firstSlotAt: string = FETCH_FIRST_SLOT_DEFAULT,
): readonly number[] {
  const n = Math.max(
    FETCH_RUNS_PER_DAY_MIN,
    Math.min(FETCH_RUNS_PER_DAY_MAX, Math.floor(runsPerDay)),
  );
  const anchor = firstSlotToMinutes(firstSlotAt);
  const step = 1440 / n;
  return Array.from({ length: n }, (_, i) => (anchor + Math.round(step * i)) % 1440);
}

/** Next slot strictly after `now` (local tz). Rolls to first slot tomorrow
 *  when today's slots are exhausted. When `weekdaysOnly` is true, advances
 *  past Sat/Sun to the following Monday's first slot.
 *  DST-safe via `new Date(y, m, d, ...)`. */
export function computeFetchNextRun(
  now: Date,
  runsPerDay: number,
  firstSlotAt: string = FETCH_FIRST_SLOT_DEFAULT,
  weekdaysOnly = false,
): Date {
  const slots = [...computeFetchSlots(runsPerDay, firstSlotAt)].sort((a, b) => a - b);
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const minsNow = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const next = slots.find((s) => s > minsNow + 1e-6);
  let candidate =
    next === undefined ? makeLocalDate(y, m, d + 1, slots[0] ?? 0) : makeLocalDate(y, m, d, next);

  if (weekdaysOnly) {
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

/** Format minutes-of-day (0..1439) as "HH:MM" for chip display. */
export function formatSlotMinutes(mins: number): string {
  const normalized = ((Math.round(mins) % 1440) + 1440) % 1440;
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
