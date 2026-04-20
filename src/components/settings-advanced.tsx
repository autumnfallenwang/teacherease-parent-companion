"use client";

import { useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/section";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  clearHistory,
  disableAutostart,
  getSettingBool,
  log,
  logErr,
  setSettingBool,
  setupAutostart,
} from "@/lib/ipc";

export function SettingsAdvanced() {
  const [autostartOn, setAutostartOn] = useState<boolean | null>(null);
  const [updaterOn, setUpdaterOn] = useState<boolean | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearedToast, setClearedToast] = useState(false);

  useEffect(() => {
    void Promise.all([
      getSettingBool("autostart.enabled", true),
      getSettingBool("updater.enabled", true),
    ]).then(([a, u]) => {
      setAutostartOn(a);
      setUpdaterOn(u);
    });
  }, []);

  const toggleAutostart = async (next: boolean) => {
    setAutostartOn(next);
    try {
      await setSettingBool("autostart.enabled", next);
      if (next) await setupAutostart();
      else await disableAutostart();
      await log(`settings: autostart.enabled=${next ? 1 : 0}`);
    } catch (e) {
      setAutostartOn(!next);
      await logErr(
        `settings: autostart toggle failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  const toggleUpdater = async (next: boolean) => {
    setUpdaterOn(next);
    await setSettingBool("updater.enabled", next);
    await log(`settings: updater.enabled=${next ? 1 : 0}`);
  };

  const handleClear = async () => {
    const ok = window.confirm(
      "Delete all fetch history, homework entries, and classes for every child? Credentials and settings stay intact.",
    );
    if (!ok) return;
    setClearing(true);
    try {
      await clearHistory();
      setClearedToast(true);
      setTimeout(() => setClearedToast(false), 3000);
    } catch (e) {
      await logErr(`settings: clearHistory failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="General"
        help="Background behavior. Autostart keeps the scheduler ticking; the updater toggle gates future in-app updates."
        card={false}
      >
        <div className="divide-y divide-border rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Start on login</p>
              <p className="text-[12px] text-muted-foreground">
                Launch the app automatically when you sign in.
              </p>
            </div>
            <Switch
              checked={autostartOn ?? true}
              onChange={(next) => {
                void toggleAutostart(next);
              }}
              aria-label="Start on login"
            />
          </div>

          <div className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Check for updates</p>
              <p className="text-[12px] text-muted-foreground">
                Automatic update checks (updater ships in a future release).
              </p>
            </div>
            <Switch
              checked={updaterOn ?? true}
              onChange={(next) => {
                void toggleUpdater(next);
              }}
              aria-label="Check for updates"
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Danger zone"
        help="One-way deletions. Back up your data if in doubt."
        danger
      >
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">Clear history</p>
            <p className="text-[12px] text-muted-foreground">
              Wipes fetch runs, homework entries, and class data for every child. Credentials,
              children, and settings stay intact.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={clearing}
            onClick={() => {
              void handleClear();
            }}
            className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
          >
            {clearing ? "Clearing…" : "Clear history"}
          </Button>
        </div>
        {clearedToast && <p className="mt-2 text-[12px] text-meeting">History cleared.</p>}
      </SettingsSection>
    </div>
  );
}
