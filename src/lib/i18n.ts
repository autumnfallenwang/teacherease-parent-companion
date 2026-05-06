// Phase 32 / D-24 / Q37 — i18n runtime (pure module). Hand-rolled
// `translate(key)` plus locale resolution + date formatters. Three flat-JSON
// catalogs (en/es/zh) live under ./locales/. The React Context wrapper
// lives in `src/components/shell/locale-provider.tsx` so this module
// stays free of React imports and is easy to unit-test.

import en from "./locales/en.json";
import es from "./locales/es.json";
import zh from "./locales/zh.json";

export type Locale = "en" | "es" | "zh";
export type LanguageSetting = "system" | Locale;

export const LANGUAGE_SETTING_KEY = "ui.language";
export const LANGUAGE_SETTING_DEFAULT: LanguageSetting = "system";
export const LANGUAGE_CHANGED_EVENT = "language-changed";

type Catalog = Record<string, string>;

const CATALOGS: Record<Locale, Catalog> = {
  en: en as Catalog,
  es: es as Catalog,
  zh: zh as Catalog,
};

/**
 * Maps a `LanguageSetting` to a concrete `Locale`. For `"system"`, reads
 * `navigator.language` and matches the closest catalog: `zh-*` → `"zh"`,
 * `es-*` → `"es"`, anything else → `"en"`. Safe outside the browser
 * (returns `"en"` when `navigator` is undefined).
 */
export function resolveLocale(setting: LanguageSetting): Locale {
  if (setting !== "system") return setting;
  const lang = typeof navigator === "undefined" ? "" : navigator.language;
  const normalized = lang.toLowerCase();
  if (normalized.startsWith("zh")) return "zh";
  if (normalized.startsWith("es")) return "es";
  return "en";
}

/**
 * Look up a translation. Fallback chain: active locale → English → raw
 * key. The raw-key fallback is intentional — a missing key surfaces as
 * "today.attention.heading" in dev, which is impossible to miss in
 * review (vs. blank or generic "translation missing" placeholder).
 *
 * `vars` interpolates `{name}`-style placeholders. Missing vars stay
 * literal in the output (e.g. "Hello, {name}" with no var).
 */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const fromActive = CATALOGS[locale][key];
  const fromEn = CATALOGS.en[key];
  const template = fromActive ?? fromEn ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    return v === undefined ? `{${name}}` : String(v);
  });
}

/**
 * Wrapper around `Date.prototype.toLocaleDateString` that always passes
 * an explicit locale — never `undefined` — so dates match the active
 * UI language. The "Chinese-dates with English UI" symptom that
 * motivated this phase came from `toLocaleDateString(undefined, ...)`.
 */
export function formatDate(locale: Locale, date: Date, opts?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(locale, opts);
}

/**
 * Date+time formatter for "Last successful fetch" / "Next run" timestamps.
 */
export function formatDateTime(
  locale: Locale,
  date: Date,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return date.toLocaleString(locale, opts);
}

/**
 * Format a portal date that may arrive as ISO ("2026-05-04"), "M/D" /
 * "MM/DD", or a full Date-parseable string. Falls back to the raw string
 * when unparseable. Used by attention rows + standards-tree where
 * `assignment.dueDate` arrives as whatever the portal exposed.
 *
 * Per Q37 amendment, portal *values* are verbatim, but date *format*
 * follows the active locale. So 5/4 → "lun 5/4" (Spanish), "5月4日"
 * (Chinese), "Mon · May 4" (English).
 */
export function formatPortalDate(locale: Locale, raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const md = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
  let parsed: Date | null = null;
  if (md) {
    const month = Number.parseInt(md[1] ?? "0", 10) - 1;
    const day = Number.parseInt(md[2] ?? "0", 10);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      parsed = new Date(new Date().getFullYear(), month, day);
    }
  } else {
    const d = new Date(trimmed);
    parsed = Number.isNaN(d.getTime()) ? null : d;
  }
  if (!parsed) return trimmed;
  return formatDate(locale, parsed, { month: "short", day: "numeric" });
}

/**
 * Relative-time formatter for "in 2h" / "due now" / "in 5m" prose. Used by
 * Settings → Fetch and Settings → Notifications next-run chips. Returns ""
 * for null / NaN inputs (rendering decision: callers display nothing).
 *
 * Phase 32 / B3: replaced the duplicate copies that lived in
 * `settings-fetch.tsx` and `settings-notifications.tsx`. Compact format
 * ("in 5m") is not standard `Intl.RelativeTimeFormat` output, so this stays
 * template-based with catalog keys instead of the Intl API.
 */
export function formatRelative(locale: Locale, iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return translate(locale, "time.relative.now");
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return translate(locale, "time.relative.minutes", { count: mins });
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return translate(locale, "time.relative.hours", { count: h });
  return translate(locale, "time.relative.hoursAndMinutes", { h, m });
}
