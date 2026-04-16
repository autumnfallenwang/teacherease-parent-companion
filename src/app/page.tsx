"use client";

import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { GradesTable } from "@/components/grades-table";
import { Header } from "@/components/header";
import { NeedsAttention } from "@/components/needs-attention";
import type { AssignmentRecord, GradeRecord } from "@/lib/ipc";

// Placeholder state — replaced by real IPC calls in T19.
const MOCK_GRADES: GradeRecord[] = [];
const MOCK_MISSING: AssignmentRecord[] = [];
const HAS_CHILD = false;

export default function DashboardPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  if (!HAS_CHILD) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header lastRunAt={null} onRefresh={() => {}} />
        <main className="flex flex-1 flex-col">
          <EmptyState onAddChild={() => {}} />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        lastRunAt={null}
        isRefreshing={isRefreshing}
        onRefresh={() => {
          setIsRefreshing(true);
          setTimeout(() => setIsRefreshing(false), 1500);
        }}
      />
      <main className="flex-1 space-y-6 p-6">
        <GradesTable grades={MOCK_GRADES} />
        <NeedsAttention missingAssignments={MOCK_MISSING} />
      </main>
    </div>
  );
}
