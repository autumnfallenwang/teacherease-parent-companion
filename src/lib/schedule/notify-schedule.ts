// Notify schedule math (Q29). Exactly one run per day at a user-picked HH:MM
// in local tz. Pure module — no Tauri, no Date.now().

export const NOTIFY_TIME_DEFAULT = "07:00";

/** Returns a clamped "HH:MM" (00:00–23:59) or the default when input is invalid. */
export function parseNotifyTime(raw: string | undefined | null): string {
  const match = (raw ?? "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return NOTIFY_TIME_DEFAULT;
  const h = Number.parseInt(match[1] ?? "", 10);
  const min = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return NOTIFY_TIME_DEFAULT;
  if (h < 0 || h > 23 || min < 0 || min > 59) return NOTIFY_TIME_DEFAULT;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Next "HH:MM" local occurrence strictly after `now`. Rolls to tomorrow
 *  when `now` is exactly on or past today's time. DST-safe. */
export function computeNotifyNextRun(now: Date, hhmm: string): Date {
  const [h, min] = parseNotifyTime(hhmm)
    .split(":")
    .map((s) => Number.parseInt(s, 10));
  const hh = h ?? 0;
  const mm = min ?? 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
  if (today.getTime() > now.getTime()) return today;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hh, mm, 0, 0);
}
