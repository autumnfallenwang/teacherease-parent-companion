"use client";

import dynamic from "next/dynamic";

const GmailAppPasswordPage = dynamic(
  () => import("@/components/gmail-app-password-page").then((m) => m.GmailAppPasswordPage),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    ),
  },
);

export default function GmailAppPassword() {
  return <GmailAppPasswordPage />;
}
