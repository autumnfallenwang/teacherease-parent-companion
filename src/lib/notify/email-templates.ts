// Refresh-digest email template (Q21 / Q27 / Q28). Pure render module —
// RefreshDigest in, subject + text + html out. Template literals only
// (no Jinja / Handlebars).
//
// Inline CSS only — Gmail mobile strips <style> blocks but keeps style
// attrs. No CSS custom properties (`var(--x)`) in email output; hex only.

import { formatDate, type Locale, translate } from "@/lib/i18n";
import type { HomeworkRecord } from "@/lib/ipc";
import { buildHeroLine } from "./os-channel";
import type { ChildDigest, RefreshDigest } from "./types";

export interface RenderedEmail {
  subject: string;
  textBody: string;
  htmlBody: string;
}

const MAX_ATTENTION_ITEMS = 10;

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** HH:MM via the active locale's date formatter — replaces hand-rolled
 *  zero-pad so the output reads e.g. "10:30" / "10:30 PM" depending on the
 *  user's chosen locale. */
function formatHHmm(locale: Locale, d: Date): string {
  return formatDate(locale, d, { hour: "2-digit", minute: "2-digit" });
}

/** Render ISO `YYYY-MM-DD` as a short locale date. Replaces the hand-rolled
 *  M/D formatter — Spanish renders "4 mar" / Chinese renders "3月4日". */
