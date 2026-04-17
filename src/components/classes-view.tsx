"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChildTabs } from "@/components/child-tabs";
import { GradesTable } from "@/components/grades-table";
import { StandardsTree } from "@/components/standards-tree";
import type { FetchRunRecord, GradeRecord, StatusHistoryEntry } from "@/lib/ipc";
import {
  getAllStatusHistory,
  getChildren,
  getClassDetail,
  getClasses,
  getGradesForFetchRun,
  getLatestFetchRun,
  getNeedsAttentionGrades,
  log,
} from "@/lib/ipc";
import type { ChildRecord, ClassDetails } from "@/lib/scraper/types";

const EMPTY_HISTORY = new Map<string, StatusHistoryEntry[]>();
const EMPTY_DETAIL_CACHE = new Map<string, ClassDetails | null>();
const EMPTY_INSTRUCTORS = new Map<number, string>();

export function ClassesView() {
  const searchParams = useSearchParams();

  const [allChildren, setAllChildren] = useState<ChildRecord[]>([]);
  const [childId, setChildId] = useState<number | null>(null);
  const [lastFetchRun, setLastFetchRun] = useState<FetchRunRecord | null>(null);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [statusHistory, setStatusHistory] =
    useState<Map<string, StatusHistoryEntry[]>>(EMPTY_HISTORY);
  const [instructors, setInstructors] = useState<Map<number, string>>(EMPTY_INSTRUCTORS);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [detailCache, setDetailCache] =
    useState<Map<string, ClassDetails | null>>(EMPTY_DETAIL_CACHE);
  const [detailLoading, setDetailLoading] = useState(false);
  const [attentionChildIds, setAttentionChildIds] = useState<Set<number>>(new Set());

  const loadData = useCallback(async (cId: number) => {
    const run = await getLatestFetchRun(cId);
    setLastFetchRun(run);
    if (run) {
      const [g, h] = await Promise.all([getGradesForFetchRun(run.id), getAllStatusHistory(cId)]);
      setGrades(g);
      setStatusHistory(h);
    }
    const classes = await getClasses(cId);
    const instrMap = new Map<number, string>();
    for (const cls of classes) {
      if (cls.instructor) instrMap.set(cls.id, cls.instructor);
    }
    setInstructors(instrMap);
  }, []);

  useEffect(() => {
    void getChildren()
      .then(async (children) => {
        setAllChildren(children);
        if (children.length === 0) return;

        const attnSet = new Set<number>();
        for (const c of children) {
          const run = await getLatestFetchRun(c.id);
          if (!run) continue;
          const attn = await getNeedsAttentionGrades(run.id);
          if (attn.length > 0) attnSet.add(c.id);
        }
        setAttentionChildIds(attnSet);

        const fromUrl = Number(searchParams.get("child")) || null;
        const validFromUrl = fromUrl && children.some((c) => c.id === fromUrl) ? fromUrl : null;
        const preferred = validFromUrl ?? Array.from(attnSet)[0] ?? children[0]?.id ?? null;
        if (preferred != null) {
          setChildId(preferred);
          await loadData(preferred);
        }
      })
      .catch(() => undefined);
  }, [loadData, searchParams]);

  const handleChildSelect = useCallback(
    (newChildId: number) => {
      if (newChildId === childId) return;
      void log(`classes: switched to childId=${newChildId}`);
      setChildId(newChildId);
      setGrades([]);
      setStatusHistory(EMPTY_HISTORY);
      setInstructors(EMPTY_INSTRUCTORS);
      setExpandedClass(null);
      setDetailCache(EMPTY_DETAIL_CACHE);
      setLastFetchRun(null);
      void loadData(newChildId);
    },
    [childId, loadData],
  );

  const handleClassClick = useCallback(
    (className: string) => {
      setExpandedClass((prev) => {
        const next = prev === className ? null : className;
        if (next && !detailCache.has(next) && lastFetchRun) {
          setDetailLoading(true);
          void getClassDetail(lastFetchRun.id, next)
            .then((detail) => {
              setDetailCache((cache) => new Map(cache).set(next, detail));
            })
            .catch(() => undefined)
            .finally(() => setDetailLoading(false));
        }
        return next;
      });
    },
    [detailCache, lastFetchRun],
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-5 py-5">
      <h1
        className="text-xl font-medium tracking-tight"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        Classes
      </h1>

      {childId && allChildren.length > 1 && (
        <ChildTabs
          items={allChildren}
          selectedId={childId}
          attentionChildIds={attentionChildIds}
          onSelect={handleChildSelect}
        />
      )}

      <GradesTable
        grades={grades}
        history={statusHistory}
        instructors={instructors}
        expandedClass={expandedClass}
        onClassClick={handleClassClick}
      >
        {(className) => (
          <StandardsTree
            detail={detailCache.get(className) ?? null}
            isLoading={detailLoading && expandedClass === className && !detailCache.has(className)}
          />
        )}
      </GradesTable>
    </div>
  );
}
