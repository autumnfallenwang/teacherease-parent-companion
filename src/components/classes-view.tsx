"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChildTabs } from "@/components/child-tabs";
import { GradesTable } from "@/components/grades-table";
import { StandardsTree } from "@/components/standards-tree";
import {
  type AttentionConfig,
  computeChildAttention,
  DEFAULT_ATTENTION_CONFIG,
} from "@/lib/core/attention-engine";
import type { FetchRunRecord, GradeRecord, StatusHistoryEntry } from "@/lib/ipc";
import {
  getAllClassDetails,
  getAllStatusHistory,
  getAttentionConfig,
  getChildren,
  getClassDetail,
  getClasses,
  getGradesForFetchRun,
  getLatestFetchRun,
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
  const [attentionCfg, setAttentionCfg] = useState<AttentionConfig>(DEFAULT_ATTENTION_CONFIG);
  /** Engine-flagged attention class names for the CURRENTLY SELECTED child.
   *  Feeds GradesTable's "Needs Attention" badge + urgency sort per Q25 AT4. */
  const [attentionClassNames, setAttentionClassNames] = useState<ReadonlySet<string>>(new Set());

  const loadData = useCallback(async (cId: number) => {
    const run = await getLatestFetchRun(cId);
    setLastFetchRun(run);
    if (run) {
      const [g, h, cfg, cd] = await Promise.all([
        getGradesForFetchRun(run.id),
        getAllStatusHistory(cId),
        getAttentionConfig(),
        getAllClassDetails(run.id),
      ]);
      setGrades(g);
      setStatusHistory(h);
      setAttentionCfg(cfg);
      const engine = computeChildAttention(cd, new Date(), cfg);
      setAttentionClassNames(
        new Set(
          engine.perClass.filter((c) => c.classFlag.status === "attention").map((c) => c.className),
        ),
      );
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

        // Engine-driven attention (Q25 AT4): a child's tab dot follows our
        // attention verdict, not TeacherEase's `needs_attention` column.
        const cfg = await getAttentionConfig();
        const attnSet = new Set<number>();
        for (const c of children) {
          const run = await getLatestFetchRun(c.id);
          if (!run) continue;
          const cd = await getAllClassDetails(run.id);
          const engine = computeChildAttention(cd, new Date(), cfg);
          if (engine.childFlag.status === "attention") attnSet.add(c.id);
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
      setAttentionClassNames(new Set());
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
        attentionClassNames={attentionClassNames}
        expandedClass={expandedClass}
        onClassClick={handleClassClick}
      >
        {(className) => (
          <StandardsTree
            detail={detailCache.get(className) ?? null}
            isLoading={detailLoading && expandedClass === className && !detailCache.has(className)}
            attentionCfg={attentionCfg}
          />
        )}
      </GradesTable>
    </div>
  );
}
