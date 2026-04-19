import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("@/lib/ipc", () => ({
  getSettingBool: vi.fn(),
  log: vi.fn(() => Promise.resolve()),
  logWarning: vi.fn(() => Promise.resolve()),
}));

import * as plugin from "@tauri-apps/plugin-notification";
import * as ipc from "@/lib/ipc";
import { buildRefreshDigest } from "@/lib/notify/digest";
import { buildBody, buildHeroLine, OSChannel } from "@/lib/notify/os-channel";
import type { ChildDigest, DigestFailure, FamilyHero, RefreshDigest } from "@/lib/notify/types";

const FIXED_NOW = new Date("2026-04-19T12:00:00Z");

function baseDigest(partial: {
  family?: Partial<FamilyHero>;
  children?: readonly ChildDigest[];
  failures?: readonly DigestFailure[];
}): RefreshDigest {
  const base = buildRefreshDigest({
    children: [],
    perChildDetails: new Map(),
    perChildHomeworkForToday: new Map(),
    perChildHomeworkDueToday: new Map(),
    perChildHeroCounts: new Map(),
    failures: [],
    cfg: { forgivenessWeeks: 2, lowScoreThreshold: 3 },
    now: FIXED_NOW,
  });
  return {
    ...base,
    family: {
      childCount: 0,
      attentionCount: 0,
      meetingCount: 0,
      notAssessedCount: 0,
      homeworkForTodayCount: 0,
      homeworkDueTodayCount: 0,
      ...(partial.family ?? {}),
    },
    children: partial.children ?? [],
    failures: partial.failures ?? [],
  };
}

describe("buildHeroLine", () => {
  it("surfaces attention count across children", () => {
    const d = baseDigest({
      family: { childCount: 2, attentionCount: 3 },
    });
    expect(buildHeroLine(d)).toBe("3 classes need attention across 2 children");
  });

  it("uses singular 'class' and single-child phrasing", () => {
    const d = baseDigest({
      family: { childCount: 1, attentionCount: 1 },
    });
    expect(buildHeroLine(d)).toBe("1 class need attention");
  });

  it("says 'All caught up' when no attention and some children", () => {
    const d1 = baseDigest({ family: { childCount: 1 } });
    expect(buildHeroLine(d1)).toBe("All caught up");
    const d2 = baseDigest({ family: { childCount: 3 } });
    expect(buildHeroLine(d2)).toBe("All caught up for 3 children");
  });

  it("falls back to generic when family is empty", () => {
    const d = baseDigest({});
    expect(buildHeroLine(d)).toBe("Refresh complete");
  });

  it("never surfaces failure language even when failures are populated (D-18)", () => {
    const d = baseDigest({
      failures: [{ childId: 1, childName: "Alex", source: "teacherease", error: "login broke" }],
      family: { childCount: 1, attentionCount: 0 },
    });
    expect(buildHeroLine(d)).not.toContain("fetch failed");
    expect(buildHeroLine(d)).toBe("All caught up");
  });
});

describe("buildBody", () => {
  it("renders the 3-line numeric hero (meeting + hw for today + hw due today)", () => {
    const d = baseDigest({
      family: {
        childCount: 1,
        attentionCount: 2,
        meetingCount: 5,
        homeworkForTodayCount: 2,
        homeworkDueTodayCount: 1,
      },
    });
    expect(buildBody(d)).toBe("5 meeting\n2 homework for today\n1 homework due today");
  });

  it("falls back to 'Everything's clean.' when childCount is 0", () => {
    const d = baseDigest({ family: { childCount: 0 } });
    expect(buildBody(d)).toBe("Everything's clean.");
  });

  it("never surfaces failure info even when failures are populated (D-18)", () => {
    const d = baseDigest({
      failures: [
        { childId: 1, childName: "Alex", source: "teacherease", error: "a" },
        { childId: 2, childName: "Sam", source: "teacherease", error: "b" },
      ],
      family: { childCount: 1, homeworkForTodayCount: 3, homeworkDueTodayCount: 0 },
    });
    const body = buildBody(d);
    expect(body).not.toContain("Alex");
    expect(body).not.toContain("teacherease");
    expect(body).toContain("3 homework for today");
  });
});

describe("OSChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isEnabled returns false when permission denied", async () => {
    vi.mocked(plugin.isPermissionGranted).mockResolvedValue(false);
    vi.mocked(plugin.requestPermission).mockResolvedValue("denied");
    const ch = new OSChannel();
    expect(await ch.isEnabled(baseDigest({}))).toBe(false);
    expect(ipc.getSettingBool).not.toHaveBeenCalled();
  });

  it("isEnabled reads notify.refreshDigest.os with default true", async () => {
    vi.mocked(plugin.isPermissionGranted).mockResolvedValue(true);
    vi.mocked(ipc.getSettingBool).mockResolvedValue(true);
    const ch = new OSChannel();
    expect(await ch.isEnabled(baseDigest({}))).toBe(true);
    expect(ipc.getSettingBool).toHaveBeenCalledWith("notify.refreshDigest.os", true);
  });

  it("send calls sendNotification with composed title + body", async () => {
    vi.mocked(plugin.isPermissionGranted).mockResolvedValue(true);
    vi.mocked(ipc.getSettingBool).mockResolvedValue(true);
    const ch = new OSChannel();
    const d = baseDigest({ family: { childCount: 1 } });
    await ch.send(d);
    expect(plugin.sendNotification).toHaveBeenCalledWith({
      title: "TeacherEase Parent Companion: All caught up",
      body: "0 meeting\n0 homework for today\n0 homework due today",
    });
  });
});
