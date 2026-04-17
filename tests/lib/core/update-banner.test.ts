import { describe, expect, it } from "vitest";
import { shouldCheckNow, shouldShowBanner } from "@/lib/core/update-banner";

describe("shouldShowBanner", () => {
  it("returns false when no update is available", () => {
    expect(shouldShowBanner({ update: null, enabled: true, dismissedVersion: null })).toBe(false);
  });

  it("returns false when the kill-switch is off", () => {
    expect(
      shouldShowBanner({
        update: { version: "0.2.0" },
        enabled: false,
        dismissedVersion: null,
      }),
    ).toBe(false);
  });

  it("returns false when the user dismissed this exact version", () => {
    expect(
      shouldShowBanner({
        update: { version: "0.2.0" },
        enabled: true,
        dismissedVersion: "0.2.0",
      }),
    ).toBe(false);
  });

  it("returns true when dismissedVersion is an older version", () => {
    expect(
      shouldShowBanner({
        update: { version: "0.3.0" },
        enabled: true,
        dismissedVersion: "0.2.0",
      }),
    ).toBe(true);
  });

  it("returns true when no prior dismissal", () => {
    expect(
      shouldShowBanner({
        update: { version: "0.2.0" },
        enabled: true,
        dismissedVersion: null,
      }),
    ).toBe(true);
  });
});

describe("shouldCheckNow", () => {
  const NOW = 1_735_000_000_000; // fixed ms for test stability

  it("returns true when never checked before", () => {
    expect(shouldCheckNow(0, NOW)).toBe(true);
  });

  it("returns false when checked 23 hours ago", () => {
    const twentyThreeHoursAgo = NOW - 23 * 60 * 60 * 1000;
    expect(shouldCheckNow(twentyThreeHoursAgo, NOW)).toBe(false);
  });

  it("returns true when checked exactly 24 hours ago", () => {
    const dayAgo = NOW - 24 * 60 * 60 * 1000;
    expect(shouldCheckNow(dayAgo, NOW)).toBe(true);
  });

  it("returns true when checked a long time ago", () => {
    const weekAgo = NOW - 7 * 24 * 60 * 60 * 1000;
    expect(shouldCheckNow(weekAgo, NOW)).toBe(true);
  });

  it("returns false on clock skew (lastChecked in the future)", () => {
    const future = NOW + 60 * 60 * 1000;
    expect(shouldCheckNow(future, NOW)).toBe(false);
  });
});
