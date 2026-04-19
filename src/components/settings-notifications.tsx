"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getSettingBool, log, logErr, setSettingBool } from "@/lib/ipc";
import { OSChannel } from "@/lib/notify/os-channel";
import { buildSyntheticDigest } from "@/lib/notify/synthetic";

const KEY = "notify.refreshDigest.os";
const DEFAULT_ENABLED = true;

export function SettingsNotifications() {
  const [enabled, setEnabled] = useState<boolean>(DEFAULT_ENABLED);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ kind: "ok" | "err"; message: string } | null>(
    null,
  );

  useEffect(() => {
    void getSettingBool(KEY, DEFAULT_ENABLED).then(setEnabled);
  }, []);

  const toggle = async (next: boolean) => {
    await setSettingBool(KEY, next);
    await log(`settings: ${KEY}=${next ? 1 : 0}`);
    setEnabled(next);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await new OSChannel().send(buildSyntheticDigest());
      setTestResult({ kind: "ok", message: "Sent — check your system's notification tray." });
    } catch (err) {
      await logErr(
        `settings: test notification failed ${err instanceof Error ? err.message : "unknown"}`,
      );
      setTestResult({
        kind: "err",
        message: err instanceof Error ? err.message : "Couldn't send test notification.",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">Desktop</p>
        <div className="divide-y divide-border rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Refresh digest</p>
              <p className="text-[12px] text-muted-foreground">
                One hero-level desktop notification after every refresh — what needs attention,
                tonight's homework, any failures.
              </p>
            </div>
            <Switch
              checked={enabled}
              onChange={(next) => {
                void toggle(next);
              }}
              aria-label="Refresh digest desktop notifications"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleTest}
            disabled={testing}
            className="gap-1.5"
          >
            {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {testing ? "Sending..." : "Send test notification"}
          </Button>
          {testResult && (
            <p
              className={`text-[12px] ${
                testResult.kind === "ok" ? "text-muted-foreground" : "text-destructive"
              }`}
            >
              {testResult.message}
            </p>
          )}
        </div>
        <p className="px-1 text-[11px] text-muted-foreground">
          Fires a sample digest (Sample Student A/B) directly through the OS channel, bypassing the
          toggle above. Confirms your OS is delivering notifications from this app.
        </p>
      </div>
    </div>
  );
}
