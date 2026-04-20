// Fetch schedule math (Q29). N evenly-spaced local slots per day.
// Pure module — no Tauri, no Date.now().

export const FETCH_RUNS_PER_DAY_MIN = 1;
export const FETCH_RUNS_PER_DAY_MAX = 8;
export const FETCH_RUNS_PER_DAY_DEFAULT = 4;

export function parseFetchRunsPerDay(raw: string | undefined | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return FETCH_RUNS_PER_DAY_DEFAULT;
  return Math.max(FETCH_RUNS_PER_DAY_MIN, Math.min(FETCH_RUNS_PER_DAY_MAX, n));
}

/** Evenly-spaced hours-of-day for `n` runs (e.g. n=4 → [0, 6, 12, 18]). */
export function computeFetchSlots(runsPerDay: number): readonly number[] {
  const n = Math.max(
    FETCH_RUNS_PER_DAY_MIN,
    Math.min(FETCH_RUNS_PER_DAY_MAX, Math.floor(runsPerDay)),
  );
  const step = 24 / n;
  return Array.from({ length: n }, (_, i) => step * i);
}

/** Next slot strictly after `now` (local tz). Rolls to first slot tomorrow
 *  when today's slots are exhausted. DST-safe via `new Date(y, m, d, ...)`. */
export function computeFetchNextRun(now: Date, runsPerDay: number): Date {
  const slots = computeFetchSlots(runsPerDay);
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const hoursNow = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const nextSlot = slots.find((h) => h > hoursNow + 1e-6);
  if (nextSlot !== undefined) return makeLocalDate(y, m, d, nextSlot);
  const firstSlot = slots[0] ?? 0;
  return makeLocalDate(y, m, d + 1, firstSlot);
}

function makeLocalDate(y: number, m: number, d: number, hours: number): Date {
  const hh = Math.floor(hours);
  const mm = Math.round((hours - hh) * 60);
  return new Date(y, m, d, hh, mm, 0, 0);
}
