// OS notification channel (Q20 / P6). Tauri-bound — owns the
// `@tauri-apps/plugin-notification` import that used to live in ipc.ts.
// Body/title strings preserve pre-P6 behavior exactly so the user-visible
// notification text is unchanged.

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { getSettingBool, log, logWarning } from "@/lib/ipc";
import { formatShortDate } from "./format";
import type { NotifyChannel, NotifyEvent } from "./types";

function defaultEnabledFor(eventType: NotifyEvent["type"]): boolean {
  switch (eventType) {
    case "gradesAttention":
      return true;
    case "newHomework":
      return true;
    case "fetchFailed":
      return false;
  }
}

async function ensureNotificationPermission(): Promise<boolean> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const result = await requestPermission();
    granted = result === "granted";
  }
  return granted;
}

async function sendGradesAttention(event: Extract<NotifyEvent, { type: "gradesAttention" }>) {
  const parts: string[] = [];
  if (event.attentionCount > 0) {
    parts.push(
      `${event.attentionCount} class${event.attentionCount > 1 ? "es" : ""} need attention`,
    );
  }
  if (event.missingCount > 0) {
    parts.push(`${event.missingCount} missing assignment${event.missingCount > 1 ? "s" : ""}`);
  }
  if (parts.length === 0) return;

  await log(`notification: sent attention=${event.attentionCount} missing=${event.missingCount}`);
  sendNotification({
    title: `${event.childName}: Grade update`,
    body: parts.join(", "),
  });
}

async function sendFetchFailed(event: Extract<NotifyEvent, { type: "fetchFailed" }>) {
  await log(`notification: fetchFailed childName=${event.childName} source=${event.source}`);
  sendNotification({
    title: `${event.childName}: Fetch failed`,
    body: `${event.source}: ${event.error}`,
  });
}

async function sendNewHomework(event: Extract<NotifyEvent, { type: "newHomework" }>) {
  if (event.subjectCount <= 0) return;
  await log(
    `notification: homework childName=${event.childName} date=${event.isoDate} subjects=${event.subjectCount}`,
  );
  sendNotification({
    title: `${event.childName}: New homework`,
    body: `${event.subjectCount} subject${event.subjectCount === 1 ? "" : "s"} posted for ${formatShortDate(event.isoDate)}`,
  });
}

export class OSChannel implements NotifyChannel {
  readonly name = "os";

  async isEnabled(event: NotifyEvent): Promise<boolean> {
    const granted = await ensureNotificationPermission();
    if (!granted) {
      await logWarning("notification: permission not granted, skipping");
      return false;
    }
    return await getSettingBool(`notify.${event.type}.${this.name}`, defaultEnabledFor(event.type));
  }

  async send(event: NotifyEvent): Promise<void> {
    switch (event.type) {
      case "gradesAttention":
        await sendGradesAttention(event);
        return;
      case "newHomework":
        await sendNewHomework(event);
        return;
      case "fetchFailed":
        await sendFetchFailed(event);
        return;
    }
  }
}