function formatIsoShort(locale: Locale, iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return iso;
  const year = Number.parseInt(match[1] ?? "0", 10);
  const month = Number.parseInt(match[2] ?? "0", 10);
  const day = Number.parseInt(match[3] ?? "0", 10);
  if (!year || !month || !day) return iso;
  // Note: month is 1-indexed in ISO, 0-indexed in Date.
  return formatDate(locale, new Date(year, month - 1, day), { month: "short", day: "numeric" });
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

function renderChildHeroRowHtml(c: ChildDigest, locale: Locale): string {
  const isOk = c.hero.attentionCount === 0;
  const { bg, icon, iconColor, titleColor } = isOk ? HERO_STYLE.ok : HERO_STYLE.attention;

  const titleBody = isOk
    ? // biome-ignore lint/security/noSecrets: catalog key, not a secret
      translate(locale, "notify.email.heroAllCaughtUp")
    : translate(
        locale,
        c.hero.attentionCount === 1
          ? "notify.email.heroAttention.one"
          : "notify.email.heroAttention.other",
        { count: c.hero.attentionCount },
      );

  const meta: string[] = [
    translate(locale, "notify.email.heroMeeting", { count: c.hero.meetingCount }),
  ];
  if (c.homeworkConfigured) {
    meta.push(
      translate(locale, "notify.email.heroHomeworkForToday", { count: c.homeworkForToday.length }),
    );
    meta.push(
      translate(locale, "notify.email.heroHomeworkDueToday", { count: c.homeworkDueToday.length }),
    );
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
function renderChildDetailHtml(c: ChildDigest, locale: Locale): string {
  const header = `<h2 style="margin: 0 0 10px; font-size: 15px; color: #111827;">${escapeHtml(c.childName)}</h2>`;
  const attentionBlock = renderAttentionBlockHtml(c, locale);
  const homeworkBlocks = c.homeworkConfigured ? renderHomeworkBlocksHtml(c, locale) : "";
  return `<section style="margin: 0 0 20px; padding: 12px 0 0; border-top: 1px solid #e5e7eb;">
      ${header}
      ${attentionBlock}
      ${homeworkBlocks}
    </section>`;
}

function renderAttentionRowHtml(item: ChildDigest["attention"][number], locale: Locale): string {
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
  // The locale parameter is currently unused inside the row but reserved
  // for future per-row prose if needed.
  void locale;
  return `<li style="margin: 0 0 6px; list-style: none; font-size: 13px; color: #111827; line-height: 1.5;">
        <span style="color: ${iconColor};">${icon}</span> <strong>${escapeHtml(item.assignment.name)}</strong><span style="color: #9ca3af;"> · </span><span style="color: #6b7280;">${escapeHtml(item.className)}</span>${trail}
      </li>`;
}

function renderAttentionBlockHtml(c: ChildDigest, locale: Locale): string {
  const attentionHeadingText = translate(locale, "notify.email.attentionHeading");
  const heading = `<h3 style="margin: 4px 0 8px; font-size: 13px; color: #374151; text-transform: uppercase; letter-spacing: 0.04em;"><span style="color: #b45309;">${ICON_ATTENTION_HEADING}</span> ${escapeHtml(attentionHeadingText)}</h3>`;
  if (c.attention.length === 0) {
    const emptyText = translate(locale, "notify.email.attentionEmpty", {
      childName: c.childName,
    });
    return `${heading}<p style="margin: 0 0 8px; color: #9ca3af; font-size: 13px;">${escapeHtml(emptyText)}</p>`;
  }
  const shown = c.attention.slice(0, MAX_ATTENTION_ITEMS);
  const items = shown.map((item) => renderAttentionRowHtml(item, locale)).join("\n        ");
  const moreText =
    c.attention.length > MAX_ATTENTION_ITEMS
      ? translate(locale, "notify.email.attentionMore", {
          count: c.attention.length - MAX_ATTENTION_ITEMS,
        })
      : "";
  const more = moreText
    ? `<li style="color: #9ca3af; font-size: 12px; list-style: none; margin-top: 4px;">${escapeHtml(moreText)}</li>`
    : "";
  return `${heading}<ul style="margin: 0 0 12px; padding: 0;">
        ${items}
        ${more}
      </ul>`;
}

function renderHomeworkItemsHtml(rows: readonly HomeworkRecord[], locale: Locale): string {
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
          `<span style="color: #6b7280; font-size: 12px;">${ICON_DUE} ${escapeHtml(formatIsoShort(locale, hw.dueDate))}${hw.dueDateInferred ? "*" : ""}</span>`,
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
  locale: Locale,
): string {
  const heading = `<h3 style="margin: 4px 0 8px; font-size: 13px; color: #374151; text-transform: uppercase; letter-spacing: 0.04em;"><span style="color: #1d4ed8;">${icon}</span> ${escapeHtml(title)}</h3>`;
  if (rows.length === 0) {
    return `${heading}<p style="margin: 0 0 8px; color: #9ca3af; font-size: 13px;">${escapeHtml(emptyText)}</p>`;
  }
  return `${heading}<ul style="margin: 0 0 8px; padding: 0;">
        ${renderHomeworkItemsHtml(rows, locale)}
      </ul>`;
}

function renderHomeworkBlocksHtml(c: ChildDigest, locale: Locale): string {
  const forTitle = translate(locale, "notify.email.homeworkForTodayHeading");
  const forEmpty = translate(locale, "notify.email.homeworkForTodayEmpty");
  const dueTitle = translate(locale, "notify.email.homeworkDueTodayHeading");
  const dueEmpty = translate(locale, "notify.email.homeworkDueTodayEmpty");
  return `${renderHomeworkSectionHtml(forTitle, c.homeworkForToday, forEmpty, ICON_HOMEWORK_FOR, locale)}
      ${renderHomeworkSectionHtml(dueTitle, c.homeworkDueToday, dueEmpty, ICON_HOMEWORK_DUE, locale)}`;
}

function renderHtml(d: RefreshDigest, locale: Locale): string {
  const heroLine = buildHeroLine(d, locale);
  const generated = formatHHmm(locale, new Date(d.generatedAt));
  const heroRows = d.children.map((c) => renderChildHeroRowHtml(c, locale)).join("\n    ");
  const detailSections = d.children.map((c) => renderChildDetailHtml(c, locale)).join("\n    ");
  const checkedText = translate(locale, "notify.email.checked", { time: generated });
  const footerText = translate(locale, "notify.email.footer", { time: generated });

  return `<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif; margin: 0; padding: 24px; background: #f3f4f6; color: #111827;">
  <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 24px;">
    <h1 style="margin: 0 0 4px; font-size: 18px; color: #111827;">${escapeHtml(heroLine)}</h1>
    <p style="color: #9ca3af; margin: 0 0 16px; font-size: 12px;">${escapeHtml(checkedText)}</p>
    ${heroRows}
    <div style="margin-top: 16px;">
      ${detailSections}
    </div>
    <p style="margin: 24px 0 0; color: #9ca3af; font-size: 11px;">${escapeHtml(footerText)}</p>
  </div>
</body>
</html>`;
}

function renderChildHomeworkText(
  title: string,
  rows: readonly HomeworkRecord[],
  emptyLine: string,
  locale: Locale,
): readonly string[] {
  if (rows.length === 0) return [`  ${title}: ${emptyLine.trim()}`];
  const parts: string[] = [`  ${title}:`];
  for (const hw of rows) {
    const bits = [hw.subject];
    if (hw.content) bits.push(hw.content);
    if (hw.dueDate) {
      bits.push(
        translate(locale, "notify.email.dueShort", { date: formatIsoShort(locale, hw.dueDate) }) +
          (hw.dueDateInferred ? "*" : ""),
      );
    }
    parts.push(`    - ${bits.join(" · ")}`);
  }
  return parts;
}

function renderChildAttentionText(c: ChildDigest, locale: Locale): readonly string[] {
  const attentionHeading = translate(locale, "notify.email.attentionHeading");
  if (c.attention.length === 0) {
    return [
      `  ${attentionHeading}: ${translate(locale, "notify.email.attentionEmpty", { childName: c.childName })}`,
    ];
  }
  const parts: string[] = [`  ${attentionHeading}:`];
  const reasonMissing = translate(locale, "notify.email.attentionReasonMissing");
  const reasonLow = translate(locale, "notify.email.attentionReasonLowScore");
  for (const item of c.attention.slice(0, MAX_ATTENTION_ITEMS)) {
    const reason = item.reason === "missing" ? reasonMissing : reasonLow;
    const trailBits: string[] = [];
    if (item.reason !== "missing" && item.assignment.grade) {
      trailBits.push(item.assignment.grade);
    }
    if (item.assignment.dueDate) {
      trailBits.push(translate(locale, "notify.email.dueShort", { date: item.assignment.dueDate }));
    }
    const trail = trailBits.length > 0 ? ` · ${trailBits.join(" · ")}` : "";
    parts.push(`    [${reason}] ${item.assignment.name} · ${item.className}${trail}`);
  }
  if (c.attention.length > MAX_ATTENTION_ITEMS) {
    parts.push(
      `    (${translate(locale, "notify.email.attentionMore", {
        count: c.attention.length - MAX_ATTENTION_ITEMS,
      })})`,
    );
  }
  return parts;
}

function renderChildHeroRowText(c: ChildDigest, locale: Locale): readonly string[] {
  const titleBody =
    c.hero.attentionCount === 0
      ? // biome-ignore lint/security/noSecrets: catalog key, not a secret
        translate(locale, "notify.email.heroAllCaughtUp")
      : translate(
          locale,
          c.hero.attentionCount === 1
            ? "notify.email.heroAttention.one"
            : "notify.email.heroAttention.other",
          { count: c.hero.attentionCount },
        );
  const parts: string[] = [
    `${c.childName}: ${titleBody}`,
    `  ${translate(locale, "notify.email.heroMeeting", { count: c.hero.meetingCount })}`,
  ];
  if (c.homeworkConfigured) {
    parts.push(
      `  ${translate(locale, "notify.email.heroHomeworkForToday", { count: c.homeworkForToday.length })}`,
    );
    parts.push(
      `  ${translate(locale, "notify.email.heroHomeworkDueToday", { count: c.homeworkDueToday.length })}`,
    );
  }
  return parts;
}

function renderChildDetailText(c: ChildDigest, locale: Locale): readonly string[] {
  const parts: string[] = ["---", c.childName, ""];
  parts.push(...renderChildAttentionText(c, locale));
  if (c.homeworkConfigured) {
    parts.push("");
    const forTitle = translate(locale, "notify.email.homeworkForTodayHeading");
    const forEmpty = translate(locale, "notify.email.homeworkForTodayEmpty");
    const dueTitle = translate(locale, "notify.email.homeworkDueTodayHeading");
    const dueEmpty = translate(locale, "notify.email.homeworkDueTodayEmpty");
    parts.push(...renderChildHomeworkText(forTitle, c.homeworkForToday, forEmpty, locale));
    parts.push(...renderChildHomeworkText(dueTitle, c.homeworkDueToday, dueEmpty, locale));
  }
  parts.push("");
  return parts;
}

function renderText(d: RefreshDigest, locale: Locale): string {
  const heroLine = buildHeroLine(d, locale);
  const titlePrefix = translate(locale, "notify.email.titlePrefix");
  const parts: string[] = [`${titlePrefix}: ${heroLine}`, ""];

  // Hero rows first (stacked), then detail sections — mirrors the email HTML.
  for (const c of d.children) {
    parts.push(...renderChildHeroRowText(c, locale));
    parts.push("");
  }
  for (const c of d.children) {
    parts.push(...renderChildDetailText(c, locale));
  }

  return parts.join("\n").trimEnd();
}

export function renderDigestEmail(d: RefreshDigest, locale: Locale): RenderedEmail {
  const subject = translate(locale, "notify.email.subject", { heroLine: buildHeroLine(d, locale) });
  return {
    subject,
    textBody: renderText(d, locale),
    htmlBody: renderHtml(d, locale),
  };
}
