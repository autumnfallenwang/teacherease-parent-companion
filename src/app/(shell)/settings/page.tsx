"use client";

import dynamic from "next/dynamic";

const SettingsView = dynamic(
  () => import("@/components/settings-view").then((m) => m.SettingsView),
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
  return <SettingsView />;
}
