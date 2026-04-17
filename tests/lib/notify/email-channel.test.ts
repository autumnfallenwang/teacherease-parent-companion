import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ipc", () => ({
  getSettingBool: vi.fn(),
  getSettingString: vi.fn(),
  getSmtpPassword: vi.fn(),
  sendEmail: vi.fn(() => Promise.resolve()),
}));

import * as ipc from "@/lib/ipc";
import { EmailChannel } from "@/lib/notify/email-channel";
import type { NotifyEvent } from "@/lib/notify/types";

const gradesEvent: NotifyEvent = {
  type: "gradesAttention",
  childName: "Alex",
  attentionCount: 2,
  missingCount: 1,
};

const homeworkEvent: NotifyEvent = {
  type: "newHomework",
  childName: "Alex",
  isoDate: "2026-04-17",
  subjectCount: 3,
};

const fetchFailedEvent: NotifyEvent = {
  type: "fetchFailed",
  childName: "Alex",
  source: "teacherease",
  error: "Network timeout",
};

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
    expect(await ch.isEnabled(gradesEvent)).toBe(false);
    expect(ipc.getSettingBool).not.toHaveBeenCalled();
  });

  it("returns false when keychain password is missing", async () => {
    mockSmtpConfigured(null);
    const ch = new EmailChannel();
    expect(await ch.isEnabled(gradesEvent)).toBe(false);
  });

  it("returns false when the user toggle is off (default)", async () => {
    mockSmtpConfigured();
    vi.mocked(ipc.getSettingBool).mockResolvedValue(false);
    const ch = new EmailChannel();
    expect(await ch.isEnabled(gradesEvent)).toBe(false);
    expect(ipc.getSettingBool).toHaveBeenCalledWith("notify.gradesAttention.email", false);
  });

  it("returns true when SMTP is configured and the toggle is on", async () => {
    mockSmtpConfigured();
    vi.mocked(ipc.getSettingBool).mockResolvedValue(true);
    const ch = new EmailChannel();
    expect(await ch.isEnabled(gradesEvent)).toBe(true);
  });
});

describe("EmailChannel.send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches gradesAttention with expected subject, text, and html", async () => {
    mockSmtpConfigured();
    const ch = new EmailChannel();
    await ch.send(gradesEvent);
    expect(ipc.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        port: 587,
        username: "parent@example.com",
        from: "parent@example.com",
        to: "parent@example.com",
        password: "secret",
        subject: "Alex: Grade update",
        body: "2 classes need attention, 1 missing assignment",
        htmlBody: expect.stringContaining("<html"),
      }),
    );
  });

  it("dispatches newHomework with formatted date body + html", async () => {
    mockSmtpConfigured();
    const ch = new EmailChannel();
    await ch.send(homeworkEvent);
    expect(ipc.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Alex: New homework",
        body: expect.stringMatching(/^3 subjects posted for /),
        htmlBody: expect.stringContaining("<html"),
      }),
    );
  });

  it("dispatches fetchFailed with source and error in body + html", async () => {
    mockSmtpConfigured();
    const ch = new EmailChannel();
    await ch.send(fetchFailedEvent);
    expect(ipc.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Alex: Fetch failed",
        body: "teacherease: Network timeout",
        htmlBody: expect.stringContaining("<html"),
      }),
    );
  });

  it("skips sending when gradesAttention has zero counts", async () => {
    mockSmtpConfigured();
    const ch = new EmailChannel();
    await ch.send({
      type: "gradesAttention",
      childName: "Alex",
      attentionCount: 0,
      missingCount: 0,
    });
    expect(ipc.sendEmail).not.toHaveBeenCalled();
  });

  it("throws when SMTP is not configured at send time", async () => {
    mockSmtpUnconfigured();
    const ch = new EmailChannel();
    await expect(ch.send(gradesEvent)).rejects.toThrow("SMTP not configured");
  });

  it("propagates sendEmail failures so the router can catch them", async () => {
    mockSmtpConfigured();
    vi.mocked(ipc.sendEmail).mockRejectedValue(new Error("auth failed"));
    const ch = new EmailChannel();
    await expect(ch.send(gradesEvent)).rejects.toThrow("auth failed");
  });
});
