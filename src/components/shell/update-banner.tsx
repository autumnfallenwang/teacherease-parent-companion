"use client";

import { Download, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { shouldCheckNow, shouldShowBanner } from "@/lib/core/update-banner";
import {
  checkForUpdate,
  dismissUpdateVersion,
  getDismissedUpdateVersion,
  getLastUpdateCheckMs,
  getSettingBool,
  installUpdate,
  log,
  logErr,
  setLastUpdateCheckMs,
  type UpdateInfo,
} from "@/lib/ipc";

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    void (async () => {
      const [isEnabled, dismissed, lastCheckedMs] = await Promise.all([
        getSettingBool("updater.enabled", true),
        getDismissedUpdateVersion(),
        getLastUpdateCheckMs(),
      ]);
      setEnabled(isEnabled);
      setDismissedVersion(dismissed);

      if (!isEnabled) return;
      if (!shouldCheckNow(lastCheckedMs, Date.now())) return;

      try {
        await log("updater: checking for updates");
        const result = await checkForUpdate();
        await setLastUpdateCheckMs(Date.now());
        if (result) {
          await log(`updater: update available version=${result.version}`);
          setUpdate(result);
        } else {
          await log("updater: no update available");
        }
      } catch (e) {
        await logErr(`updater: check failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    })();
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await log(`updater: installing version=${update?.version ?? "?"}`);
      await installUpdate();
      // relaunch happens inside installUpdate — this line only runs if it fails.
    } catch (e) {
      await logErr(`updater: install failed: ${e instanceof Error ? e.message : "unknown"}`);
      setInstalling(false);
    }
  };

  const handleLater = async () => {
    if (!update) return;
    await dismissUpdateVersion(update.version);
    setDismissedVersion(update.version);
    await log(`updater: dismissed version=${update.version}`);
  };

  if (!shouldShowBanner({ update, enabled, dismissedVersion })) return null;
  if (!update) return null;

  const notesSnippet = update.notes ? (update.notes.split("\n")[0]?.slice(0, 120) ?? null) : null;

  return (
    <div className="flex items-center gap-3 border-b border-primary/20 bg-primary/5 px-4 py-2">
      <Download className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">Version {update.version} available</p>
        {notesSnippet && (
          <p className="truncate text-[12px] text-muted-foreground">{notesSnippet}</p>
        )}
      </div>
      <Button
        type="button"
        size="sm"
        disabled={installing}
        onClick={() => {
          void handleInstall();
        }}
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
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={installing}
        onClick={() => {
          void handleLater();
        }}
        title="Dismiss this version"
        aria-label="Dismiss update"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
