"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
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
  return (
    <>
      <ThemeProvider />
      <DisclaimerGate />
      <Schedulers />
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
          <main className="flex flex-1 flex-col overflow-x-hidden">{children}</main>
        </div>
      </div>
    </>
  );
}
