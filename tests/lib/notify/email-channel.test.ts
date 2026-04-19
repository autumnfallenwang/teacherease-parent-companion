import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ipc", () => ({
  getSettingBool: vi.fn(),
  getSettingString: vi.fn(),
  getSmtpPassword: vi.fn(),
  sendEmail: vi.fn(() => Promise.resolve()),
}));

import * as ipc from "@/lib/ipc";
import { buildRefreshDigest } from "@/lib/notify/digest";
import { EmailChannel } from "@/lib/notify/email-channel";
import type { ChildDigest, DigestFailure, RefreshDigest } from "@/lib/notify/types";

const FIXED_NOW = new Date("2026-04-19T12:00:00Z");

function emptyDigest(): RefreshDigest {
  return buildRefreshDigest({
    children: [],
    perChildDetails: new Map(),
    perChildHomeworkForToday: new Map(),
    perChildHomeworkDueToday: new Map(),
    perChildHeroCounts: new Map(),
    failures: [],
    cfg: { forgivenessWeeks: 2, lowScoreThreshold: 3 },
    now: FIXED_NOW,
  });
}

function makeDigest(overrides: {
  children: readonly ChildDigest[];
  failures?: readonly DigestFailure[];
}): RefreshDigest {
  const base = emptyDigest();
  const failures = overrides.failures ?? [];
  const teFailedIds = new Set(
    failures.filter((f) => f.source === "teacherease").map((f) => f.childId),
  );
  let childCount = 0;
  let attentionCount = 0;
  let meetingCount = 0;
  let notAssessedCount = 0;
  let homeworkForTodayCount = 0;
  let homeworkDueTodayCount = 0;
  for (const c of overrides.children) {
    if (c.hero && !teFailedIds.has(c.childId)) {
      childCount += 1;
      attentionCount += c.hero.attentionCount;
      meetingCount += c.hero.meetingCount;
      notAssessedCount += c.hero.notAssessedCount;
      homeworkForTodayCount += c.homeworkForToday.length;
      homeworkDueTodayCount += c.homeworkDueToday.length;
    }
  }
  return {
    ...base,
    family: {
      childCount,
      attentionCount,
      meetingCount,
      notAssessedCount,
      homeworkForTodayCount,
      homeworkDueTodayCount,
    },
    children: overrides.children,
    failures,
  };
}

function mockSmtpConfigured(password: string | null = "secret") {
  const values: Record<string, string> = {
    "smtp.host": "smtp.gmail.com",
    "smtp.port": "587",
    "smtp.username": "parent@example.com",
    "smtp.from": "parent@example.com",
    "smtp.to": "parent@example.com",
  };
  vi.mocked(ipc.getSettingString).mockImplementation((key) => Promise.resolve(values[key] ?? ""));
  vi.mocked(ipc.getSmtpPassword).mockResolvedValue(password);
}

function mockSmtpUnconfigured() {
  vi.mocked(ipc.getSettingString).mockResolvedValue("");
  vi.mocked(ipc.getSmtpPassword).mockResolvedValue(null);
}

describe("EmailChannel.isEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when SMTP is not configured", async () => {
    mockSmtpUnconfigured();
    const ch = new EmailChannel();
    expect(await ch.isEnabled(emptyDigest())).toBe(false);
    expect(ipc.getSettingBool).not.toHaveBeenCalled();
  });

  it("returns false when keychain password is missing", async () => {
    mockSmtpConfigured(null);
    const ch = new EmailChannel();
    expect(await ch.isEnabled(emptyDigest())).toBe(false);
  });

  it("returns false when the user toggle is off (default)", async () => {
    mockSmtpConfigured();
    vi.mocked(ipc.getSettingBool).mockResolvedValue(false);
    const ch = new EmailChannel();
    expect(await ch.isEnabled(emptyDigest())).toBe(false);
    expect(ipc.getSettingBool).toHaveBeenCalledWith("notify.refreshDigest.email", false);
  });

  it("returns true when SMTP is configured and the toggle is on", async () => {
    mockSmtpConfigured();
    vi.mocked(ipc.getSettingBool).mockResolvedValue(true);
    const ch = new EmailChannel();
    expect(await ch.isEnabled(emptyDigest())).toBe(true);
  });
});

