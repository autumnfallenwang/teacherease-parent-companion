"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/sidebar";

const UpdateBanner = dynamic(
  () => import("@/components/shell/update-banner").then((m) => m.UpdateBanner),
  { ssr: false },
);

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-x-hidden">
        <UpdateBanner />
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
