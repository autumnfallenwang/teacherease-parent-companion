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
  return <SettingsChildren />;
}
