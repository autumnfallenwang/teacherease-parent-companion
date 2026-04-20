"use client";

// First-run disclaimer gate (Phase 25 / Q33). Single screen; acknowledging
// writes `wizard.disclaimerAcknowledgedAt` to settings and navigates to the
// dashboard. Quitting calls `quitApp()`. No skip. Add-child + notifications
// guidance moved to docs/user-guide.md (linked below).

import { Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { log, logErr, quitApp, setSettingString } from "@/lib/ipc";
import { APP_NAME, DISCLAIMER_FULL, PRIVACY_NOTICE, REPO_URL, RESPONSIBLE_USE } from "@/lib/legal";

const USER_GUIDE_URL = `${REPO_URL}/blob/main/docs/user-guide.md`;
const ACK_KEY = "wizard.disclaimerAcknowledgedAt";

export function SetupWizard() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleAcknowledge = async () => {
    setBusy(true);
    try {
      await setSettingString(ACK_KEY, new Date().toISOString());
      await log("wizard: disclaimer acknowledged");
      router.replace("/");
    } catch (e) {
      await logErr(
        `wizard: disclaimer save failed — ${e instanceof Error ? e.message : "unknown"}`,
      );
      setBusy(false);
    }
  };

  const handleQuit = () => {
    void (async () => {
      await log("wizard: disclaimer declined, exiting app");
      try {
        await quitApp();
      } catch (e) {
        await logErr(`wizard: quit failed — ${e instanceof Error ? e.message : "unknown"}`);
      }
    })();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-5">
      <div className="w-full max-w-xl space-y-5 rounded-xl border bg-card p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[18px] font-medium" style={{ fontFamily: "var(--font-heading)" }}>
              Welcome to {APP_NAME}
            </h1>
            <p className="text-[12px] text-muted-foreground">
              Please read and acknowledge before continuing.
            </p>
          </div>
        </div>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto rounded-lg border border-border bg-secondary/20 p-4 text-[13px] leading-relaxed">
          <DisclaimerBlock title="Disclaimer" body={DISCLAIMER_FULL} />
          <DisclaimerBlock title="Privacy" body={PRIVACY_NOTICE} />
          <DisclaimerBlock title="Responsible use" body={RESPONSIBLE_USE} />
        </div>

        <p className="text-[12px] text-muted-foreground">
          New here?{" "}
          <a
            href={USER_GUIDE_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline-offset-4 hover:underline"
          >
            Read the user guide →
          </a>
        </p>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={handleQuit}>
            Quit
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => {
              void handleAcknowledge();
            }}
          >
            {busy ? "Saving…" : "I understand — continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DisclaimerBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mt-1 whitespace-pre-line text-[12px] text-muted-foreground">{body}</p>
    </div>
  );
}
