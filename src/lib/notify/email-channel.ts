// Email notification channel (Q4 / E1 + E2 / Q27). SMTP via the Rust
// `send_email` Tauri command — webviews can't speak raw TCP. Only imports
// from `@/lib/ipc`, keeping the biome noRestrictedImports rule happy.
//
// Post-Q27: one RefreshDigest in, one multipart email out. Template lives
// in `./email-templates`; this module is transport glue.

import type { Locale } from "@/lib/i18n";
import { getSettingBool, getSettingString, getSmtpPassword, sendEmail } from "@/lib/ipc";
import { renderDigestEmail } from "./email-templates";
import type { NotifyChannel, RefreshDigest } from "./types";

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  from: string;
  to: string;
  password: string;
}

const DEFAULT_ENABLED = false;

async function loadSmtpConfig(): Promise<SmtpConfig | null> {
  const host = await getSettingString("smtp.host", "");
  if (!host) return null;
  const portStr = await getSettingString("smtp.port", "");
  const port = Number.parseInt(portStr, 10);
  if (!Number.isFinite(port) || port <= 0) return null;
  const username = await getSettingString("smtp.username", "");
  const from = await getSettingString("smtp.from", "");
  const to = await getSettingString("smtp.to", "");
  if (!username || !from || !to) return null;
  const password = await getSmtpPassword();
  if (!password) return null;
  return { host, port, username, from, to, password };
}

export class EmailChannel implements NotifyChannel {
  readonly name = "email";

  async isEnabled(_digest: RefreshDigest): Promise<boolean> {
    const cfg = await loadSmtpConfig();
    if (!cfg) return false;
    return await getSettingBool(`notify.refreshDigest.${this.name}`, DEFAULT_ENABLED);
  }

  async send(digest: RefreshDigest, locale: Locale): Promise<void> {
    const cfg = await loadSmtpConfig();
    if (!cfg) throw new Error("SMTP not configured");
    const rendered = renderDigestEmail(digest, locale);
    await sendEmail({
      host: cfg.host,
      port: cfg.port,
      username: cfg.username,
      password: cfg.password,
      from: cfg.from,
      to: cfg.to,
      subject: rendered.subject,
      body: rendered.textBody,
      htmlBody: rendered.htmlBody,
    });
  }
}
