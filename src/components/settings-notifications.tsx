"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getSettingBool, log, logErr, sendTestOSNotification, setSettingBool } from "@/lib/ipc";

type EventKey = "gradesAttention" | "newHomework" | "fetchFailed";

const ROWS: Array<{ key: EventKey; label: string; help: string }> = [
  {
    key: "gradesAttention",
    label: "Grade changes",
    help: "Notify when classes need attention or missing assignments appear.",
  },
  {
    key: "newHomework",
    label: "New homework",
    help: "Notify when homework is posted for a new day.",
  },
  {
    key: "fetchFailed",
    label: "Fetch failures",
    help: "Notify when a scrape fails. Useful for debugging; noisier than the other two.",
  },
];

const DEFAULTS: Record<EventKey, boolean> = {
  gradesAttention: true,
  newHomework: true,
  fetchFailed: false,
};

export function SettingsNotifications() {
  const [values, setValues] = useState<Partial<Record<EventKey, boolean>>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ kind: "ok" | "err"; message: string } | null>(
    null,
  );

  useEffect(() => {
    void Promise.all(
      ROWS.map(
        async (r) => [r.key, await getSettingBool(`notify.${r.key}.os`, DEFAULTS[r.key])] as const,
      ),
    ).then((pairs) => {
      const next: Partial<Record<EventKey, boolean>> = {};
      for (const [k, v] of pairs) next[k] = v;
      setValues(next);
    });
  }, []);

  const toggle = async (key: EventKey, next: boolean) => {
    await setSettingBool(`notify.${key}.os`, next);
    await log(`settings: notify.${key}.os=${next ? 1 : 0}`);
    setValues((v) => ({ ...v, [key]: next }));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await sendTestOSNotification();
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
          {ROWS.map((r) => (
            <div key={r.key} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{r.label}</p>
                <p className="text-[12px] text-muted-foreground">{r.help}</p>
              </div>
              <Switch
                checked={values[r.key] ?? DEFAULTS[r.key]}
                onChange={(next) => {
                  void toggle(r.key, next);
                }}
                aria-label={`${r.label} desktop notifications`}
              />
            </div>
          ))}
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
          Bypasses scraping and the per-event toggles above — useful for confirming your OS grants
          desktop notifications to this app.
        </p>
      </div>
    </div>
  );
}
