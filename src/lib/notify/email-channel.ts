// Email notification channel (Q4 / E1 + E2). SMTP via the Rust `send_email`
// Tauri command — webviews can't speak raw TCP. Only imports from `@/lib/ipc`,
// keeping the biome noRestrictedImports rule happy without a new override.
//
// E1 shipped plaintext-only bodies; E2 added per-event HTML + plaintext
// multipart templates via `./email-templates`. This module is now purely the
// transport glue: load SMTP config → render via templates → invoke sendEmail.

import { getSettingBool, getSettingString, getSmtpPassword, sendEmail } from "@/lib/ipc";
import { renderEmail } from "./email-templates";
import type { NotifyChannel, NotifyEvent } from "./types";

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  from: string;
  to: string;
  password: string;
}

// Email defaults to off for every event — user opts in after configuring SMTP.
function defaultEnabledFor(_eventType: NotifyEvent["type"]): boolean {
  return false;
}

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

  async isEnabled(event: NotifyEvent): Promise<boolean> {
    const cfg = await loadSmtpConfig();
    if (!cfg) return false;
    return await getSettingBool(`notify.${event.type}.${this.name}`, defaultEnabledFor(event.type));
  }

  async send(event: NotifyEvent): Promise<void> {
    const cfg = await loadSmtpConfig();
    if (!cfg) throw new Error("SMTP not configured");
    const rendered = renderEmail(event);
    if (!rendered) return;
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
