"use client";

import { useState } from "react";
import { SettingsAdvanced } from "@/components/settings-advanced";
import { SettingsChildren } from "@/components/settings-children";
import { SettingsEmail } from "@/components/settings-email";
import { SettingsNotifications } from "@/components/settings-notifications";

type SettingsTab = "children" | "notifications" | "email" | "advanced";

const TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: "children", label: "Children" },
  { key: "notifications", label: "Notifications" },
  { key: "email", label: "Email" },
  { key: "advanced", label: "Advanced" },
];

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("children");

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 px-5 py-6">
      <h1
        className="text-xl font-medium tracking-tight"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Settings
      </h1>

      <div className="flex gap-5 border-b border-border">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`-mb-px border-b-2 pb-2 text-[13px] transition-colors ${
              activeTab === t.key
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "children" && <SettingsChildren />}
      {activeTab === "notifications" && <SettingsNotifications />}
      {activeTab === "email" && <SettingsEmail />}
      {activeTab === "advanced" && <SettingsAdvanced />}
    </div>
  );
}
