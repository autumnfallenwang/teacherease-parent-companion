"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { getChild } from "@/lib/ipc";
import type { ChildRecord } from "@/lib/scraper/types";
import { WizardAddChild } from "./wizard-add-child";
import { WizardDone } from "./wizard-done";
import { WizardNotifications } from "./wizard-notifications";
import { WizardWelcome } from "./wizard-welcome";

type Step = "welcome" | "add-child" | "notifications" | "done";

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [child, setChild] = useState<ChildRecord | null>(null);

  const goToDashboard = useCallback(() => {
    router.push("/");
  }, [router]);

  const handleChildAdded = useCallback(async (childId: number) => {
    const record = await getChild(childId);
    setChild(record);
    setStep("notifications");
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between border-b px-6 py-3">
        <span className="text-sm font-medium text-muted-foreground">Setup</span>
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={goToDashboard}
        >
          Skip setup
        </button>
      </div>

      {step === "welcome" && (
        <WizardWelcome onNext={() => setStep("add-child")} onSkip={goToDashboard} />
      )}
      {step === "add-child" && <WizardAddChild onNext={handleChildAdded} onSkip={goToDashboard} />}
      {step === "notifications" && (
        <WizardNotifications onNext={() => setStep("done")} onSkip={() => setStep("done")} />
      )}
      {step === "done" && child && <WizardDone child={child} onFinish={goToDashboard} />}
    </div>
  );
}
