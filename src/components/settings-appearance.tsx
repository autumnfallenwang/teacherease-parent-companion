"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/section";
import { emitLanguageChanged, useT } from "@/components/shell/locale-provider";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_PRESETS,
  isScaleNear,
  isThemePreference,
  isThemeProfile,
  PROFILE_LABELS,
  parseFontSize,
  type ThemePreference,
  type ThemeProfile,
} from "@/lib/core/theme";
import { LANGUAGE_SETTING_DEFAULT, LANGUAGE_SETTING_KEY, type LanguageSetting } from "@/lib/i18n";
import { getSettingString, log, logErr, setSettingString } from "@/lib/ipc";

const THEME_KEY = "appearance.theme";
const PROFILE_KEY = "appearance.profile";
const FONT_SIZE_KEY = "appearance.fontSize";
const EVENT_NAME = "theme-preference-change";

// Phase 32 / D-24 / Q37 — Language picker. Labels render literally as the
// language's own name (System / English / Español / 中文) — standard
// convention so users can recognize their language even when the rest of
// the UI is in a different one.
const LANGUAGE_OPTIONS: Array<{ value: LanguageSetting; label: string }> = [
  { value: "system", label: "System" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "zh", label: "中文" },
];

function isLanguageSetting(value: string): value is LanguageSetting {
  return value === "system" || value === "en" || value === "es" || value === "zh";
}

const MODE_OPTIONS: Array<{ value: ThemePreference; labelKey: string; icon: ReactNode }> = [
  {
    value: "light",
    labelKey: "settings.appearance.mode.light",
    icon: <Sun className="h-3.5 w-3.5" />,
  },
  {
    value: "dark",
    labelKey: "settings.appearance.mode.dark",
    icon: <Moon className="h-3.5 w-3.5" />,
  },
  {
    value: "system",
    labelKey: "settings.appearance.mode.system",
    icon: <Monitor className="h-3.5 w-3.5" />,
  },
];

const PROFILE_ORDER: ThemeProfile[] = ["default", "solarized", "nord", "dracula", "contrast"];

const PROFILE_DESCRIPTION_KEYS: Record<ThemeProfile, string> = {
  default: "settings.appearance.profile.default",
  solarized: "settings.appearance.profile.solarized",
  nord: "settings.appearance.profile.nord",
  dracula: "settings.appearance.profile.dracula",
  contrast: "settings.appearance.profile.contrast",
};

function scaleToPercent(scale: number): number {
  return Math.round(scale * 100);
}

