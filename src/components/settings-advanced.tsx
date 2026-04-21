"use client";

import { CheckCircle2, Download, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/section";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { shouldCheckNow } from "@/lib/core/update-banner";
import {
  checkForUpdate,
  clearHistory,
  disableAutostart,
  getAppVersion,
  getLastUpdateCheckMs,
  getSettingBool,
  installUpdate,
  log,
  logErr,
  quitApp,
  resetAllAppData,
  setLastUpdateCheckMs,
  setSettingBool,
  setupAutostart,
  type UpdateInfo,
} from "@/lib/ipc";
import { describeError } from "@/lib/utils";

// The updater endpoint returns 404 / empty body until a release is actually
// published with a `latest.json` asset. Treat those as "up to date" so users
// don't see a scary error on the "Check now" button just because no release
// exists yet. Genuine network / auth errors still surface as errors.
function isNoReleaseYetError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("did not respond with a successful status code") ||
    m.includes("could not fetch a valid release json") ||
    m.includes("404") ||
    m.includes("not found")
  );
}

type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date" }
  | { kind: "available"; update: UpdateInfo }
  | { kind: "error"; message: string };

export function SettingsAdvanced() {
  const [autostartOn, setAutostartOn] = useState<boolean | null>(null);
  const [updaterOn, setUpdaterOn] = useState<boolean | null>(null);
  const [appVersion, setAppVersion] = useState<string>("…");
  const [checkState, setCheckState] = useState<CheckState>({ kind: "idle" });
  const [installing, setInstalling] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearedToast, setClearedToast] = useState(false);
  const [resetting, setResetting] = useState(false);

  const runCheck = useCallback(async (manual: boolean) => {
    setCheckState({ kind: "checking" });
    try {
      const result = await checkForUpdate();
      await setLastUpdateCheckMs(Date.now());
      if (result) {
        await log(`updater: update available version=${result.version}`);
        setCheckState({ kind: "available", update: result });
      } else {
        if (manual) await log("updater: manual check — up to date");
        setCheckState({ kind: "up-to-date" });
      }
    } catch (e) {
      const msg = describeError(e);
      await logErr(`updater: check failed: ${msg}`);
      if (isNoReleaseYetError(msg)) {
        setCheckState({ kind: "up-to-date" });
      } else {
        setCheckState({ kind: "error", message: msg });
      }
    }
  }, []);

  useEffect(() => {
    void Promise.all([
      getSettingBool("autostart.enabled", true),
      getSettingBool("updater.enabled", true),
      getAppVersion().catch(() => "unknown"),
      getLastUpdateCheckMs(),
    ]).then(async ([a, u, v, lastChecked]) => {
      setAutostartOn(a);
      setUpdaterOn(u);
      setAppVersion(v);
      // Auto-check on mount only when updater is enabled AND we haven't
      // checked within the throttle window (24h per shouldCheckNow).
      if (u && shouldCheckNow(lastChecked, Date.now())) {
        await runCheck(false);
      }
    });
  }, [runCheck]);

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
    if (!next) setCheckState({ kind: "idle" });
  };

  const handleInstall = async () => {
    if (checkState.kind !== "available") return;
    setInstalling(true);
    try {
      await log(`updater: installing version=${checkState.update.version}`);
      await installUpdate();
      // relaunch happens inside installUpdate — this line only runs if it throws.
    } catch (e) {
      const msg = describeError(e);
      await logErr(`updater: install failed: ${msg}`);
      setCheckState({ kind: "error", message: `Install failed: ${msg}` });
      setInstalling(false);
    }
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

  const handleReset = async () => {
    const ok = window.confirm(
      "Wipe EVERYTHING — every child, every stored password, all grade and homework data, and every setting — back to first-install state? This cannot be undone. The app will quit; re-open it to set up again.",
    );
    if (!ok) return;
    setResetting(true);
    try {
      await resetAllAppData();
      await log("settings: resetAllAppData succeeded — quitting");
      await quitApp();
      // App process exits; this line only runs if quitApp fails (shouldn't).
    } catch (e) {
      await logErr(
        `settings: resetAllAppData failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      setResetting(false);
    }
  };

  return (
    <div className="space-y-5">
      <SettingsSection
        title="Updates"
        help="Installed version + auto-updater status. When an update is available, clicking Install downloads + verifies the signature + replaces the app + relaunches automatically. First-install users get installers from GitHub Releases; after that, updates flow here."
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Current version</p>
              <p className="text-[12px] text-muted-foreground">v{appVersion}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!updaterOn || checkState.kind === "checking" || installing}
              onClick={() => {
                void runCheck(true);
              }}
              className="gap-1.5"
            >
              {checkState.kind === "checking" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              {checkState.kind === "checking" ? "Checking…" : "Check now"}
            </Button>
          </div>

          {checkState.kind === "available" && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-start gap-3">
                <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">
                    Version {checkState.update.version} available
                  </p>
                  {checkState.update.notes && (
                    <p className="mt-1 line-clamp-3 text-[12px] text-muted-foreground">
                      {checkState.update.notes.split("\n")[0]?.slice(0, 160)}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={installing}
                  onClick={() => {
                    void handleInstall();
                  }}
                  className="shrink-0 gap-1.5"
                >
                  {installing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Installing…
                    </>
                  ) : (
                    "Install"
                  )}
                </Button>
              </div>
            </div>
          )}

          {checkState.kind === "up-to-date" && (
            <p className="flex items-center gap-1.5 text-[12px] text-meeting">
              <CheckCircle2 className="h-3.5 w-3.5" /> You're on the latest version.
            </p>
          )}

          {checkState.kind === "error" && (
            <p className="text-[12px] text-destructive">Check failed: {checkState.message}</p>
          )}

          {!updaterOn && (
            <p className="text-[12px] text-muted-foreground">
              Automatic update checks are off. Enable them below, or click Check now to check once.
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="General" help="Background behavior for the app." card={false}>
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
                Silently check GitHub Releases once a day for a newer version.
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
        <div className="space-y-4">
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
              disabled={clearing || resetting}
              onClick={() => {
                void handleClear();
              }}
              className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
            >
              {clearing ? "Clearing…" : "Clear history"}
            </Button>
          </div>
          {clearedToast && <p className="text-[12px] text-meeting">History cleared.</p>}

          <div className="flex items-start gap-4 border-t border-destructive/10 pt-4">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">Reset app data</p>
              <p className="text-[12px] text-muted-foreground">
                Wipes <em>everything</em> — children, stored passwords, grade + homework history,
                all settings — back to first-install state. The app quits; re-open it to set up
                again. Uninstall the binary afterward via your OS (Add/Remove Programs, drag to
                Trash, etc.) for a clean removal.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={clearing || resetting}
              onClick={() => {
                void handleReset();
              }}
              className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
            >
              {resetting ? "Resetting…" : "Reset app data"}
            </Button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
