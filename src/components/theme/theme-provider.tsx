"use client";

// Applies the user's appearance preferences to <html> (Phase 14 A1 + A4 + A2).
// Renders nothing — side-effect only. Reads three settings:
//   - appearance.theme     (light | dark | system)      — toggles `.dark` class
//   - appearance.profile   (default | solarized | ...)  — applies `.theme-<name>` class
//   - appearance.fontSize  (stringified zoom factor)    — sets `--font-scale` CSS var
// Listens for OS color-scheme changes when theme is "system" and for a custom
// "theme-preference-change" event so the settings tab can trigger an immediate
// re-resolve without a page reload.

import { useEffect } from "react";
import {
  FONT_SIZE_DEFAULT,
  isThemePreference,
  isThemeProfile,
  PROFILE_CLASSES,
  parseFontSize,
  resolveTheme,
  type ThemePreference,
  type ThemeProfile,
} from "@/lib/core/theme";
import { getSettingString, logErr } from "@/lib/ipc";

const THEME_KEY = "appearance.theme";
const PROFILE_KEY = "appearance.profile";
const FONT_SIZE_KEY = "appearance.fontSize";
const EVENT_NAME = "theme-preference-change";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function apply(
  preference: ThemePreference,
  profile: ThemeProfile,
  fontScale: number,
  mql: MediaQueryList | null,
): void {
  const systemPrefersDark = mql?.matches ?? false;
  const resolved = resolveTheme(preference, systemPrefersDark);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  // Remove any prior profile class, then apply the selected one (if any).
  for (const cls of Object.values(PROFILE_CLASSES)) {
    if (cls) root.classList.remove(cls);
  }
  const profileClass = PROFILE_CLASSES[profile];
  if (profileClass) root.classList.add(profileClass);
  root.style.setProperty("--font-scale", String(fontScale));
}

export function ThemeProvider() {
  useEffect(() => {
    let cancelled = false;
    const mql = typeof window === "undefined" ? null : window.matchMedia(MEDIA_QUERY);
    let currentPreference: ThemePreference = "system";
    let currentProfile: ThemeProfile = "default";
    let currentFontScale: number = FONT_SIZE_DEFAULT;

    const readAndApply = async () => {
      try {
        const [themeRaw, profileRaw, fontSizeRaw] = await Promise.all([
          getSettingString(THEME_KEY, "system"),
          getSettingString(PROFILE_KEY, "default"),
          getSettingString(FONT_SIZE_KEY, String(FONT_SIZE_DEFAULT)),
        ]);
        if (cancelled) return;
        currentPreference = isThemePreference(themeRaw) ? themeRaw : "system";
        currentProfile = isThemeProfile(profileRaw) ? profileRaw : "default";
        currentFontScale = parseFontSize(fontSizeRaw);
        localStorage.setItem(THEME_KEY, currentPreference);
        localStorage.setItem(PROFILE_KEY, currentProfile);
        localStorage.setItem(FONT_SIZE_KEY, String(currentFontScale));
        apply(currentPreference, currentProfile, currentFontScale, mql);
      } catch (err) {
        await logErr(`theme: read failed — ${err instanceof Error ? err.message : "unknown"}`);
      }
    };

    const handleSystemChange = () => {
      if (currentPreference === "system") {
        apply(currentPreference, currentProfile, currentFontScale, mql);
      }
    };

    const handlePreferenceChange = () => {
      void readAndApply();
    };

    void readAndApply();
    mql?.addEventListener("change", handleSystemChange);
    window.addEventListener(EVENT_NAME, handlePreferenceChange);

    return () => {
      cancelled = true;
      mql?.removeEventListener("change", handleSystemChange);
      window.removeEventListener(EVENT_NAME, handlePreferenceChange);
    };
  }, []);

  return null;
}
