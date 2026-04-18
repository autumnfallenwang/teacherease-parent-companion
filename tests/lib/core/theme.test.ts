import { describe, expect, it } from "vitest";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_PRESETS,
  isScaleNear,
  isThemePreference,
  isThemeProfile,
  PROFILE_CLASSES,
  PROFILE_LABELS,
  parseFontSize,
  resolveTheme,
} from "@/lib/core/theme";

describe("resolveTheme", () => {
  it('returns "light" for preference="light" regardless of system pref', () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
  });

  it('returns "dark" for preference="dark" regardless of system pref', () => {
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it('returns "dark" for preference="system" when system prefers dark', () => {
    expect(resolveTheme("system", true)).toBe("dark");
  });

  it('returns "light" for preference="system" when system prefers light', () => {
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("isThemePreference", () => {
  it("accepts the three valid preferences", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
  });

  it("rejects other strings", () => {
    expect(isThemePreference("sepia")).toBe(false);
    expect(isThemePreference("")).toBe(false);
    expect(isThemePreference("Light")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
    expect(isThemePreference(0)).toBe(false);
    expect(isThemePreference({})).toBe(false);
  });
});

describe("isThemeProfile", () => {
  it("accepts the five valid profiles", () => {
    expect(isThemeProfile("default")).toBe(true);
    expect(isThemeProfile("solarized")).toBe(true);
    expect(isThemeProfile("nord")).toBe(true);
    expect(isThemeProfile("dracula")).toBe(true);
    expect(isThemeProfile("contrast")).toBe(true);
  });

  it("rejects unknown profile names", () => {
    expect(isThemeProfile("monokai")).toBe(false);
    expect(isThemeProfile("rose-pine")).toBe(false);
    expect(isThemeProfile("")).toBe(false);
    expect(isThemeProfile("Default")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isThemeProfile(null)).toBe(false);
    expect(isThemeProfile(undefined)).toBe(false);
    expect(isThemeProfile(0)).toBe(false);
  });
});

describe("PROFILE_CLASSES", () => {
  it("has an entry for every profile", () => {
    const profiles = ["default", "solarized", "nord", "dracula", "contrast"] as const;
    for (const p of profiles) {
      expect(p in PROFILE_CLASSES).toBe(true);
    }
  });

  it('"default" maps to null (no class applied — :root is the default palette)', () => {
    expect(PROFILE_CLASSES.default).toBeNull();
  });

  it("non-default profiles map to matching `.theme-<name>` classes", () => {
    expect(PROFILE_CLASSES.solarized).toBe("theme-solarized");
    expect(PROFILE_CLASSES.nord).toBe("theme-nord");
    expect(PROFILE_CLASSES.dracula).toBe("theme-dracula");
    expect(PROFILE_CLASSES.contrast).toBe("theme-contrast");
  });
});

describe("parseFontSize", () => {
  it("parses a plain numeric string into a number", () => {
    expect(parseFontSize("1")).toBe(1);
    expect(parseFontSize("1.15")).toBe(1.15);
    expect(parseFontSize("1.3")).toBe(1.3);
  });

  it("clamps values below the minimum", () => {
    expect(parseFontSize("0.1")).toBe(FONT_SIZE_MIN);
    expect(parseFontSize("-1")).toBe(FONT_SIZE_MIN);
  });

  it("clamps values above the maximum", () => {
    expect(parseFontSize("5")).toBe(FONT_SIZE_MAX);
    expect(parseFontSize("1000")).toBe(FONT_SIZE_MAX);
  });

  it("falls back to the default on invalid strings", () => {
    expect(parseFontSize("abc")).toBe(FONT_SIZE_DEFAULT);
    expect(parseFontSize("")).toBe(FONT_SIZE_DEFAULT);
  });

  it("falls back to the default on non-string values", () => {
    expect(parseFontSize(null)).toBe(FONT_SIZE_DEFAULT);
    expect(parseFontSize(undefined)).toBe(FONT_SIZE_DEFAULT);
    expect(parseFontSize(1.15)).toBe(FONT_SIZE_DEFAULT);
  });
});

describe("FONT_SIZE_PRESETS", () => {
  it("has three presets labeled Small / Medium / Large", () => {
    expect(FONT_SIZE_PRESETS).toHaveLength(3);
    expect(FONT_SIZE_PRESETS.map((p) => p.label)).toEqual(["Small", "Medium", "Large"]);
  });

  it("starts at 1.0 for Small so the baseline is preserved", () => {
    expect(FONT_SIZE_PRESETS[0]?.value).toBe(1.0);
  });

  it("escalates monotonically from Small to Large", () => {
    const values = FONT_SIZE_PRESETS.map((p) => p.value);
    expect(values[0]).toBeLessThan(values[1] ?? Number.POSITIVE_INFINITY);
    expect(values[1]).toBeLessThan(values[2] ?? Number.POSITIVE_INFINITY);
  });

  it("stays within the clamped bounds", () => {
    for (const p of FONT_SIZE_PRESETS) {
      expect(p.value).toBeGreaterThanOrEqual(FONT_SIZE_MIN);
      expect(p.value).toBeLessThanOrEqual(FONT_SIZE_MAX);
    }
  });
});

describe("isScaleNear", () => {
  it("returns true for exact matches", () => {
    expect(isScaleNear(1, 1)).toBe(true);
  });

  it("returns true within epsilon", () => {
    expect(isScaleNear(1.0, 1.0005)).toBe(true);
  });

  it("returns false outside epsilon", () => {
    expect(isScaleNear(1.0, 1.15)).toBe(false);
    expect(isScaleNear(1.15, 1.3)).toBe(false);
  });
});

describe("PROFILE_LABELS", () => {
  it("has a human-readable label for every profile", () => {
    const profiles = ["default", "solarized", "nord", "dracula", "contrast"] as const;
    for (const p of profiles) {
      expect(PROFILE_LABELS[p]).toBeTruthy();
      expect(typeof PROFILE_LABELS[p]).toBe("string");
    }
  });
});
