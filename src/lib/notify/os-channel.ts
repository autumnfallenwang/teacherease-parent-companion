// OS notification channel (Q21 / Q27). Renders a RefreshDigest as a
// single hero-level desktop toast. One title + body string — no per-child
// loop. Title format: "TeacherEase Parent Companion: <hero line>".

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { type Locale, translate } from "@/lib/i18n";
import { getSettingBool, log, logWarning } from "@/lib/ipc";
import type { NotifyChannel, RefreshDigest } from "./types";

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

export function buildHeroLine(d: RefreshDigest, locale: Locale): string {
  const soleChildName = d.family.childCount === 1 ? (d.children[0]?.childName ?? null) : null;
  if (d.family.attentionCount > 0) {
    if (d.family.childCount <= 1) {
      if (soleChildName) {
        return translate(
          locale,
          d.family.attentionCount === 1
            ? "notify.os.heroAttentionForChild.one"
            : "notify.os.heroAttentionForChild.other",
          { childName: soleChildName, count: d.family.attentionCount },
        );
      }
      return translate(
        locale,
        d.family.attentionCount === 1
          ? "notify.os.heroAttention.one"
          : "notify.os.heroAttention.other",
        { count: d.family.attentionCount },
      );
    }
    return translate(
      locale,
      d.family.attentionCount === 1
        ? "notify.os.heroAttentionAcrossChildren.one"
        : "notify.os.heroAttentionAcrossChildren.other",
      { count: d.family.attentionCount, childCount: d.family.childCount },
    );
  }
  if (d.family.childCount > 0) {
    if (d.family.childCount === 1) {
      return soleChildName
        ? // biome-ignore lint/security/noSecrets: catalog key, not a secret
          translate(locale, "notify.os.heroAllCaughtUpForChild", { childName: soleChildName })
        : // biome-ignore lint/security/noSecrets: catalog key, not a secret
          translate(locale, "notify.os.heroAllCaughtUp");
    }
    // biome-ignore lint/security/noSecrets: catalog key, not a secret
    return translate(locale, "notify.os.heroAllCaughtUpForChildren", {
      count: d.family.childCount,
    });
  }
  return translate(locale, "notify.os.refreshComplete");
}

function clip(s: string, max: number = MAX_LINE_CHARS): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function buildBody(d: RefreshDigest, locale: Locale): string {
  // Mirrors the Today tab's StatusHero: pure data-driven summary — no
  // mention of fetch success/failure (D-18). Title carries the attention
  // verdict; body carries the numeric counts.
  if (d.family.childCount === 0) return translate(locale, "notify.os.bodyEverythingClean");
  return [
    translate(locale, "notify.os.bodyMeeting", { count: d.family.meetingCount }),
    translate(locale, "notify.os.bodyHomeworkForToday", {
      count: d.family.homeworkForTodayCount,
    }),
    translate(locale, "notify.os.bodyHomeworkDueToday", {
      count: d.family.homeworkDueTodayCount,
    }),
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

  async send(digest: RefreshDigest, locale: Locale): Promise<void> {
    const titlePrefix = translate(locale, "notify.os.titlePrefix");
    const title = `${titlePrefix}: ${buildHeroLine(digest, locale)}`;
    const body = buildBody(digest, locale);
    await log(
      `notification: digest children=${digest.family.childCount} attention=${digest.family.attentionCount} hwForToday=${digest.family.homeworkForTodayCount} hwDueToday=${digest.family.homeworkDueTodayCount}`,
    );
    sendNotification({ title, body });
  }
}