export function SettingsAppearance() {
  const t = useT();
  const [mode, setMode] = useState<ThemePreference>("system");
  const [profile, setProfile] = useState<ThemeProfile>("default");
  const [scale, setScale] = useState<number>(FONT_SIZE_DEFAULT);
  const [language, setLanguage] = useState<LanguageSetting>(LANGUAGE_SETTING_DEFAULT);
  // Separate draft state so intermediate typing in the custom input doesn't
  // trigger saves (per Q24: text inputs commit on Enter or blur).
  const [percentInput, setPercentInput] = useState<string>(
    String(scaleToPercent(FONT_SIZE_DEFAULT)),
  );

  useEffect(() => {
    void Promise.all([
      getSettingString(THEME_KEY, "system"),
      getSettingString(PROFILE_KEY, "default"),
      getSettingString(FONT_SIZE_KEY, String(FONT_SIZE_DEFAULT)),
      getSettingString(LANGUAGE_SETTING_KEY, LANGUAGE_SETTING_DEFAULT),
    ]).then(([rawTheme, rawProfile, rawSize, rawLang]) => {
      setMode(isThemePreference(rawTheme) ? rawTheme : "system");
      setProfile(isThemeProfile(rawProfile) ? rawProfile : "default");
      const parsed = parseFontSize(rawSize);
      setScale(parsed);
      setPercentInput(String(scaleToPercent(parsed)));
      setLanguage(isLanguageSetting(rawLang) ? rawLang : LANGUAGE_SETTING_DEFAULT);
    });
  }, []);

  const dispatchChange = () => {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  };

  const handleMode = async (value: ThemePreference) => {
    if (value === mode) return;
    setMode(value);
    try {
      await setSettingString(THEME_KEY, value);
      localStorage.setItem(THEME_KEY, value);
      dispatchChange();
      await log(`settings: appearance.theme=${value}`);
    } catch (e) {
      await logErr(
        `settings: appearance.theme save failed — ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  };

  const handleProfile = async (value: string) => {
    if (!isThemeProfile(value) || value === profile) return;
    setProfile(value);
    try {
      await setSettingString(PROFILE_KEY, value);
      localStorage.setItem(PROFILE_KEY, value);
      dispatchChange();
      await log(`settings: appearance.profile=${value}`);
    } catch (e) {
      await logErr(
        `settings: appearance.profile save failed — ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  };

  const applyScale = async (next: number) => {
    if (isScaleNear(next, scale)) return;
    setScale(next);
    setPercentInput(String(scaleToPercent(next)));
    try {
      await setSettingString(FONT_SIZE_KEY, String(next));
      localStorage.setItem(FONT_SIZE_KEY, String(next));
      dispatchChange();
      await log(`settings: appearance.fontSize=${next}`);
    } catch (e) {
      await logErr(
        `settings: appearance.fontSize save failed — ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  };

  const commitPercentInput = () => {
    const pct = Number.parseFloat(percentInput);
    if (!Number.isFinite(pct)) {
      // Revert the displayed value back to the current saved scale.
      setPercentInput(String(scaleToPercent(scale)));
      return;
    }
    const next = parseFontSize(String(pct / 100));
    void applyScale(next);
  };

  const handleLanguage = async (value: LanguageSetting) => {
    if (value === language) return;
    setLanguage(value);
    try {
      await setSettingString(LANGUAGE_SETTING_KEY, value);
      emitLanguageChanged(value);
      await log(`settings: ui.language=${value}`);
    } catch (e) {
      await logErr(
        `settings: ui.language save failed — ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title={t("settings.appearance.language.title")}
        help={t("settings.appearance.language.help")}
        card={false}
      >
        <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {LANGUAGE_OPTIONS.map((opt) => {
            const active = language === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                aria-label={opt.label}
                onClick={() => {
                  void handleLanguage(opt.value);
                }}
                className={`inline-flex items-center rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                  active
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("settings.appearance.profile.title")}
        help={t("settings.appearance.profile.help")}
        card={false}
      >
        <div className="divide-y divide-border rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {PROFILE_ORDER.map((p) => {
            const active = p === profile;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  void handleProfile(p);
                }}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors first:rounded-t-lg last:rounded-b-lg ${
                  active ? "bg-secondary text-foreground" : "text-foreground hover:bg-secondary/50"
                }`}
              >
                <span
                  className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                    active ? "bg-primary" : "bg-border"
                  }`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] ${active ? "font-medium" : ""}`}>
                    {PROFILE_LABELS[p]}
                  </span>
                  <span className="block text-[12px] text-muted-foreground">
                    {t(PROFILE_DESCRIPTION_KEYS[p])}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("settings.appearance.mode.title")}
        help={t("settings.appearance.mode.help")}
        card={false}
      >
        <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {MODE_OPTIONS.map((opt) => {
            const active = mode === opt.value;
            const label = t(opt.labelKey);
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                aria-label={label}
                onClick={() => {
                  void handleMode(opt.value);
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                  active
                    ? "bg-secondary font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.icon}
                {label}
              </button>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("settings.appearance.size.title")}
        help={t("settings.appearance.size.help")}
        card={false}
      >
        <div className="space-y-3">
          <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {FONT_SIZE_PRESETS.map((preset) => {
              const active = isScaleNear(scale, preset.value);
              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={active}
                  aria-label={preset.label}
                  onClick={() => {
                    void applyScale(preset.value);
                  }}
                  className={`inline-flex items-center rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "bg-secondary font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="font-size-custom" className="text-[12px] text-muted-foreground">
              {t("settings.appearance.size.customLabel")}
            </label>
            <input
              id="font-size-custom"
              type="number"
              min={Math.round(FONT_SIZE_MIN * 100)}
              max={Math.round(FONT_SIZE_MAX * 100)}
              step={5}
              value={percentInput}
              onChange={(e) => setPercentInput(e.target.value)}
              onBlur={commitPercentInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitPercentInput();
                }
              }}
              className="h-8 w-20 rounded-md border border-input bg-card px-2 text-[13px] text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <span className="text-[12px] text-muted-foreground">
              {t("settings.appearance.size.percentHint")}
            </span>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
