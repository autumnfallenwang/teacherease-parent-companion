"use client";

// Phase 32 / D-24 / Q37 — React Context wrapper around the pure i18n
// runtime in `src/lib/i18n.ts`. The provider listens to the
// `language-changed` window event (fired by the Settings → Appearance
// picker) and re-renders the entire app on locale change.

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import {
  LANGUAGE_CHANGED_EVENT,
  LANGUAGE_SETTING_DEFAULT,
  LANGUAGE_SETTING_KEY,
  type LanguageSetting,
  type Locale,
  resolveLocale,
  translate,
} from "@/lib/i18n";
import { getSettingString } from "@/lib/ipc";

interface LocaleContextValue {
  locale: Locale;
  setting: LanguageSetting;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setting: "system",
});

interface LocaleProviderProps {
  initialSetting: LanguageSetting;
  children: ReactNode;
}

export function LocaleProvider({ initialSetting, children }: LocaleProviderProps) {
  const [setting, setSetting] = useState<LanguageSetting>(initialSetting);

  // Hydrate from settings on mount. The `initialSetting` prop is the
  // bootstrap value (rendered on first paint, before settings load); this
  // effect overrides it once the persisted `ui.language` arrives. Mirrors
  // the ThemeProvider pattern.
  useEffect(() => {
    void getSettingString(LANGUAGE_SETTING_KEY, LANGUAGE_SETTING_DEFAULT).then((raw) => {
      if (raw === "system" || raw === "en" || raw === "es" || raw === "zh") {
        setSetting(raw);
      }
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<LanguageSetting>).detail;
      if (detail === "system" || detail === "en" || detail === "es" || detail === "zh") {
        setSetting(detail);
      }
    };
    window.addEventListener(LANGUAGE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(LANGUAGE_CHANGED_EVENT, handler);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale: resolveLocale(setting), setting }),
    [setting],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext).locale;
}

export function useLanguageSetting(): LanguageSetting {
  return useContext(LocaleContext).setting;
}

export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const locale = useLocale();
  return (key, vars) => translate(locale, key, vars);
}

/**
 * Fired by the language picker when the user changes `ui.language`.
 * Provider listens and re-renders the tree.
 */
export function emitLanguageChanged(setting: LanguageSetting): void {
  window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGED_EVENT, { detail: setting }));
}
