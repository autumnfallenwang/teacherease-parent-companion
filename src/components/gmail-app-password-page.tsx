"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

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

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-[14px] font-medium">
        Step {number} — {title}
      </h2>
      <div className="space-y-2 text-[13px] leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

export function GmailAppPasswordPage() {
  return (
    <div className="mx-auto max-w-lg px-5 py-6">
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Settings
      </Link>

      <h1
        className="mb-2 text-xl font-medium tracking-tight"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Gmail App Password setup
      </h1>
      <p className="mb-8 text-[13px] leading-relaxed text-muted-foreground">
        Gmail requires an <em>App Password</em> for third-party SMTP clients like this one. It's a
        16-character credential you generate once and paste into the Email settings. This guide
        walks through creating one.
      </p>

      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-[14px] font-medium">Why you need this</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            As of May 2022, Google blocks plain-password SMTP authentication ("less secure app
            access"). App Passwords are the supported replacement — they act as limited-scope
            credentials that can be revoked independently of your main password.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-[14px] font-medium">Before you start</h2>
          <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-muted-foreground">
            <li>
              You need 2-Step Verification turned on. App Passwords aren't available without it.
            </li>
            <li>
              Personal Gmail accounts work out of the box. Google Workspace (school/work) accounts
              may have App Passwords disabled by an admin — if so, ask your admin or use a personal
              account.
            </li>
          </ul>
        </div>

        <Step number={1} title="Turn on 2-Step Verification">
          <p>
            Skip if you already have it on. Visit{" "}
            <ExternalLink href={TWO_STEP_URL}>
              myaccount.google.com/signinoptions/two-step-verification
            </ExternalLink>{" "}
            and follow the prompts. You'll need a phone number to receive codes.
          </p>
        </Step>

        <Step number={2} title="Open the App Passwords page">
          <p>
            Visit{" "}
            <ExternalLink href={APP_PASSWORDS_URL}>myaccount.google.com/apppasswords</ExternalLink>.
            If the page redirects to the 2-Step Verification setup, go back to Step 1 — App
            Passwords only appear after 2SV is active.
          </p>
        </Step>

        <Step number={3} title="Create a new app password">
          <p>
            Enter a name (e.g.{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[12px]">
              TeacherEase Parent Companion
            </code>
            ) in the text box and click <strong>Create</strong>. Google shows the new password in a
            yellow box.
          </p>
        </Step>

        <Step number={4} title="Copy the 16-character password">
          <p>
            Copy the 16-character string (spaces are optional — Gmail accepts either format). Paste
            it into this app at <strong>Settings → Email → Password</strong>, then click{" "}
            <strong>Save</strong>.
          </p>
          <p>
            <strong>Important:</strong> Google only shows the password once. If you close the window
            without saving it, you'll need to revoke and re-create.
          </p>
        </Step>

        <Step number={5} title="Send a test email">
          <p>
            Back in <strong>Settings → Email</strong>, click <strong>Send test email</strong>. If
            you see "Test email sent" and the email arrives, you're done. Flip on the event toggles
            above to start receiving real notifications.
          </p>
        </Step>

        <div className="space-y-2">
          <h2 className="text-[14px] font-medium">Troubleshooting</h2>
          <ul className="list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-muted-foreground">
            <li>
              <strong>"App passwords aren't available for your account"</strong> — your Workspace
              admin has disabled them. Use a personal Gmail account instead, or ask IT.
            </li>
            <li>
              <strong>The apppasswords URL redirects back to 2SV setup</strong> — 2-Step
              Verification isn't fully enabled yet. Complete Step 1.
            </li>
            <li>
              <strong>Test email fails with "535 5.7.8 Username and Password not accepted"</strong>{" "}
              — the 16-character password was mistyped or copied with a stray character. Re-generate
              a fresh one and paste carefully.
            </li>
            <li>
              <strong>Lost the password</strong> — Google never shows it again. Revoke the old entry
              on the App Passwords page and create a new one.
            </li>
          </ul>
        </div>

        <div className="space-y-2 border-t pt-6">
          <h2 className="text-[14px] font-medium">Official Google documentation</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            For the canonical, always-current version of this guide (including any UI changes Google
            makes), see{" "}
            <ExternalLink href={GOOGLE_DOCS_URL}>Google's App Passwords help article</ExternalLink>.
          </p>
        </div>
      </div>
    </div>
  );
}
