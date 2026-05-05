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
