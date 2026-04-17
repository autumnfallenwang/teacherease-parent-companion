// Per-event email templates (Q4 / E2). Pure render module — NotifyEvent in,
// subject + text + html out. Template literals only (no Jinja / Handlebars).
//
// Scope: renders the event-level summary. Rich per-assignment drilldown
// would require expanding `NotifyEvent` to carry GradeRecord / AssignmentRecord
// arrays; deferred to a later phase (daily-digest feature, not notifications).
//
// All inline CSS — Gmail mobile strips `<style>` blocks but keeps style attrs.

import { formatShortDate } from "./format";
import type { NotifyEvent } from "./types";

export interface RenderedEmail {
  subject: string;
  textBody: string;
  htmlBody: string;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

interface Layout {
  title: string;
  childName: string;
  accentBg: string;
  accentFg: string;
  contentHtml: string;
}

function layout({ title, childName, accentBg, accentFg, contentHtml }: Layout): string {
  return `<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif; margin: 0; padding: 24px; background: #f3f4f6; color: #111827;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 24px;">
    <h1 style="margin: 0 0 4px; font-size: 18px; color: #111827;">${escapeHtml(title)}</h1>
    <p style="color: #6b7280; margin: 0 0 16px; font-size: 13px;">${escapeHtml(childName)}</p>
    <div style="padding: 16px; border-radius: 6px; background: ${accentBg}; color: ${accentFg}; font-size: 14px; line-height: 1.5;">
      ${contentHtml}
    </div>
    <p style="margin: 24px 0 0; color: #9ca3af; font-size: 11px;">TeacherEase Parent Companion · local notification</p>
  </div>
</body>
</html>`;
}

function renderGradesAttention(
  event: Extract<NotifyEvent, { type: "gradesAttention" }>,
): RenderedEmail | null {
  const parts: string[] = [];
  if (event.attentionCount > 0) {
    parts.push(
      `${event.attentionCount} class${event.attentionCount > 1 ? "es" : ""} need attention`,
    );
  }
  if (event.missingCount > 0) {
    parts.push(`${event.missingCount} missing assignment${event.missingCount > 1 ? "s" : ""}`);
  }
  if (parts.length === 0) return null;

  const textBody = parts.join(", ");
  const contentHtml = parts
    .map((line) => `<p style="margin: 0 0 8px; font-weight: 500;">${escapeHtml(line)}</p>`)
    .join("\n      ");

  return {
    subject: `${event.childName}: Grade update`,
    textBody,
    htmlBody: layout({
      title: "Grade update",
      childName: event.childName,
      accentBg: "#fef2f2",
      accentFg: "#991b1b",
      contentHtml: `${contentHtml}\n      <p style="margin: 12px 0 0; font-size: 12px; color: #7f1d1d;">Open TeacherEase Parent Companion for details.</p>`,
    }),
  };
}

function renderNewHomework(
  event: Extract<NotifyEvent, { type: "newHomework" }>,
): RenderedEmail | null {
  if (event.subjectCount <= 0) return null;
  const when = formatShortDate(event.isoDate);
  const summary = `${event.subjectCount} subject${event.subjectCount === 1 ? "" : "s"} posted for ${when}`;
  const contentHtml = `<p style="margin: 0; font-weight: 500;">${escapeHtml(summary)}</p>`;

  return {
    subject: `${event.childName}: New homework`,
    textBody: summary,
    htmlBody: layout({
      title: "New homework",
      childName: event.childName,
      accentBg: "#eff6ff",
      accentFg: "#1e3a8a",
      contentHtml,
    }),
  };
}

function renderFetchFailed(event: Extract<NotifyEvent, { type: "fetchFailed" }>): RenderedEmail {
  const textBody = `${event.source}: ${event.error}`;
  const contentHtml = `<p style="margin: 0 0 8px;"><strong>${escapeHtml(event.source)}</strong> failed</p>
      <pre style="margin: 0; padding: 8px; background: #f3f4f6; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #374151; white-space: pre-wrap; word-break: break-word;">${escapeHtml(event.error)}</pre>`;

  return {
    subject: `${event.childName}: Fetch failed`,
    textBody,
    htmlBody: layout({
      title: "Fetch failed",
      childName: event.childName,
      accentBg: "#f9fafb",
      accentFg: "#374151",
      contentHtml,
    }),
  };
}

export function renderEmail(event: NotifyEvent): RenderedEmail | null {
  switch (event.type) {
    case "gradesAttention":
      return renderGradesAttention(event);
    case "newHomework":
      return renderNewHomework(event);
    case "fetchFailed":
      return renderFetchFailed(event);
  }
}