describe("EmailChannel.send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSmtpConfigured();
  });

  it("renders a full digest with failures + attention + homework", async () => {
    const childA: ChildDigest = {
      childId: 1,
      childName: "Alex",
      hero: {
        attentionCount: 2,
        attentionClassNames: ["Math", "English"],
        meetingCount: 6,
        notAssessedCount: 0,
      },
      attention: [],
      homeworkConfigured: true,
      homeworkForToday: [
        {
          id: 10,
          childId: 1,
          hwDate: "2026-04-19",
          subject: "Math",
          content: "Chapter 4",
          dueDate: null,
          dueDateInferred: false,
          scrapedAt: "2026-04-19T12:00:00Z",
        },
      ],
      homeworkDueToday: [],
    };
    const childB: ChildDigest = {
      childId: 2,
      childName: "Sam",
      hero: {
        attentionCount: 0,
        attentionClassNames: [],
        meetingCount: 0,
        notAssessedCount: 0,
      },
      attention: [],
      homeworkConfigured: false,
      homeworkForToday: [],
      homeworkDueToday: [],
    };
    const digest = makeDigest({ children: [childA, childB] });

    const ch = new EmailChannel();
    await ch.send(digest);

    const call = vi.mocked(ipc.sendEmail).mock.calls[0]?.[0];
    expect(call).toBeDefined();
    // Subject reflects the family aggregate — no failure language (D-18).
    expect(call?.subject).toContain("TeacherEase Parent Companion:");
    expect(call?.subject).not.toContain("fetch failed");
    expect(call?.body).not.toContain("Couldn't refresh");
    expect(call?.body).toContain("Alex");
    expect(call?.body).toContain("Sam");
    expect(call?.body).toContain("Math");
    expect(call?.htmlBody).toContain("<!doctype html>");
    expect(call?.htmlBody).not.toContain("Couldn't refresh");
    expect(call?.htmlBody).toContain("Alex");
    expect(call?.htmlBody).toContain("Sam");
  });

  it("renders soft empty states for an all-clean digest", async () => {
    const childA: ChildDigest = {
      childId: 1,
      childName: "Alex",
      hero: {
        attentionCount: 0,
        attentionClassNames: [],
        meetingCount: 8,
        notAssessedCount: 0,
      },
      attention: [],
      homeworkConfigured: true,
      homeworkForToday: [],
      homeworkDueToday: [],
    };
    const digest = makeDigest({ children: [childA] });

    const ch = new EmailChannel();
    await ch.send(digest);

    const call = vi.mocked(ipc.sendEmail).mock.calls[0]?.[0];
    // Single-child digest → subject names the child (B-10).
    expect(call?.subject).toContain("Alex");
    expect(call?.subject.toLowerCase()).toContain("all caught up");
    expect(call?.htmlBody).toContain("Nothing needs attention for Alex");
    expect(call?.htmlBody).toContain("No homework for today");
    expect(call?.htmlBody).toContain("Nothing due today");
  });

  it("never shows fetch-failure language in the digest (D-18)", async () => {
    // The digest mirrors StatusHero — it shows DB state, not this cycle's
    // fetch success/failure. A child whose TE has never succeeded just
    // renders zeros; the `failures` field may carry details for logging
    // but nothing in the email references them.
    const childA: ChildDigest = {
      childId: 1,
      childName: "Alex",
      hero: {
        attentionCount: 0,
        attentionClassNames: [],
        meetingCount: 0,
        notAssessedCount: 0,
      },
      attention: [],
      homeworkConfigured: false,
      homeworkForToday: [],
      homeworkDueToday: [],
    };
    const failures: DigestFailure[] = [
      { childId: 1, childName: "Alex", source: "teacherease", error: "boom" },
    ];
    const digest = makeDigest({ children: [childA], failures });

    const ch = new EmailChannel();
    await ch.send(digest);

    const call = vi.mocked(ipc.sendEmail).mock.calls[0]?.[0];
    expect(call?.subject).not.toContain("fetch failed");
    expect(call?.htmlBody).not.toContain("couldn't refresh");
    expect(call?.htmlBody).not.toContain("Couldn&#39;t refresh");
    expect(call?.htmlBody).not.toContain("boom");
    expect(call?.htmlBody).not.toContain("Couldn't refresh");
    // Alex still gets a hero row with zero counts (Today-tab parity).
    expect(call?.htmlBody).toContain("Alex: All caught up");
    expect(call?.htmlBody).toContain("0 meeting");
    // Homework subsections hidden when child isn't configured.
    expect(call?.htmlBody).not.toContain("Homework for today");
  });

  it("skips homework subsections when child has no homework URL configured (D-16)", async () => {
    const childA: ChildDigest = {
      childId: 1,
      childName: "Alex",
      hero: {
        attentionCount: 0,
        attentionClassNames: [],
        meetingCount: 3,
        notAssessedCount: 0,
      },
      attention: [],
      homeworkConfigured: false,
      homeworkForToday: [],
      homeworkDueToday: [],
    };
    const digest = makeDigest({ children: [childA] });

    const ch = new EmailChannel();
    await ch.send(digest);

    const call = vi.mocked(ipc.sendEmail).mock.calls[0]?.[0];
    expect(call?.htmlBody).not.toContain("Homework for today");
    expect(call?.htmlBody).not.toContain("Homework due today");
  });

  it("escapes HTML in child names", async () => {
    const childA: ChildDigest = {
      childId: 1,
      childName: "<Mal>",
      hero: {
        attentionCount: 0,
        attentionClassNames: [],
        meetingCount: 0,
        notAssessedCount: 0,
      },
      attention: [],
      homeworkConfigured: true,
      homeworkForToday: [],
      homeworkDueToday: [],
    };
    const digest = makeDigest({ children: [childA] });

    const ch = new EmailChannel();
    await ch.send(digest);

    const call = vi.mocked(ipc.sendEmail).mock.calls[0]?.[0];
    expect(call?.htmlBody).toContain("&lt;Mal&gt;");
    expect(call?.htmlBody).not.toContain("<Mal>");
  });

  it("throws when SMTP is not configured at send time", async () => {
    mockSmtpUnconfigured();
    const ch = new EmailChannel();
    await expect(ch.send(emptyDigest())).rejects.toThrow("SMTP not configured");
  });

  it("propagates sendEmail failures so the router can catch them", async () => {
    vi.mocked(ipc.sendEmail).mockRejectedValue(new Error("auth failed"));
    const ch = new EmailChannel();
    await expect(ch.send(emptyDigest())).rejects.toThrow("auth failed");
  });
});
