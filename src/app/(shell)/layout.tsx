"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SettingsSidebar } from "@/components/shell/settings-sidebar";
import { Sidebar } from "@/components/shell/sidebar";

const ThemeProvider = dynamic(
  () => import("@/components/theme/theme-provider").then((m) => m.ThemeProvider),
  { ssr: false },
);

const Schedulers = dynamic(
  () => import("@/components/shell/schedulers").then((m) => m.Schedulers),
  { ssr: false },
);

const DisclaimerGate = dynamic(
  () => import("@/components/shell/disclaimer-gate").then((m) => m.DisclaimerGate),
  { ssr: false },
);

export default function ShellLayout({ children }: { children: ReactNode }) {
  // Phase 30 / D-23 — settings routes get a settings-specific sidebar
  // (Back row + tab list). Everything else gets the main nav sidebar.
  const pathname = usePathname() ?? "";
  const inSettings = pathname.startsWith("/settings");

  return (
    <>
      <ThemeProvider />
      <DisclaimerGate />
      <Schedulers />
      <div className="flex h-screen">
        {inSettings ? <SettingsSidebar /> : <Sidebar />}
        <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
          <main className="flex flex-1 flex-col overflow-x-hidden">{children}</main>
        </div>
      </div>
    </>
  );
}
