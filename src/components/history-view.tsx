"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatHomeworkDate, HomeworkRow } from "@/components/homework-card";
import { PageHeader } from "@/components/shell/page-header";
import { useSelectedChild } from "@/hooks/use-selected-child";
import type { HomeworkRecord } from "@/lib/ipc";
import { getChildren, getRecentHomework } from "@/lib/ipc";
import type { ChildRecord } from "@/lib/scraper/types";

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border py-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function HomeworkSection({
  rows,
  childHomeworkUrl,
}: {
  rows: HomeworkRecord[];
  childHomeworkUrl: string | null;
}) {
  if (rows.length === 0) {
    return (
      <EmptyRow
        text={
          childHomeworkUrl
            ? "No homework recorded yet for this child."
            : "To track homework for this child, add a Google Sites URL under Settings → Children."
        }
      />
    );
  }

  const groups = new Map<string, HomeworkRecord[]>();
  for (const r of rows) {
    const existing = groups.get(r.hwDate);
    if (existing) existing.push(r);
    else groups.set(r.hwDate, [r]);
  }

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([date, entries]) => (
        <div key={date} className="space-y-2">
          <p className="px-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            {formatHomeworkDate(date)}
          </p>
          <div className="space-y-1.5">
            {entries.map((entry) => (
              <HomeworkRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function HistoryView() {
  const { selectedChildId: childId } = useSelectedChild();

  const [allChildren, setAllChildren] = useState<ChildRecord[]>([]);
  const [homeworkRows, setHomeworkRows] = useState<HomeworkRecord[]>([]);

  const loadData = useCallback(async (cId: number) => {
    const hw = await getRecentHomework(cId, 50);
    setHomeworkRows(hw);
  }, []);

  // Fetch child list once so the empty-state message can differentiate
  // between "homework URL configured, no rows yet" vs "URL not configured."
  useEffect(() => {
    void getChildren()
      .then(setAllChildren)
      .catch(() => undefined);
  }, []);

  // Reload homework whenever the sidebar-driven selection changes.
  useEffect(() => {
    if (childId == null) return;
    setHomeworkRows([]);
    void loadData(childId);
  }, [childId, loadData]);

  const currentChildHomeworkUrl = useMemo(
    () => allChildren.find((c) => c.id === childId)?.homeworkUrl ?? null,
    [allChildren, childId],
  );

  return (
    <>
      <PageHeader title="History" />
      <div className="mx-auto w-full max-w-2xl space-y-5 px-5 py-5">
        <HomeworkSection rows={homeworkRows} childHomeworkUrl={currentChildHomeworkUrl} />
      </div>
    </>
  );
}
