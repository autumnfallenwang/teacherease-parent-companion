"use client";

import { CheckCircle2, Download, Loader2, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SettingsSection } from "@/components/settings/section";
import { useT } from "@/components/shell/locale-provider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { shouldCheckNow } from "@/lib/core/update-banner";
import {
  checkForUpdate,
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
import { REPO_URL } from "@/lib/legal";
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
  const t = useT();
  const [autostartOn, setAutostartOn] = useState<boolean | null>(null);
  const [appVersion, setAppVersion] = useState<string>("…");
  const [checkState, setCheckState] = useState<CheckState>({ kind: "idle" });
  const [installing, setInstalling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

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
      getAppVersion().catch(() => "unknown"),
      getLastUpdateCheckMs(),
    ]).then(async ([a, v, lastChecked]) => {
      setAutostartOn(a);
      setAppVersion(v);
      // Auto-check on mount when 24h+ elapsed since the last check.
      if (shouldCheckNow(lastChecked, Date.now())) {
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
      setCheckState({
        kind: "error",
        message: t("settings.advanced.updates.installFailed", { msg }),
      });
      setInstalling(false);
    }
  };

  const handleReset = async () => {
    // Inline confirmation panel handles the user decision; this runs only
    // after the user clicks the explicit destructive Reset button.
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
        title={t("settings.advanced.updates.title")}
        help={t("settings.advanced.updates.help")}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">
                {t("settings.advanced.updates.currentVersion")}
              </p>
              <p className="text-[12px] text-muted-foreground">v{appVersion}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={checkState.kind === "checking" || installing}
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
              {checkState.kind === "checking"
                ? t("settings.advanced.updates.checking")
                : t("settings.advanced.updates.checkNow")}
            </Button>
          </div>

          {checkState.kind === "available" && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-start gap-3">
                <Download className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">
                    {t("settings.advanced.updates.available", {
                      version: checkState.update.version,
                    })}
                  </p>
                  <a
                    href={`${REPO_URL}/releases/tag/v${checkState.update.version}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-block text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {t("settings.advanced.updates.releaseNotes")}
                  </a>
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
                      {t("settings.advanced.updates.installing")}
                    </>
                  ) : (
                    t("settings.advanced.updates.install")
                  )}
                </Button>
              </div>
            </div>
          )}

          {checkState.kind === "up-to-date" && (
            <p className="flex items-center gap-1.5 text-[12px] text-meeting">
              <CheckCircle2 className="h-3.5 w-3.5" /> {t("settings.advanced.updates.upToDate")}
            </p>
          )}

          {checkState.kind === "error" && (
            <p className="text-[12px] text-destructive">
              {t("settings.advanced.updates.checkFailed", { msg: checkState.message })}
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("settings.advanced.general.title")}
        help={t("settings.advanced.general.help")}
        card={false}
      >
        <div className="divide-y divide-border rounded-lg border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">
                {t("settings.advanced.general.startOnLoginTitle")}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {t("settings.advanced.general.startOnLoginDesc")}
              </p>
            </div>
            <Switch
              checked={autostartOn ?? true}
              onChange={(next) => {
                void toggleAutostart(next);
              }}
              aria-label={t("settings.advanced.general.startOnLoginAria")}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t("settings.advanced.danger.title")}
        help={t("settings.advanced.danger.help")}
        danger
      >
        {confirmingReset ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">
                  {t("settings.advanced.danger.confirmTitle")}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {t("settings.advanced.danger.confirmBody")}
                </p>
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="h-8"
                disabled={resetting}
                onClick={() => {
                  void handleReset();
                }}
              >
                {resetting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  t("settings.advanced.danger.confirmReset")
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => setConfirmingReset(false)}
                disabled={resetting}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{t("settings.advanced.danger.idleTitle")}</p>
              <p className="text-[12px] text-muted-foreground">
                {t("settings.advanced.danger.idleBody")}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmingReset(true)}
              className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
            >
              {t("settings.advanced.danger.idleButton")}
            </Button>
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
