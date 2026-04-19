"use client";

import { Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  deleteSmtpPassword,
  getSettingBool,
  getSettingString,
  getSmtpPassword,
  log,
  logErr,
  setSettingBool,
  setSettingString,
  setSmtpPassword,
} from "@/lib/ipc";
import { EmailChannel } from "@/lib/notify/email-channel";
import { buildSyntheticDigest } from "@/lib/notify/synthetic";

const EMAIL_KEY = "notify.refreshDigest.email";
const EMAIL_DEFAULT_ENABLED = false;

type TestStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "ok" }
  | { kind: "error"; msg: string };

function hasCompleteConfig(form: {
  host: string;
  port: string;
  username: string;
  from: string;
  to: string;
  hasSavedPassword: boolean;
}): boolean {
  const port = Number.parseInt(form.port, 10);
  return Boolean(
    form.host.trim() &&
      Number.isFinite(port) &&
      port > 0 &&
      form.username.trim() &&
      form.from.trim() &&
      form.to.trim() &&
      form.hasSavedPassword,
  );
}

export function SettingsEmail() {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [username, setUsername] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [password, setPassword] = useState("");
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const [emailEnabled, setEmailEnabled] = useState<boolean>(EMAIL_DEFAULT_ENABLED);
  const [testStatus, setTestStatus] = useState<TestStatus>({ kind: "idle" });

  useEffect(() => {
    void Promise.all([
      getSettingString("smtp.host", ""),
      getSettingString("smtp.port", ""),
      getSettingString("smtp.username", ""),
      getSettingString("smtp.from", ""),
      getSettingString("smtp.to", ""),
      getSmtpPassword(),
      getSettingBool(EMAIL_KEY, EMAIL_DEFAULT_ENABLED),
    ]).then(([h, p, u, f, t, pw, emailOn]) => {
      setHost(h);
      setPort(p);
      setUsername(u);
      setFrom(f);
      setTo(t);
      setHasSavedPassword(pw !== null);
      setEmailEnabled(emailOn);
    });
  }, []);

  const validate = (): boolean => {
    const next: Partial<Record<string, string>> = {};
    if (!host.trim()) next.host = "Required.";
    const p = Number.parseInt(port, 10);
    if (!Number.isFinite(p) || p <= 0 || p > 65535) next.port = "Enter a port between 1 and 65535.";
    if (!username.trim()) next.username = "Required.";
    if (!from.trim() || !from.includes("@")) next.from = "Enter an email address.";
    if (!to.trim() || !to.includes("@")) next.to = "Enter an email address.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await setSettingString("smtp.host", host.trim());
      await setSettingString("smtp.port", String(Number.parseInt(port, 10)));
      await setSettingString("smtp.username", username.trim());
      await setSettingString("smtp.from", from.trim());
      await setSettingString("smtp.to", to.trim());
      if (password) {
        await setSmtpPassword(password);
        setHasSavedPassword(true);
        setPassword("");
      }
      await log(`settings: smtp saved host=${host.trim()} port=${Number.parseInt(port, 10)}`);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3000);
    } catch (e) {
      await logErr(`settings: smtp save failed ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePassword = async () => {
    await deleteSmtpPassword();
    setHasSavedPassword(false);
    setPassword("");
    await log("settings: smtp password removed");
  };

  const toggleEmail = async (next: boolean) => {
    await setSettingBool(EMAIL_KEY, next);
    await log(`settings: ${EMAIL_KEY}=${next ? 1 : 0}`);
    setEmailEnabled(next);
  };

  const handleSendTest = async () => {
    setTestStatus({ kind: "sending" });
    try {
      await new EmailChannel().send(buildSyntheticDigest());
      setTestStatus({ kind: "ok" });
      await log("settings: smtp test email sent");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setTestStatus({ kind: "error", msg });
      await logErr(`settings: smtp test email failed: ${msg}`);
    }
    setTimeout(() => setTestStatus({ kind: "idle" }), 5000);
  };

  const configComplete = hasCompleteConfig({ host, port, username, from, to, hasSavedPassword });

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-lg border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div>
          <h2 className="text-[14px] font-medium">SMTP server</h2>
          <p className="text-[12px] text-muted-foreground">
            BYO SMTP — we never relay through a server. Password stays on this computer, in the OS
            keychain.
          </p>
        </div>

        <div className="grid grid-cols-[1fr_100px] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="smtp-host" className="text-[13px]">
              Host
            </Label>
            <Input
              id="smtp-host"
              placeholder="smtp.gmail.com"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              aria-invalid={Boolean(errors.host)}
              className="h-9 rounded-lg"
            />
            {errors.host && <p className="text-[12px] text-destructive">{errors.host}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-port" className="text-[13px]">
              Port
            </Label>
            <Input
              id="smtp-port"
              type="number"
              placeholder="587"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              aria-invalid={Boolean(errors.port)}
              className="h-9 rounded-lg"
            />
            {errors.port && <p className="text-[12px] text-destructive">{errors.port}</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="smtp-username" className="text-[13px]">
            Username
          </Label>
          <Input
            id="smtp-username"
            placeholder="you@gmail.com"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={Boolean(errors.username)}
            className="h-9 rounded-lg"
          />
          {errors.username && <p className="text-[12px] text-destructive">{errors.username}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="smtp-from" className="text-[13px]">
              From
            </Label>
            <Input
              id="smtp-from"
              type="email"
              placeholder="you@gmail.com"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-invalid={Boolean(errors.from)}
              className="h-9 rounded-lg"
            />
            {errors.from && <p className="text-[12px] text-destructive">{errors.from}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="smtp-to" className="text-[13px]">
              To
            </Label>
            <Input
              id="smtp-to"
              type="email"
              placeholder="you@gmail.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-invalid={Boolean(errors.to)}
              className="h-9 rounded-lg"
            />
            {errors.to && <p className="text-[12px] text-destructive">{errors.to}</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="smtp-password" className="text-[13px]">
              Password
            </Label>
            {hasSavedPassword && (
              <button
                type="button"
                onClick={() => {
                  void handleRemovePassword();
                }}
                className="text-[12px] text-muted-foreground hover:text-destructive"
              >
                Remove saved password
              </button>
            )}
          </div>
          <Input
            id="smtp-password"
            type="password"
            placeholder={
              hasSavedPassword ? "Enter to change (existing kept if left blank)" : "App password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-9 rounded-lg"
          />
          {hasSavedPassword && (
            <p className="text-[12px] text-meeting">Saved password present in keychain.</p>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => {
              void handleSave();
            }}
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
          {savedToast && <p className="text-[12px] text-meeting">Saved.</p>}
        </div>
      </section>

      <section className="space-y-2">
        <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">Email</p>
        <div
          className={`divide-y divide-border rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
            configComplete ? "" : "opacity-60"
          }`}
        >
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Refresh digest</p>
              <p className="text-[12px] text-muted-foreground">
                Detailed per-child email after every refresh — attention list, tonight's homework,
                and any failures.
              </p>
            </div>
            <Switch
              checked={emailEnabled}
              disabled={!configComplete}
              onChange={(next) => {
                void toggleEmail(next);
              }}
              aria-label="Refresh digest email notifications"
            />
          </div>
        </div>
        {!configComplete && (
          <p className="px-1 text-[12px] text-muted-foreground">
            Configure SMTP above to enable email notifications.
          </p>
        )}
      </section>

      <section className="space-y-2 rounded-lg border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[14px] font-medium">Send a test email</h2>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Uses your saved SMTP config and sends a simple test message to the configured recipient.
        </p>
        <div className="flex items-center gap-3 pt-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!configComplete || testStatus.kind === "sending"}
            onClick={() => {
              void handleSendTest();
            }}
          >
            {testStatus.kind === "sending" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Sending…
              </>
            ) : (
              "Send test email"
            )}
          </Button>
          {testStatus.kind === "ok" && <p className="text-[12px] text-meeting">Test email sent.</p>}
          {testStatus.kind === "error" && (
            <p className="text-[12px] text-destructive">Failed: {testStatus.msg}</p>
          )}
        </div>
      </section>

      <p className="px-1 text-[11px] text-muted-foreground">
        For Gmail, use an App Password (2-step verification required).{" "}
        <Link
          href="/gmail-app-password"
          className="text-primary underline-offset-4 hover:underline"
        >
          Setup guide →
        </Link>
      </p>
    </div>
  );
}
