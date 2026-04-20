"use client";

// Unified Notifications panel (Phase 19 CF5). Absorbs the old "Email"
// sub-tab so parents see every output channel in one place. Adds the notify
// schedule (time picker + Send digest now) per Q29.

import { Clock, Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SettingsEmailSection } from "@/components/settings-email-section";
import { SCHEDULES_CHANGED_EVENT, SEND_DIGEST_NOW_EVENT } from "@/components/shell/schedulers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getSettingBool,
  getSettingString,
  log,
  logErr,
  setSettingBool,
  setSettingString,
} from "@/lib/ipc";
import { OSChannel } from "@/lib/notify/os-channel";
import { buildSyntheticDigest } from "@/lib/notify/synthetic";
import { NOTIFY_TIME_DEFAULT, parseNotifyTime } from "@/lib/schedule/notify-schedule";

const OS_KEY = "notify.refreshDigest.os";
const OS_DEFAULT_ENABLED = true;
const NOTIFY_TIME_KEY = "notify.time";
const NOTIFY_NEXT_RUN_KEY = "notify.nextRunAt";

function formatLocal(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export function SettingsNotifications() {
  const [osEnabled, setOsEnabled] = useState<boolean>(OS_DEFAULT_ENABLED);
  const [osTesting, setOsTesting] = useState(false);
  const [osTestResult, setOsTestResult] = useState<{ kind: "ok" | "err"; message: string } | null>(
    null,
  );

  const [notifyTime, setNotifyTime] = useState<string>(NOTIFY_TIME_DEFAULT);
  const [notifyTimeDraft, setNotifyTimeDraft] = useState<string>(NOTIFY_TIME_DEFAULT);
  const [notifyNextRunAt, setNotifyNextRunAt] = useState<string | null>(null);

  const [sendingDigest, setSendingDigest] = useState(false);
  const [digestResult, setDigestResult] = useState<{ kind: "ok" | "err"; message: string } | null>(
    null,
  );

  const reloadNextRun = useCallback(async () => {
    const iso = await getSettingString(NOTIFY_NEXT_RUN_KEY, "");
    setNotifyNextRunAt(iso || null);
  }, []);

  useEffect(() => {
    void (async () => {
      const [os, time] = await Promise.all([
        getSettingBool(OS_KEY, OS_DEFAULT_ENABLED),
        getSettingString(NOTIFY_TIME_KEY, NOTIFY_TIME_DEFAULT),
      ]);
      setOsEnabled(os);
      const parsedTime = parseNotifyTime(time);
      setNotifyTime(parsedTime);
      setNotifyTimeDraft(parsedTime);
      await reloadNextRun();
    })();
  }, [reloadNextRun]);

  const toggleOs = async (next: boolean) => {
    await setSettingBool(OS_KEY, next);
    await log(`settings: ${OS_KEY}=${next ? 1 : 0}`);
    setOsEnabled(next);
  };

  const handleOsTest = async () => {
    setOsTesting(true);
    setOsTestResult(null);
    try {
      await new OSChannel().send(buildSyntheticDigest());
      setOsTestResult({ kind: "ok", message: "Sent — check your system's notification tray." });
    } catch (err) {
      await logErr(
        `settings: test notification failed ${err instanceof Error ? err.message : "unknown"}`,
      );
      setOsTestResult({
        kind: "err",
        message: err instanceof Error ? err.message : "Couldn't send test notification.",
      });
    } finally {
      setOsTesting(false);
    }
  };

  const commitNotifyTime = () => {
    const parsed = parseNotifyTime(notifyTimeDraft);
    setNotifyTimeDraft(parsed);
    if (parsed === notifyTime) return;
    setNotifyTime(parsed);
    void (async () => {
      try {
        await setSettingString(NOTIFY_TIME_KEY, parsed);
        await log(`settings: ${NOTIFY_TIME_KEY}=${parsed}`);
        window.dispatchEvent(new CustomEvent(SCHEDULES_CHANGED_EVENT));
        // Give scheduler a moment to write the new nextRunAt, then refresh.
        setTimeout(() => void reloadNextRun(), 500);
      } catch (e) {
        await logErr(
          `settings: notify.time save failed — ${e instanceof Error ? e.message : "unknown"}`,
        );
      }
    })();
  };

  const handleSendDigestNow = () => {
    setSendingDigest(true);
    setDigestResult(null);
    window.dispatchEvent(new CustomEvent(SEND_DIGEST_NOW_EVENT));
    // The scheduler handles the dispatch; we can't know exactly when it
    // finishes, so just show a short confirmation after a small delay.
    setTimeout(() => {
      setSendingDigest(false);
      setDigestResult({
        kind: "ok",
        message: "Dispatched via your enabled channels — check them now.",
      });
      setTimeout(() => setDigestResult(null), 5000);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* OS */}
      <section className="space-y-3">
        <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">Desktop</p>
        <div className="divide-y divide-border rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">OS digest</p>
              <p className="text-[12px] text-muted-foreground">
                A hero-level desktop notification at the scheduled time — what needs attention,
                today's homework counts.
              </p>
            </div>
            <Switch
              checked={osEnabled}
              onChange={(next) => {
                void toggleOs(next);
              }}
              aria-label="Refresh digest desktop notifications"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleOsTest}
            disabled={osTesting}
            className="gap-1.5"
          >
            {osTesting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {osTesting ? "Sending..." : "Send test OS notification"}
          </Button>
          {osTestResult && (
            <p
              className={`text-[12px] ${
                osTestResult.kind === "ok" ? "text-muted-foreground" : "text-destructive"
              }`}
            >
              {osTestResult.message}
            </p>
          )}
        </div>
        <p className="px-1 text-[11px] text-muted-foreground">
          Fires a sample digest (Sample Student A/B) directly through the OS channel, bypassing the
          toggle above.
        </p>
      </section>

      {/* Email */}
      <section className="space-y-3">
        <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">Email</p>
        <SettingsEmailSection />
      </section>

      {/* Schedule */}
      <section className="space-y-3">
        <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">Schedule</p>
        <div className="space-y-3 rounded-lg border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-[14px] font-medium">Notification time</h2>
          </div>
          <p className="text-[12px] text-muted-foreground">
            One notification per day at this local time. Draws from whatever's in the database —
            fetch runs on its own schedule.
          </p>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="notify-time" className="text-[13px]">
                Time
              </Label>
              <Input
                id="notify-time"
                type="time"
                value={notifyTimeDraft}
                onChange={(e) => setNotifyTimeDraft(e.target.value)}
                onBlur={commitNotifyTime}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitNotifyTime();
                  }
                }}
                className="h-9 w-32 rounded-lg"
              />
            </div>
            <p className="pb-2 text-[12px] text-muted-foreground">
              Next run:{" "}
              <span className="font-medium text-foreground">{formatLocal(notifyNextRunAt)}</span>
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-[14px] font-medium">Send digest now</h2>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Builds a digest from current data and dispatches through your enabled channels (respects
            the toggles above). Useful to preview what the next scheduled notification will look
            like.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={sendingDigest}
              onClick={handleSendDigestNow}
              className="gap-1.5"
            >
              {sendingDigest && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {sendingDigest ? "Sending…" : "Send digest now"}
            </Button>
            {digestResult && (
              <p
                className={`text-[12px] ${
                  digestResult.kind === "ok" ? "text-muted-foreground" : "text-destructive"
                }`}
              >
                {digestResult.message}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
