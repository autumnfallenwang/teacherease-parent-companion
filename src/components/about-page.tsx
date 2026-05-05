"use client";

import { FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/components/shell/locale-provider";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { getAppVersion, openLogDir } from "@/lib/ipc";
import { APP_NAME, REPO_URL } from "@/lib/legal";

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div className="space-y-2">
      <h2
        className="text-base font-medium tracking-tight"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {title}
      </h2>
      <div className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
        {content}
      </div>
    </div>
  );
}

export function AboutPage() {
  const t = useT();
  const [appVersion, setAppVersion] = useState<string>("…");

  useEffect(() => {
    void getAppVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("unknown"));
  }, []);

  return (
    <>
      <PageHeader title={t("about.title")} />
      <div className="mx-auto max-w-lg px-5 py-6">
        <div className="space-y-6">
          <div className="flex items-center gap-3 rounded-lg bg-card px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <span
                className="text-lg font-semibold text-primary"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                T
              </span>
            </div>
            <div>
              <p className="text-[14px] font-medium">{APP_NAME}</p>
              <p className="text-[12px] text-muted-foreground">
                {t("about.version", { version: appVersion })}
              </p>
            </div>
          </div>

          <Section title={t("about.disclaimerHeading")} content={t("wizard.disclaimer.full")} />
          <Section title={t("about.privacyHeading")} content={t("wizard.disclaimer.privacy")} />
          <Section
            title={t("about.responsibleHeading")}
            content={t("wizard.disclaimer.responsibleUse")}
          />

          <div className="flex items-center gap-4 border-t pt-4">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-primary underline-offset-4 hover:underline"
            >
              {t("about.viewSource")}
            </a>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-[12px] text-muted-foreground"
              onClick={() => openLogDir()}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t("about.viewLogs")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
