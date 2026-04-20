// Weekday advance helper (Q31). Shared by fetch-schedule + notify-schedule
// to skip Saturday (6) / Sunday (0) when `weekdaysOnly` is on.
// Pure — no Tauri, no Date.now().

/** Returns a new Date advanced to the next Monday if `date` is Sat/Sun,
 *  otherwise returns `date` unchanged. Preserves the time-of-day component
 *  — callers that want "Monday's first slot" must re-pick the slot after
 *  snapping to midnight of the returned date. */
export function nextWeekday(date: Date): Date {
  const out = new Date(date.getTime());
  while (out.getDay() === 0 || out.getDay() === 6) {
    out.setDate(out.getDate() + 1);
  }
  return out;
}

/** Returns true when `date` is Saturday (6) or Sunday (0). */
export function isWeekend(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}
