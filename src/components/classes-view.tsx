"use client";

import { useCallback, useEffect, useState } from "react";
import { GradesTable } from "@/components/grades-table";
import { useT } from "@/components/shell/locale-provider";
import { PageHeader } from "@/components/shell/page-header";
import { StandardsTree } from "@/components/standards-tree";
import { useSelectedChild } from "@/hooks/use-selected-child";
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
  getClassDetail,
  getClasses,
  getGradesForFetchRun,
  getLatestSuccessfulFetchRun,
} from "@/lib/ipc";
import type { ClassDetails } from "@/lib/scraper/types";

const EMPTY_HISTORY = new Map<string, StatusHistoryEntry[]>();
const EMPTY_DETAIL_CACHE = new Map<string, ClassDetails | null>();
const EMPTY_INSTRUCTORS = new Map<number, string>();

export function ClassesView() {
  const t = useT();
  const { selectedChildId: childId } = useSelectedChild();

  const [lastFetchRun, setLastFetchRun] = useState<FetchRunRecord | null>(null);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [statusHistory, setStatusHistory] =
    useState<Map<string, StatusHistoryEntry[]>>(EMPTY_HISTORY);
  const [instructors, setInstructors] = useState<Map<number, string>>(EMPTY_INSTRUCTORS);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [detailCache, setDetailCache] =
    useState<Map<string, ClassDetails | null>>(EMPTY_DETAIL_CACHE);
  const [detailLoading, setDetailLoading] = useState(false);
  const [attentionCfg, setAttentionCfg] = useState<AttentionConfig>(DEFAULT_ATTENTION_CONFIG);
  /** Engine-flagged attention class names for the CURRENTLY SELECTED child.
   *  Feeds GradesTable's "Needs Attention" badge + urgency sort per Q25 AT4. */
  const [attentionClassNames, setAttentionClassNames] = useState<ReadonlySet<string>>(new Set());

  const loadData = useCallback(async (cId: number) => {
    // Reads tied to fetch_run_id (grades, class details) need the latest
    // SUCCESSFUL teacherease run — otherwise a failed scrape or a
    // homework-only success hides the prior good data.
    const run = await getLatestSuccessfulFetchRun(cId, "teacherease");
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

  // Reload data whenever the sidebar-driven selection changes.
  useEffect(() => {
    if (childId == null) return;
    setGrades([]);
    setStatusHistory(EMPTY_HISTORY);
    setInstructors(EMPTY_INSTRUCTORS);
    setExpandedClass(null);
    setDetailCache(EMPTY_DETAIL_CACHE);
    setLastFetchRun(null);
    setAttentionClassNames(new Set());
    void loadData(childId);
  }, [childId, loadData]);

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
    <>
      <PageHeader title={t("classes.title")} />
      <div className="mx-auto w-full max-w-2xl space-y-5 px-5 py-5">
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
              isLoading={
                detailLoading && expandedClass === className && !detailCache.has(className)
              }
              attentionCfg={attentionCfg}
            />
          )}
        </GradesTable>
      </div>
    </>
  );
}
