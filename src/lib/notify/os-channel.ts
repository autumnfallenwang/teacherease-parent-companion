// OS notification channel (Q21 / Q27). Renders a RefreshDigest as a
// single hero-level desktop toast. One title + body string — no per-child
// loop. Title format: "TeacherEase Parent Companion: <hero line>".

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { getSettingBool, log, logWarning } from "@/lib/ipc";
import type { NotifyChannel, RefreshDigest } from "./types";

const TITLE_PREFIX = "TeacherEase Parent Companion";
const DEFAULT_ENABLED = true;
const MAX_LINE_CHARS = 90;

async function ensureNotificationPermission(): Promise<boolean> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const result = await requestPermission();
    granted = result === "granted";
  }
  return granted;
}

export function buildHeroLine(d: RefreshDigest): string {
  const soleChildName = d.family.childCount === 1 ? (d.children[0]?.childName ?? null) : null;
  if (d.family.attentionCount > 0) {
    const w = d.family.attentionCount === 1 ? "class" : "classes";
    if (d.family.childCount <= 1) {
      const prefix = soleChildName ? `${soleChildName}: ` : "";
      return `${prefix}${d.family.attentionCount} ${w} need attention`;
    }
    return `${d.family.attentionCount} ${w} need attention across ${d.family.childCount} children`;
  }
  if (d.family.childCount > 0) {
    if (d.family.childCount === 1) {
      return soleChildName ? `${soleChildName}: all caught up` : "All caught up";
    }
    return `All caught up for ${d.family.childCount} children`;
  }
  return "Refresh complete";
}

function clip(s: string, max: number = MAX_LINE_CHARS): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function buildBody(d: RefreshDigest): string {
  // Mirrors the Today tab's StatusHero: pure data-driven summary — no
  // mention of fetch success/failure (D-18). Title carries the attention
  // verdict; body carries the numeric counts.
  if (d.family.childCount === 0) return "Everything's clean.";
  return [
    `${d.family.meetingCount} meeting`,
    `${d.family.homeworkForTodayCount} homework for today`,
    `${d.family.homeworkDueTodayCount} homework due today`,
  ]
    .map((line) => clip(line))
    .join("\n");
}

export class OSChannel implements NotifyChannel {
  readonly name = "os";

  async isEnabled(_digest: RefreshDigest): Promise<boolean> {
    const granted = await ensureNotificationPermission();
    if (!granted) {
      await logWarning("notification: permission not granted, skipping");
      return false;
    }
    return await getSettingBool(`notify.refreshDigest.${this.name}`, DEFAULT_ENABLED);
  }

  async send(digest: RefreshDigest): Promise<void> {
    const title = `${TITLE_PREFIX}: ${buildHeroLine(digest)}`;
    const body = buildBody(digest);
    await log(
      `notification: digest children=${digest.family.childCount} attention=${digest.family.attentionCount} hwForToday=${digest.family.homeworkForTodayCount} hwDueToday=${digest.family.homeworkDueTodayCount}`,
    );
    sendNotification({ title, body });
  }
}
