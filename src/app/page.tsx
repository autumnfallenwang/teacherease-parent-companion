"use client";

import { EmptyState } from "@/components/empty-state";
import { Header } from "@/components/header";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header lastRunAt={null} onRefresh={() => {}} />
      <main className="flex flex-1 flex-col">
        <EmptyState onAddChild={() => {}} />
      </main>
    </div>
  );
}
