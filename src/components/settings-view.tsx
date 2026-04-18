"use client";

import { useState } from "react";
import { SettingsAdvanced } from "@/components/settings-advanced";
import { SettingsAppearance } from "@/components/settings-appearance";
import { SettingsAttention } from "@/components/settings-attention";
import { SettingsChildren } from "@/components/settings-children";
import { SettingsEmail } from "@/components/settings-email";
import { SettingsNotifications } from "@/components/settings-notifications";
import { PageHeader } from "@/components/shell/page-header";

type SettingsTab = "children" | "appearance" | "attention" | "notifications" | "email" | "advanced";

const TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: "children", label: "Children" },
  { key: "appearance", label: "Appearance" },
  { key: "attention", label: "Attention" },
  { key: "notifications", label: "Notifications" },
  { key: "email", label: "Email" },
  { key: "advanced", label: "Advanced" },
];

export function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("children");

  return (
    <>
      <PageHeader
        title="Settings"
        subTabs={
          <div className="flex gap-5">
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
        }
      />
      <div className="mx-auto w-full max-w-lg space-y-5 px-5 py-6">
        {activeTab === "children" && <SettingsChildren />}
        {activeTab === "appearance" && <SettingsAppearance />}
        {activeTab === "attention" && <SettingsAttention />}
        {activeTab === "notifications" && <SettingsNotifications />}
        {activeTab === "email" && <SettingsEmail />}
        {activeTab === "advanced" && <SettingsAdvanced />}
      </div>
    </>
  );
}
