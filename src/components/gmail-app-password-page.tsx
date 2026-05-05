"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useT } from "@/components/shell/locale-provider";

const APP_PASSWORDS_URL = "https://myaccount.google.com/apppasswords";
const TWO_STEP_URL = "https://myaccount.google.com/signinoptions/two-step-verification";
const GOOGLE_DOCS_URL = "https://support.google.com/accounts/answer/185833";

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline-offset-4 hover:underline"
    >
      {children}
    </a>
  );
}

/**
 * Splits a translated template like "Visit {link} to..." into a JSX fragment,
 * substituting the {link} placeholder with the provided React node. Used for
 * the Gmail guide's step bodies which interpolate clickable URLs.
 */
function templateWithLink(template: string, link: React.ReactNode): React.ReactNode {
  const parts = template.split("{link}");
  if (parts.length === 1) return parts[0];
  return (
    <>
      {parts[0]}
      {link}
      {parts.slice(1).join("{link}")}
    </>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="space-y-2">
      <h2 className="text-[14px] font-medium">{t("gmail.step.prefix", { num: number, title })}</h2>
      <div className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

export function GmailAppPasswordPage() {
  const t = useT();
  const APP_NAME = "TeacherEase Parent Companion";
  return (
    <div className="mx-auto max-w-lg px-5 py-6">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        {t("gmail.back")}
      </Link>

      <h1
        className="mb-2 text-xl font-medium tracking-tight"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {t("gmail.heading")}
      </h1>
      <p className="mb-8 text-[13px] leading-relaxed text-muted-foreground">{t("gmail.intro")}</p>

      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-[14px] font-medium">{t("gmail.why.title")}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{t("gmail.why.body")}</p>
        </div>

        <div className="space-y-2">
          <h2 className="text-[14px] font-medium">{t("gmail.before.title")}</h2>
          <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-muted-foreground">
            <li>{t("gmail.before.bullet1")}</li>
            <li>{t("gmail.before.bullet2")}</li>
          </ul>
        </div>

        <Step number={1} title={t("gmail.step1.title")}>
          <p>
            {templateWithLink(
              t("gmail.step1.body"),
              <ExternalLink href={TWO_STEP_URL}>
                myaccount.google.com/signinoptions/two-step-verification
              </ExternalLink>,
            )}
          </p>
        </Step>

        <Step number={2} title={t("gmail.step2.title")}>
          <p>
            {templateWithLink(
              t("gmail.step2.body"),
              <ExternalLink href={APP_PASSWORDS_URL}>
                myaccount.google.com/apppasswords
              </ExternalLink>,
            )}
          </p>
        </Step>

        <Step number={3} title={t("gmail.step3.title")}>
          <p>{t("gmail.step3.body", { appName: APP_NAME })}</p>
        </Step>

        <Step number={4} title={t("gmail.step4.title")}>
          <p>{t("gmail.step4.body1")}</p>
          <p>{t("gmail.step4.body2")}</p>
        </Step>

        <Step number={5} title={t("gmail.step5.title")}>
          <p>{t("gmail.step5.body")}</p>
        </Step>

        <div className="space-y-2">
          <h2 className="text-[14px] font-medium">{t("gmail.troubleshoot.title")}</h2>
          <ul className="list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-muted-foreground">
            <li>{t("gmail.troubleshoot.bullet1")}</li>
            <li>{t("gmail.troubleshoot.bullet2")}</li>
            <li>{t("gmail.troubleshoot.bullet3")}</li>
            <li>{t("gmail.troubleshoot.bullet4")}</li>
          </ul>
        </div>

        <div className="space-y-2 border-t pt-6">
          <h2 className="text-[14px] font-medium">{t("gmail.docs.title")}</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {templateWithLink(
              t("gmail.docs.body"),
              <ExternalLink href={GOOGLE_DOCS_URL}>{t("gmail.docs.linkText")}</ExternalLink>,
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
