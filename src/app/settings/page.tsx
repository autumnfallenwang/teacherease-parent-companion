"use client";

import dynamic from "next/dynamic";

const SettingsChildren = dynamic(
  () => import("@/components/settings-children").then((m) => m.SettingsChildren),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    ),
  },
);

export default function SettingsPage() {
  return (
    <div>
      <SettingsChildren />
      <div className="mx-auto max-w-lg border-t px-5 py-4">
        <a
          href="/about"
          className="text-[13px] text-muted-foreground underline-offset-4 hover:underline"
        >
          About &amp; Legal
        </a>
      </div>
    </div>
  );
}
