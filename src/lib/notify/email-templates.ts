// Refresh-digest email template (Q21 / Q27 / Q28). Pure render module —
// RefreshDigest in, subject + text + html out. Template literals only
// (no Jinja / Handlebars).
//
// Inline CSS only — Gmail mobile strips <style> blocks but keeps style
// attrs. No CSS custom properties (`var(--x)`) in email output; hex only.

import type { HomeworkRecord } from "@/lib/ipc";
import { buildHeroLine } from "./os-channel";
import type { ChildDigest, RefreshDigest } from "./types";

export interface RenderedEmail {
  subject: string;
  textBody: string;
  htmlBody: string;
}

const TITLE_PREFIX = "TeacherEase Parent Companion";
const MAX_ATTENTION_ITEMS = 10;

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatHHmm(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Render ISO `YYYY-MM-DD` as `M/D` (matches the Today tab's formatDueChip). */
function formatIsoShort(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  const month = Number.parseInt(match[2] ?? "0", 10);
  const day = Number.parseInt(match[3] ?? "0", 10);
  if (!month || !day) return iso;
  return `${month}/${day}`;
}

/** 1:1 mapping with Today-tab Lucide icons — emoji portable across
 *  Gmail / Outlook / Apple Mail.
 *
 *  AlertTriangle → ⚠ (Attention heading)
 *  BookX         → 📕 (missing attention item)
 *  TrendingDown  → 📉 (low-score attention item)
 *  Clock         → 🕐 (due-date chip)
 *  BookOpen      → 📖 ("Homework for today" heading)
 *  Target        → 🎯 ("Homework due today" heading)
 */
const ICON_ATTENTION_HEADING = "⚠";
const ICON_MISSING = "📕";
const ICON_LOW_SCORE = "📉";
const ICON_DUE = "🕐";
const ICON_HOMEWORK_FOR = "📖";
const ICON_HOMEWORK_DUE = "🎯";

/** Per-child hero row — mirrors StatusHero's rounded card on the Today tab.
 *  Green when attention=0, amber when attention>0. No failure variant —
 *  Today tab doesn't show fetch failures in its hero, so neither do we (D-18). */
interface HeroStyle {
  bg: string;
  icon: string;
  iconColor: string;
  titleColor: string;
}
const HERO_STYLE: Record<"ok" | "attention", HeroStyle> = {
  ok: { bg: "#ecfdf5", icon: "✓", iconColor: "#059669", titleColor: "#065f46" },
  attention: { bg: "#fffbeb", icon: "⚠", iconColor: "#b45309", titleColor: "#111827" },
};

function renderChildHeroRowHtml(c: ChildDigest): string {
  const isOk = c.hero.attentionCount === 0;
  const { bg, icon, iconColor, titleColor } = isOk ? HERO_STYLE.ok : HERO_STYLE.attention;

  const titleBody = isOk
    ? "All caught up"
    : `${c.hero.attentionCount} class${c.hero.attentionCount === 1 ? "" : "es"} need attention`;

  const meta: string[] = [`${c.hero.meetingCount} meeting`];
  if (c.homeworkConfigured) {
    meta.push(`${c.homeworkForToday.length} homework for today`);
    meta.push(`${c.homeworkDueToday.length} homework due today`);
  }
  const metaLines = meta
    .map(
      (line) =>
        `<p style="margin: 2px 0 0; color: #6b7280; font-size: 13px;">${escapeHtml(line)}</p>`,
    )
    .join("\n      ");

  return `<div style="padding: 12px 16px; border-radius: 8px; background: ${bg}; margin: 0 0 10px;">
      <p style="margin: 0; font-weight: 600; font-size: 15px; color: ${titleColor};">
        <span style="color: ${iconColor};">${icon}</span> ${escapeHtml(c.childName)}: ${escapeHtml(titleBody)}
      </p>
      ${metaLines}
    </div>`;
}

/** Per-child detail section (attention list + homework subsections).
 *  Rendered BELOW the stacked hero rows — the Today tab shows both areas
 *  in sequence for the selected child; the email shows them per child
 *  after all heroes so the parent can scan the summary first. */
function renderChildDetailHtml(c: ChildDigest): string {
  const header = `<h2 style="margin: 0 0 10px; font-size: 15px; color: #111827;">${escapeHtml(c.childName)}</h2>`;
  const attentionBlock = renderAttentionBlockHtml(c);
  const homeworkBlocks = c.homeworkConfigured ? renderHomeworkBlocksHtml(c) : "";
  return `<section style="margin: 0 0 20px; padding: 12px 0 0; border-top: 1px solid #e5e7eb;">
      ${header}
      ${attentionBlock}
      ${homeworkBlocks}
    </section>`;
}

function renderAttentionRowHtml(item: ChildDigest["attention"][number]): string {
  const icon = item.reason === "missing" ? ICON_MISSING : ICON_LOW_SCORE;
  const iconColor = item.reason === "missing" ? "#b45309" : "#9a3412";
  // One line per item: icon · name · class · [grade] · [🕐 due]. Date always
  // last so the eye lands on it at the same column across every row (B-15).
  const trailParts: string[] = [];
  if (item.reason !== "missing" && item.assignment.grade) {
    trailParts.push(
      `<span style="color: #6b7280; font-weight: 600;">${escapeHtml(item.assignment.grade)}</span>`,
    );
  }
  if (item.assignment.dueDate) {
    trailParts.push(
      `<span style="color: #6b7280;">${ICON_DUE} ${escapeHtml(item.assignment.dueDate)}</span>`,
    );
  }
  const trail =
    trailParts.length > 0
      ? `<span style="color: #9ca3af;"> · </span>${trailParts.join('<span style="color: #9ca3af;"> · </span>')}`
      : "";
  return `<li style="margin: 0 0 6px; list-style: none; font-size: 13px; color: #111827; line-height: 1.5;">
        <span style="color: ${iconColor};">${icon}</span> <strong>${escapeHtml(item.assignment.name)}</strong><span style="color: #9ca3af;"> · </span><span style="color: #6b7280;">${escapeHtml(item.className)}</span>${trail}
      </li>`;
}

function renderAttentionBlockHtml(c: ChildDigest): string {
  const heading = `<h3 style="margin: 4px 0 8px; font-size: 13px; color: #374151; text-transform: uppercase; letter-spacing: 0.04em;"><span style="color: #b45309;">${ICON_ATTENTION_HEADING}</span> Attention</h3>`;
  if (c.attention.length === 0) {
    return `${heading}<p style="margin: 0 0 8px; color: #9ca3af; font-size: 13px;">Nothing needs attention for ${escapeHtml(c.childName)}.</p>`;
  }
  const shown = c.attention.slice(0, MAX_ATTENTION_ITEMS);
  const items = shown.map(renderAttentionRowHtml).join("\n        ");
  const more =
    c.attention.length > MAX_ATTENTION_ITEMS
      ? `<li style="color: #9ca3af; font-size: 12px; list-style: none; margin-top: 4px;">+${c.attention.length - MAX_ATTENTION_ITEMS} more</li>`
      : "";
  return `${heading}<ul style="margin: 0 0 12px; padding: 0;">
        ${items}
        ${more}
      </ul>`;
}

function renderHomeworkItemsHtml(rows: readonly HomeworkRecord[]): string {
  return rows
    .map((hw) => {
      // Order: subject · content · 🕐 due — date always last (B-15).
      const parts: string[] = [`<strong>${escapeHtml(hw.subject)}</strong>`];
      if (hw.content) {
        parts.push(
          `<span style="color: #374151; font-size: 12px;">${escapeHtml(hw.content)}</span>`,
        );
      }
      if (hw.dueDate) {
        parts.push(
          `<span style="color: #6b7280; font-size: 12px;">${ICON_DUE} ${escapeHtml(formatIsoShort(hw.dueDate))}${hw.dueDateInferred ? "*" : ""}</span>`,
        );
      }
      const inline = parts.join('<span style="color: #9ca3af;"> · </span>');
      return `<li style="margin: 0 0 6px; list-style: none; font-size: 13px; color: #111827; line-height: 1.5;">
        ${inline}
      </li>`;
    })
    .join("\n        ");
}

function renderHomeworkSectionHtml(
  title: string,
  rows: readonly HomeworkRecord[],
  emptyText: string,
  icon: string,
): string {
  const heading = `<h3 style="margin: 4px 0 8px; font-size: 13px; color: #374151; text-transform: uppercase; letter-spacing: 0.04em;"><span style="color: #1d4ed8;">${icon}</span> ${title}</h3>`;
  if (rows.length === 0) {
    return `${heading}<p style="margin: 0 0 8px; color: #9ca3af; font-size: 13px;">${emptyText}</p>`;
  }
  return `${heading}<ul style="margin: 0 0 8px; padding: 0;">
        ${renderHomeworkItemsHtml(rows)}
      </ul>`;
}

function renderHomeworkBlocksHtml(c: ChildDigest): string {
  return `${renderHomeworkSectionHtml("Homework for today", c.homeworkForToday, "No homework for today.", ICON_HOMEWORK_FOR)}
      ${renderHomeworkSectionHtml("Homework due today", c.homeworkDueToday, "Nothing due today.", ICON_HOMEWORK_DUE)}`;
}

function renderHtml(d: RefreshDigest): string {
  const heroLine = buildHeroLine(d);
  const generated = formatHHmm(new Date(d.generatedAt));
  const heroRows = d.children.map(renderChildHeroRowHtml).join("\n    ");
  const detailSections = d.children.map(renderChildDetailHtml).join("\n    ");

  return `<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif; margin: 0; padding: 24px; background: #f3f4f6; color: #111827;">
  <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 24px;">
    <h1 style="margin: 0 0 4px; font-size: 18px; color: #111827;">${escapeHtml(heroLine)}</h1>
    <p style="color: #9ca3af; margin: 0 0 16px; font-size: 12px;">Checked ${generated}</p>
    ${heroRows}
    <div style="margin-top: 16px;">
      ${detailSections}
    </div>
    <p style="margin: 24px 0 0; color: #9ca3af; font-size: 11px;">TeacherEase Parent Companion · local notification · generated ${generated}</p>
  </div>
</body>
</html>`;
}

function renderChildHomeworkText(
  title: string,
  rows: readonly HomeworkRecord[],
  emptyLine: string,
): readonly string[] {
  if (rows.length === 0) return [`  ${title}: ${emptyLine.trim()}`];
  const parts: string[] = [`  ${title}:`];
  for (const hw of rows) {
    const bits = [hw.subject];
    if (hw.content) bits.push(hw.content);
    if (hw.dueDate) bits.push(`due ${formatIsoShort(hw.dueDate)}${hw.dueDateInferred ? "*" : ""}`);
    parts.push(`    - ${bits.join(" · ")}`);
  }
  return parts;
}

function renderChildAttentionText(c: ChildDigest): readonly string[] {
  if (c.attention.length === 0) {
    return [`  Attention: Nothing needs attention for ${c.childName}.`];
  }
  const parts: string[] = ["  Attention:"];
  for (const item of c.attention.slice(0, MAX_ATTENTION_ITEMS)) {
    const reason = item.reason === "missing" ? "missing" : "low score";
    const trailBits: string[] = [];
    if (item.reason !== "missing" && item.assignment.grade) {
      trailBits.push(item.assignment.grade);
    }
    if (item.assignment.dueDate) trailBits.push(`due ${item.assignment.dueDate}`);
    const trail = trailBits.length > 0 ? ` · ${trailBits.join(" · ")}` : "";
    parts.push(`    [${reason}] ${item.assignment.name} · ${item.className}${trail}`);
  }
  if (c.attention.length > MAX_ATTENTION_ITEMS) {
    parts.push(`    (+${c.attention.length - MAX_ATTENTION_ITEMS} more)`);
  }
  return parts;
}

function renderChildHeroRowText(c: ChildDigest): readonly string[] {
  const titleBody =
    c.hero.attentionCount === 0
      ? "All caught up"
      : `${c.hero.attentionCount} class(es) need attention`;
  const parts: string[] = [`${c.childName}: ${titleBody}`, `  ${c.hero.meetingCount} meeting`];
  if (c.homeworkConfigured) {
    parts.push(`  ${c.homeworkForToday.length} homework for today`);
    parts.push(`  ${c.homeworkDueToday.length} homework due today`);
  }
  return parts;
}

function renderChildDetailText(c: ChildDigest): readonly string[] {
  const parts: string[] = ["---", c.childName, ""];
  parts.push(...renderChildAttentionText(c));
  if (c.homeworkConfigured) {
    parts.push("");
    parts.push(
      ...renderChildHomeworkText(
        "Homework for today",
        c.homeworkForToday,
        "No homework for today.",
      ),
    );
    parts.push(
      ...renderChildHomeworkText("Homework due today", c.homeworkDueToday, "Nothing due today."),
    );
  }
  parts.push("");
  return parts;
}

function renderText(d: RefreshDigest): string {
  const heroLine = buildHeroLine(d);
  const parts: string[] = [`${TITLE_PREFIX}: ${heroLine}`, ""];

  // Hero rows first (stacked), then detail sections — mirrors the email HTML.
  for (const c of d.children) {
    parts.push(...renderChildHeroRowText(c));
    parts.push("");
  }
  for (const c of d.children) {
    parts.push(...renderChildDetailText(c));
  }

  return parts.join("\n").trimEnd();
}

export function renderDigestEmail(d: RefreshDigest): RenderedEmail {
  const subject = `${TITLE_PREFIX}: ${buildHeroLine(d)}`;
  return {
    subject,
    textBody: renderText(d),
    htmlBody: renderHtml(d),
  };
}
