// Thin facade over Tauri IPC. All calls from React into the Rust shell and
// Tauri plugins go through this file — components never import from
// `@tauri-apps/*` directly. See design-plan.md "Forward compatibility."
//
// A future web version replaces this file with src/lib/api.ts (REST client)
// and every React component keeps working.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { fetch as pluginFetch } from "@tauri-apps/plugin-http";
import Database from "@tauri-apps/plugin-sql";
import { type AttentionConfig, parseAttentionConfig } from "./core/attention-engine";
import { hwDateToIso, resolveDueDate } from "./core/homework-date";
import type {
  ChildRecord,
  ClassDetails,
  ClassOverview,
  FetchImpl,
  GradesOverview,
  HomeworkEntry,
  Standard,
} from "./scraper/types";

// ---------------------------------------------------------------------------
// Scraper-side HTTP
// ---------------------------------------------------------------------------

/**
 * Routes through the `tauri-plugin-http` allowlist so WebKitGTK's CORS
 * enforcement can't block cross-origin requests to TeacherEase / Google
 * Sites. Signature matches the scraper's `FetchImpl` so existing injection
 * sites (`login()`, `validateHomeworkUrl()`) swap in cleanly and tests
 * stay isolated on Node's native fetch.
 */
export const tauriFetch: FetchImpl = (url, init) => pluginFetch(url, init);

// ---------------------------------------------------------------------------
// DB singleton
// ---------------------------------------------------------------------------

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:app.db");
  }
  return db;
}

// ---------------------------------------------------------------------------
// Keychain wrappers (fully dormant per Q34). Zero runtime call sites after
// the v0.1.2 migration fallbacks were removed — the DB is now the only
// credential store. These wrappers are kept so a future signed build can
// flip back to keychain-native storage with a small diff at each credential
// call site in this file. The Rust commands + keyring crate stay registered
// in src-tauri/ for the same reason.
// ---------------------------------------------------------------------------

// biome-ignore lint/correctness/noUnusedVariables: dormant rollback path (Q34)
async function keychainSet(key: string, password: string): Promise<void> {
  await invoke("keychain_set", { key, password });
}

// biome-ignore lint/correctness/noUnusedVariables: dormant rollback path (Q34)
async function keychainGet(key: string): Promise<string | null> {
  return await invoke<string | null>("keychain_get", { key });
}

// biome-ignore lint/correctness/noUnusedVariables: dormant rollback path (Q34)
async function keychainDelete(key: string): Promise<void> {
  await invoke("keychain_delete", { key });
}

// ---------------------------------------------------------------------------
// Tauri event bus (tray → webview). Wraps @tauri-apps/api/event.listen so
// component files don't have to import it directly (biome noRestrictedImports).
// Returns the unlisten function; call it in React cleanup.
// ---------------------------------------------------------------------------

export async function listenTauriEvent(event: string, handler: () => void): Promise<UnlistenFn> {
  return await listen(event, handler);
}

// ---------------------------------------------------------------------------
// Scheduler timer (Phase 31 / B-20 / Q36). The wall-clock timer for fetch +
// notify cadences lives in Rust (`src-tauri/src/scheduler.rs`) so it isn't
// throttled by macOS when the webview loses focus. The webview owns the
// cadence math; it computes the next fire time and arms the Rust worker via
// this command. After each tick fires (event "scheduler:fetch-tick" or
// "scheduler:notify-tick"), the webview re-arms.
// ---------------------------------------------------------------------------

export async function scheduleNextTick(kind: "fetch" | "notify", fireAtMs: number): Promise<void> {
  await invoke("schedule_next_tick", { args: { kind, fireAtMs } });
}

// biome-ignore lint/correctness/noUnusedVariables: dormant rollback path (Q34)
function childKeychainKey(childId: number): string {
  return `child-${childId}`;
}

// Q34: portal password lives in children.portal_password. These helpers
// are the only readers/writers of the column; public APIs wrap them.
async function setChildPasswordInDb(childId: number, password: string): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE children SET portal_password = $1 WHERE id = $2", [password, childId]);
}

async function getChildPasswordFromDb(childId: number): Promise<string | null> {
  const d = await getDb();
  const rows = await d.select<Array<{ portal_password: string | null }>>(
    "SELECT portal_password FROM children WHERE id = $1",
    [childId],
  );
  return rows[0]?.portal_password ?? null;
}

// ---------------------------------------------------------------------------
// Child CRUD (DB-backed credential storage per Q34; keychain code dormant)
// ---------------------------------------------------------------------------

export interface AddChildParams {
  displayName: string;
  baseUrl: string;
  username: string;
  password: string;
  grade?: string;
  school?: string;
  homeworkUrl?: string | null;
}

export async function addChild(params: AddChildParams): Promise<number> {
  const d = await getDb();

  const result = await d.execute(
    `INSERT INTO children (display_name, base_url, username, grade, school, homework_url)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.displayName,
      params.baseUrl,
      params.username,
      params.grade ?? null,
      params.school ?? null,
      params.homeworkUrl ?? null,
    ],
  );
  const childId = result.lastInsertId;
  if (childId == null) {
    throw new Error("INSERT returned no lastInsertId");
  }

  try {
    await setChildPasswordInDb(childId, params.password);
  } catch (e) {
    await d.execute("DELETE FROM children WHERE id = $1", [childId]);
    await pluginError(`addChild: password write failed, rolled back childId=${childId}`);
    throw new Error("Failed to store credentials", { cause: e });
  }

  await pluginInfo(`addChild: id=${childId} name=${params.displayName}`);
  return childId;
}

export async function removeChild(childId: number): Promise<void> {
  await pluginInfo(`removeChild: id=${childId}`);
  // DELETE FROM children drops the row (and its portal_password column).
  // Any leftover keychain entry from a v0.1.2-era install is harmless and
  // swept by resetAllAppData; not worth re-triggering a prompt here.
  const d = await getDb();
  await d.execute("DELETE FROM children WHERE id = $1", [childId]);
}

export async function updateChildPassword(childId: number, password: string): Promise<void> {
  await setChildPasswordInDb(childId, password);
}

export async function updateChildIdentity(
  childId: number,
  params: { displayName: string; username: string },
): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE children SET display_name = $1, username = $2 WHERE id = $3", [
    params.displayName,
    params.username,
    childId,
  ]);
  await pluginInfo(`updateChildIdentity: id=${childId} name=${params.displayName}`);
}

export async function setHomeworkUrl(childId: number, url: string | null): Promise<void> {
  const d = await getDb();
  await d.execute("UPDATE children SET homework_url = $1 WHERE id = $2", [url, childId]);
  await pluginInfo(`setHomeworkUrl: childId=${childId} configured=${url ? "true" : "false"}`);
}

export async function getChildPassword(childId: number): Promise<string | null> {
  return await getChildPasswordFromDb(childId);
}

interface RawChildRow {
  id: number;
  display_name: string;
  portal_type: string;
  base_url: string;
  username: string;
  grade: string | null;
  school: string | null;
  homework_url: string | null;
  created_at: string;
}

function mapChildRow(row: RawChildRow): ChildRecord {
  return {
    id: row.id,
    displayName: row.display_name,
    portalType: row.portal_type,
    baseUrl: row.base_url,
    username: row.username,
    grade: row.grade,
    school: row.school,
    homeworkUrl: row.homework_url,
    createdAt: sqliteUtcToIso(row.created_at),
  };
}

export async function getChildren(): Promise<ChildRecord[]> {
  const d = await getDb();
  const rows = await d.select<RawChildRow[]>("SELECT * FROM children ORDER BY id");
  return rows.map(mapChildRow);
}

export async function getChild(childId: number): Promise<ChildRecord | null> {
  const d = await getDb();
  const rows = await d.select<RawChildRow[]>("SELECT * FROM children WHERE id = $1", [childId]);
  const row = rows[0];
  return row ? mapChildRow(row) : null;
}

// ---------------------------------------------------------------------------
// Scrape persistence (T14)
// ---------------------------------------------------------------------------

export type FetchRunStatus = "success" | "failed" | "parser_error";

/**
 * Persist a scrape run and its results (v2 schema — Q17).
 * Upserts classes, inserts grades with progress, standards tree,
 * and deduplicated assignments.
 */
// ---------------------------------------------------------------------------
// FetchRunner lifecycle helpers (P3 / Q20)
// ---------------------------------------------------------------------------

/**
 * Create a `fetch_runs` row for a source about to run. Returns the id so the
 * source can FK its data rows (grades, homework, etc.) to this run.
 *
 * Note: placeholder `status='success'` during the run — flipped to the real
 * status by `completeFetchRun`. We don't introduce a 'running' state because
 * the existing CHECK constraint rejects it and migrating the constraint is
 * more cost than the observability gain (the window is a few seconds and the
 * app is single-user).
 */
export async function startFetchRun(childId: number, source: string): Promise<number> {
  const d = await getDb();
  const res = await d.execute(
    "INSERT INTO fetch_runs (child_id, source, status) VALUES ($1, $2, 'success')",
    [childId, source],
  );
  if (res.lastInsertId == null) {
    throw new Error("startFetchRun: INSERT returned no lastInsertId");
  }
  return res.lastInsertId;
}

/**
 * Finalize a `fetch_runs` row with the outcome. Called by `FetchRunner` after
 * the source's `run()` returns or throws.
 */
export async function completeFetchRun(
  id: number,
  result: { status: FetchRunStatus; durationMs: number; errorMessage?: string },
): Promise<void> {
  const d = await getDb();
  await d.execute(
    "UPDATE fetch_runs SET status = $1, duration_ms = $2, error_message = $3 WHERE id = $4",
    [result.status, result.durationMs, result.errorMessage ?? null, id],
  );
}

/**
 * Persist TeacherEase scrape data against an existing `fetch_runs` row
 * (created by `FetchRunner.runAll` via `startFetchRun`). Writes the raw
 * payload, upserts classes, and inserts grades + standards tree + deduped
 * assignments. Does NOT touch `fetch_runs` itself — the runner owns
 * lifecycle (status, duration, error).
 */
export async function persistTeacherEaseData(
  fetchRunId: number,
  overview: GradesOverview,
  classDetails: readonly ClassDetails[],
): Promise<void> {
  const d = await getDb();

  // Raw payload (full JSON for drilldown).
  await d.execute("INSERT INTO raw_payloads (fetch_run_id, json) VALUES ($1, $2)", [
    fetchRunId,
    JSON.stringify({ overview, classDetails }),
  ]);

  // Look up childId from the fetch_runs row for upsertClasses.
  const runRows = await d.select<Array<{ child_id: number }>>(
    "SELECT child_id FROM fetch_runs WHERE id = $1",
    [fetchRunId],
  );
  const childId = runRows[0]?.child_id;
  if (childId == null) {
    throw new Error(`persistTeacherEaseData: fetch_run_id=${fetchRunId} not found`);
  }

  // Upsert classes + insert grades with progress.
  const classIdMap = await upsertClasses(d, childId, overview.classes);

  for (const cls of overview.classes) {
    const classId = classIdMap.get(cls.classId);
    const notAssessed = cls.totalTargets - cls.targetsMeeting - cls.targetsNotMeeting;
    await d.execute(
      `INSERT INTO grades (fetch_run_id, class_id, class_name, current_grade, status, needs_attention,
                           targets_meeting, targets_not_meeting, targets_not_assessed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        fetchRunId,
        classId ?? null,
        cls.name,
        `${cls.statusCode}`,
        cls.status,
        cls.needsAttention ? 1 : 0,
        cls.targetsMeeting,
        cls.targetsNotMeeting,
        notAssessed,
      ],
    );
  }

  // Insert standards tree + deduplicated assignments per class detail.
  for (const detail of classDetails) {
    const cls = overview.classes.find((c) => c.name === detail.className);
    const classId = cls ? classIdMap.get(cls.classId) : undefined;
    if (!classId) continue;

    await persistStandards(d, fetchRunId, classId, detail.standards, null);
    await persistAssignmentsDeduplicated(
      d,
      fetchRunId,
      classId,
      detail.className,
      detail.standards,
    );
  }

  await pluginInfo(
    `persistTeacherEaseData: fetchRunId=${fetchRunId} childId=${childId} classes=${overview.classes.length} details=${classDetails.length}`,
  );
}

async function upsertClasses(
  d: Database,
  childId: number,
  classes: readonly ClassOverview[],
): Promise<Map<number, number>> {
  const classIdMap = new Map<number, number>();

  for (const cls of classes) {
    await d.execute(
      `INSERT INTO classes (child_id, te_class_id, te_cgpid, name, instructor, updated_at)
       VALUES ($1, $2, $3, $4, $5, datetime('now'))
       ON CONFLICT(child_id, te_class_id) DO UPDATE SET
         te_cgpid = $3, name = $4, instructor = $5, updated_at = datetime('now')`,
      [childId, cls.classId, cls.cgpId, cls.name, cls.instructor],
    );
    const rows = await d.select<Array<{ id: number }>>(
      "SELECT id FROM classes WHERE child_id = $1 AND te_class_id = $2",
      [childId, cls.classId],
    );
    const row = rows[0];
    if (row) classIdMap.set(cls.classId, row.id);
  }

  return classIdMap;
}

async function persistStandards(
  d: Database,
  fetchRunId: number,
  classId: number,
  standards: readonly Standard[],
  parentId: number | null,
): Promise<void> {
  for (const std of standards) {
    const res = await d.execute(
      `INSERT INTO standards (fetch_run_id, class_id, parent_id, name, score_numeric, score_letter, is_meeting)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        fetchRunId,
        classId,
        parentId,
        std.name,
        std.scoreNumeric || null,
        std.scoreLetter || null,
        std.isMeeting ? 1 : 0,
      ],
    );
    const stdId = res.lastInsertId;
    if (std.children.length > 0 && stdId != null) {
      await persistStandards(d, fetchRunId, classId, std.children, stdId);
    }
  }
}

async function persistAssignmentsDeduplicated(
  d: Database,
  fetchRunId: number,
  classId: number,
  className: string,
  standards: readonly Standard[],
): Promise<void> {
  const seen = new Set<number>();

  async function walk(stds: readonly Standard[]): Promise<void> {
    for (const std of stds) {
      for (const asn of std.assignments) {
        // Deduplicate: same assignment can appear under multiple standards
        if (asn.testNameId > 0 && seen.has(asn.testNameId)) continue;
        if (asn.testNameId > 0) seen.add(asn.testNameId);

        await d.execute(
          `INSERT INTO assignments (fetch_run_id, class_id, class_name, assignment_name,
                                    te_assignment_id, name, score, score_numeric, score_letter,
                                    weight, is_missing, due_date, feedback,
                                    max_score, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            fetchRunId,
            classId,
            className,
            asn.name,
            asn.testNameId || null,
            asn.name,
            asn.grade || null,
            asn.gradeNumeric || null,
            asn.gradeLetter || null,
            asn.weight ? Number.parseInt(asn.weight, 10) || null : null,
            asn.isMissing ? 1 : 0,
            asn.dueDate || null,
            asn.feedback || null,
            null, // max_score (legacy)
            asn.isMissing ? "missing" : asn.gradeLetter || null, // status (legacy)
          ],
        );
      }
      if (std.children.length > 0) await walk(std.children);
    }
  }

  await walk(standards);
}

// ---------------------------------------------------------------------------
// Read queries for UI (T15)
// ---------------------------------------------------------------------------

export interface FetchRunRecord {
  id: number;
  childId: number;
  source: string;
  runAt: string;
  status: FetchRunStatus;
  durationMs: number | null;
  errorMessage: string | null;
}

export interface GradeRecord {
  id: number;
  fetchRunId: number;
  classId: number | null;
  className: string;
  currentGrade: string | null;
  status: string | null;
  needsAttention: boolean;
  targetsMeeting: number | null;
  targetsNotMeeting: number | null;
  targetsNotAssessed: number | null;
}

export interface AssignmentRecord {
  id: number;
  fetchRunId: number;
  classId: number | null;
  className: string;
  assignmentName: string;
  score: string | null;
  scoreNumeric: number | null;
  scoreLetter: string | null;
  weight: number | null;
  isMissing: boolean;
  dueDate: string | null;
  feedback: string | null;
  teAssignmentId: number | null;
}

interface RawFetchRunRow {
  id: number;
  child_id: number;
  source: string;
  run_at: string;
  status: FetchRunStatus;
  duration_ms: number | null;
  error_message: string | null;
}

interface RawGradeRow {
  id: number;
  fetch_run_id: number;
  class_id: number | null;
  class_name: string;
  current_grade: string | null;
  status: string | null;
  needs_attention: number;
  targets_meeting: number | null;
  targets_not_meeting: number | null;
  targets_not_assessed: number | null;
}

interface RawAssignmentRow {
  id: number;
  fetch_run_id: number;
  class_id: number | null;
  class_name: string;
  assignment_name: string;
  te_assignment_id: number | null;
  name: string;
  score: string | null;
  score_numeric: number | null;
  score_letter: string | null;
  weight: number | null;
  is_missing: number;
  due_date: string | null;
  feedback: string | null;
}

/** SQLite's `datetime('now')` returns `"YYYY-MM-DD HH:MM:SS"` in UTC without
 *  a timezone suffix — WebKit / V8 parse that as LOCAL time, showing the
 *  clock 4-8h off in the UI. Normalize to proper ISO with `Z` so every
 *  `new Date()` consumer reads it correctly. */
function sqliteUtcToIso(raw: string): string {
  if (/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw)) {
    return `${raw.replace(" ", "T")}Z`;
  }
  return raw;
}

function mapFetchRunRow(row: RawFetchRunRow): FetchRunRecord {
  return {
    id: row.id,
    childId: row.child_id,
    source: row.source,
    runAt: sqliteUtcToIso(row.run_at),
    status: row.status,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
  };
}

export async function getLatestFetchRun(childId: number): Promise<FetchRunRecord | null> {
  const d = await getDb();
  const rows = await d.select<RawFetchRunRow[]>(
    "SELECT * FROM fetch_runs WHERE child_id = $1 ORDER BY run_at DESC LIMIT 1",
    [childId],
  );
  const row = rows[0];
  return row ? mapFetchRunRow(row) : null;
}

/**
 * Returns the most recent `fetch_runs` row for the child that is both from
 * the given source AND marked successful. Used by views that need to read
 * persisted scrape data (grades, assignments, class details) — those rows
 * are keyed by `fetch_run_id`, so consulting a failed or wrong-source run
 * would incorrectly surface "empty" even when prior good data exists.
 */
export async function getLatestSuccessfulFetchRun(
  childId: number,
  source: string,
): Promise<FetchRunRecord | null> {
  const d = await getDb();
  const rows = await d.select<RawFetchRunRow[]>(
    "SELECT * FROM fetch_runs WHERE child_id = $1 AND source = $2 AND status = 'success' ORDER BY run_at DESC LIMIT 1",
    [childId, source],
  );
  const row = rows[0];
  return row ? mapFetchRunRow(row) : null;
}

/**
 * Nearest successful fetch run strictly before `isoDate`.
 * Used for 24h-ago comparisons in the Recent Activity section.
 */
export async function getFetchRunBefore(
  childId: number,
  isoDate: string,
): Promise<FetchRunRecord | null> {
  const d = await getDb();
  const rows = await d.select<RawFetchRunRow[]>(
    "SELECT * FROM fetch_runs WHERE child_id = $1 AND run_at < $2 AND status = 'success' ORDER BY run_at DESC LIMIT 1",
    [childId, isoDate],
  );
  const row = rows[0];
  return row ? mapFetchRunRow(row) : null;
}

export async function getFetchRunsForChild(
  childId: number,
  limit = 100,
): Promise<FetchRunRecord[]> {
  const d = await getDb();
  const rows = await d.select<RawFetchRunRow[]>(
    "SELECT * FROM fetch_runs WHERE child_id = $1 ORDER BY run_at DESC LIMIT $2",
    [childId, limit],
  );
  return rows.map(mapFetchRunRow);
}

function mapGradeRow(r: RawGradeRow): GradeRecord {
  return {
    id: r.id,
    fetchRunId: r.fetch_run_id,
    classId: r.class_id,
    className: r.class_name,
    currentGrade: r.current_grade,
    status: r.status,
    needsAttention: r.needs_attention === 1,
    targetsMeeting: r.targets_meeting,
    targetsNotMeeting: r.targets_not_meeting,
    targetsNotAssessed: r.targets_not_assessed,
  };
}

function mapAssignmentRow(r: RawAssignmentRow): AssignmentRecord {
  return {
    id: r.id,
    fetchRunId: r.fetch_run_id,
    classId: r.class_id,
    className: r.class_name,
    assignmentName: r.assignment_name ?? r.name,
    score: r.score,
    scoreNumeric: r.score_numeric,
    scoreLetter: r.score_letter,
    weight: r.weight,
    isMissing: r.is_missing === 1,
    dueDate: r.due_date,
    feedback: r.feedback,
    teAssignmentId: r.te_assignment_id,
  };
}

export async function getGradesForFetchRun(fetchRunId: number): Promise<GradeRecord[]> {
  const d = await getDb();
  const rows = await d.select<RawGradeRow[]>("SELECT * FROM grades WHERE fetch_run_id = $1", [
    fetchRunId,
  ]);
  return rows.map(mapGradeRow);
}

export async function getAssignmentsForFetchRun(fetchRunId: number): Promise<AssignmentRecord[]> {
  const d = await getDb();
  const rows = await d.select<RawAssignmentRow[]>(
    "SELECT * FROM assignments WHERE fetch_run_id = $1",
    [fetchRunId],
  );
  return rows.map(mapAssignmentRow);
}

// ---------------------------------------------------------------------------
// Classes metadata (Q17 v2)
// ---------------------------------------------------------------------------

export interface ClassRecord {
  id: number;
  childId: number;
  name: string;
  instructor: string | null;
  teClassId: number;
  teCgpid: number;
}

interface RawClassRow {
  id: number;
  child_id: number;
  name: string;
  instructor: string | null;
  te_class_id: number;
  te_cgpid: number;
}

export async function getClasses(childId: number): Promise<ClassRecord[]> {
  const d = await getDb();
  const rows = await d.select<RawClassRow[]>(
    "SELECT id, child_id, name, instructor, te_class_id, te_cgpid FROM classes WHERE child_id = $1 ORDER BY name",
    [childId],
  );
  return rows.map((r) => ({
    id: r.id,
    childId: r.child_id,
    name: r.name,
    instructor: r.instructor,
    teClassId: r.te_class_id,
    teCgpid: r.te_cgpid,
  }));
}

// ---------------------------------------------------------------------------
// Status history (T33 — grade trend dots per Q16)
// ---------------------------------------------------------------------------

export interface StatusHistoryEntry {
  status: string | null;
  needsAttention: boolean;
  runAt: string;
}

interface RawStatusHistoryRow {
  class_name: string;
  status: string | null;
  needs_attention: number;
  run_at: string;
}

/**
 * Returns the last `limit` scrape statuses for ALL classes of a child.
 * Grouped by class name. Avoids N+1 queries (one per class row).
 * Each array is newest-first.
 */
export async function getAllStatusHistory(
  childId: number,
  limit = 5,
): Promise<Map<string, StatusHistoryEntry[]>> {
  const d = await getDb();

  // Window function ranks fetch runs per class, then we filter to top N.
  // SQLite supports ROW_NUMBER() since 3.25 (2018).
  const rows = await d.select<RawStatusHistoryRow[]>(
    `SELECT class_name, status, needs_attention, run_at FROM (
       SELECT g.class_name, g.status, g.needs_attention, f.run_at,
              ROW_NUMBER() OVER (PARTITION BY g.class_name ORDER BY f.run_at DESC) AS rn
       FROM grades g JOIN fetch_runs f ON g.fetch_run_id = f.id
       WHERE f.child_id = $1 AND f.status = 'success'
     ) WHERE rn <= $2
     ORDER BY class_name, run_at DESC`,
    [childId, limit],
  );

  const result = new Map<string, StatusHistoryEntry[]>();
  for (const r of rows) {
    const entry: StatusHistoryEntry = {
      status: r.status,
      needsAttention: r.needs_attention === 1,
      runAt: r.run_at,
    };
    const existing = result.get(r.class_name);
    if (existing) {
      existing.push(entry);
    } else {
      result.set(r.class_name, [entry]);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Class detail from raw payload (T34 — accordion drilldown per Q16)
// ---------------------------------------------------------------------------

interface RawPayloadRow {
  json: string;
}

/**
 * Extract ClassDetails for a single class from the raw_payloads JSON.
 * Returns null if no detail was captured for this class (only "needs attention"
 * classes get detail pages fetched during scrape).
 */
export async function getClassDetail(
  fetchRunId: number,
  className: string,
): Promise<ClassDetails | null> {
  const d = await getDb();
  const rows = await d.select<RawPayloadRow[]>(
    "SELECT json FROM raw_payloads WHERE fetch_run_id = $1",
    [fetchRunId],
  );
  const row = rows[0];
  if (!row) return null;

  const payload = JSON.parse(row.json) as {
    classDetails?: ClassDetails[];
  };

  return payload.classDetails?.find((cd) => cd.className === className) ?? null;
}

/**
 * All ClassDetails captured in this scrape's raw payload. Feeds the attention
 * engine (Phase 15 / Q25) which walks the whole tree to compute per-class and
 * per-child attention status. Returns [] if the payload is missing.
 */
export async function getAllClassDetails(fetchRunId: number): Promise<ClassDetails[]> {
  const d = await getDb();
  const rows = await d.select<RawPayloadRow[]>(
    "SELECT json FROM raw_payloads WHERE fetch_run_id = $1",
    [fetchRunId],
  );
  const row = rows[0];
  if (!row) return [];
  const payload = JSON.parse(row.json) as { classDetails?: ClassDetails[] };
  return payload.classDetails ?? [];
}

// ---------------------------------------------------------------------------
// Homework (Q19 / H3) — persisted as ISO dates (YYYY-MM-DD) so the
// idx_homework_child_date index sorts correctly across month/year boundaries.
// ---------------------------------------------------------------------------

export interface HomeworkRecord {
  id: number;
  childId: number;
  hwDate: string;
  subject: string;
  content: string;
  dueDate: string | null;
  dueDateInferred: boolean;
  scrapedAt: string;
}

interface RawHomeworkRow {
  id: number;
  child_id: number;
  hw_date: string;
  subject: string;
  content: string;
  due_date: string | null;
  due_date_inferred: number;
  scraped_at: string;
}

function mapHomeworkRow(r: RawHomeworkRow): HomeworkRecord {
  return {
    id: r.id,
    childId: r.child_id,
    hwDate: r.hw_date,
    subject: r.subject,
    content: r.content,
    dueDate: r.due_date,
    dueDateInferred: r.due_date_inferred === 1,
    scrapedAt: sqliteUtcToIso(r.scraped_at),
  };
}

/**
 * Upsert homework entries for a child. Every valid entry is persisted
 * (no month filter — per Q32 supersede of Q19). Idempotent via
 * `UNIQUE(child_id, hw_date, subject)`.
 */
export async function persistHomework(
  childId: number,
  entries: readonly HomeworkEntry[],
  _now: Date = new Date(),
): Promise<number> {
  const d = await getDb();

  let persisted = 0;
  let inferredCount = 0;
  for (const entry of entries) {
    const iso = hwDateToIso(entry.date);
    if (!iso) continue;
    if (entry.subjects.length === 0) continue;

    for (const subj of entry.subjects) {
      const resolved = resolveDueDate(subj.dueDate, iso);
      if (resolved.inferred) inferredCount += 1;
      await d.execute(
        `INSERT INTO homework (child_id, hw_date, subject, content, due_date, due_date_inferred)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT(child_id, hw_date, subject) DO UPDATE SET
           content = excluded.content,
           due_date = excluded.due_date,
           due_date_inferred = excluded.due_date_inferred,
           scraped_at = datetime('now')`,
        [childId, iso, subj.name, subj.content, resolved.iso, resolved.inferred ? 1 : 0],
      );
      persisted += 1;
    }
  }

  await pluginInfo(
    `homework: persisted childId=${childId} rows=${persisted} entries=${entries.length} inferredDueDates=${inferredCount}`,
  );
  return persisted;
}

/**
 * Returns homework rows where either `hw_date` OR `due_date` equals `iso`.
 * Caller splits client-side into "homework for today" (hw_date matches) and
 * "homework due today" (due_date matches) — same row can be in both.
 */
export async function getHomeworkForDay(childId: number, iso: string): Promise<HomeworkRecord[]> {
  const d = await getDb();
  const rows = await d.select<RawHomeworkRow[]>(
    "SELECT * FROM homework WHERE child_id = $1 AND (hw_date = $2 OR due_date = $2) ORDER BY hw_date, id",
    [childId, iso],
  );
  return rows.map(mapHomeworkRow);
}

/** Distinct year-months with homework for this child, descending + counts.
 *  Used by History tab's month dropdown (Q32). */
export async function getHomeworkMonths(
  childId: number,
): Promise<Array<{ yearMonth: string; count: number }>> {
  const d = await getDb();
  const rows = await d.select<Array<{ year_month: string; n: number }>>(
    `SELECT substr(hw_date, 1, 7) AS year_month, COUNT(*) AS n
     FROM homework WHERE child_id = $1
     GROUP BY year_month
     ORDER BY year_month DESC`,
    [childId],
  );
  return rows.map((r) => ({ yearMonth: r.year_month, count: r.n }));
}

/** All homework rows for the given "YYYY-MM" (local), sorted chronologically. */
export async function getHomeworkByMonth(
  childId: number,
  yearMonth: string,
): Promise<HomeworkRecord[]> {
  const d = await getDb();
  const rows = await d.select<RawHomeworkRow[]>(
    "SELECT * FROM homework WHERE child_id = $1 AND substr(hw_date, 1, 7) = $2 ORDER BY hw_date, id",
    [childId, yearMonth],
  );
  return rows.map(mapHomeworkRow);
}

// ---------------------------------------------------------------------------
// Settings (Q13) — key/value store. Booleans stored as "1" / "0".
// ---------------------------------------------------------------------------

export async function getSettingBool(key: string, defaultValue: boolean): Promise<boolean> {
  const d = await getDb();
  const rows = await d.select<Array<{ value: string }>>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  const row = rows[0];
  if (!row) return defaultValue;
  return row.value === "1";
}

export async function setSettingBool(key: string, value: boolean): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [key, value ? "1" : "0"],
  );
}

export async function getSettingString(key: string, defaultValue: string): Promise<string> {
  const d = await getDb();
  const rows = await d.select<Array<{ value: string }>>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? defaultValue;
}

export async function setSettingString(key: string, value: string): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [key, value],
  );
}

/**
 * Attention engine config (Phase 15 AT2). Reads `attention.forgivenessWeeks`
 * and `attention.lowScoreThreshold` from `settings`, falls back to engine
 * defaults (2 weeks / 3.0) via `parseAttentionConfig` when unset or invalid.
 * The Settings → Attention sub-tab that writes these keys lands in AT5.
 */
export async function getAttentionConfig(): Promise<AttentionConfig> {
  const weeks = await getSettingString("attention.forgivenessWeeks", "");
  const threshold = await getSettingString("attention.lowScoreThreshold", "");
  return parseAttentionConfig(weeks, threshold);
}

// ---------------------------------------------------------------------------
// SMTP (Q4 / E1, Q34) — password stored in `settings` under `smtp.password`,
// alongside the other smtp.* fields (host/port/user/from/to). Keychain
// key `smtp-main` remains for one-time migration of v0.1.2-era installs.
// ---------------------------------------------------------------------------

const SMTP_PASSWORD_SETTING_KEY = "smtp.password";

export async function getSmtpPassword(): Promise<string | null> {
  const fromDb = await getSettingString(SMTP_PASSWORD_SETTING_KEY, "");
  return fromDb === "" ? null : fromDb;
}

export async function setSmtpPassword(password: string): Promise<void> {
  await setSettingString(SMTP_PASSWORD_SETTING_KEY, password);
}

export async function deleteSmtpPassword(): Promise<void> {
  const d = await getDb();
  await d.execute("DELETE FROM settings WHERE key = $1", [SMTP_PASSWORD_SETTING_KEY]);
}

export interface SendEmailArgs {
  host: string;
  port: number;
  username: string;
  password: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  htmlBody?: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<void> {
  await invoke("send_email", { args });
}

// ---------------------------------------------------------------------------
// Updater (R2) — wraps tauri-plugin-updater + tauri-plugin-process.
// ---------------------------------------------------------------------------

export interface UpdateInfo {
  version: string;
  notes: string | null;
  date: string | null;
}

/** Currently installed app version — sourced from tauri.conf.json at build time. */
export async function getAppVersion(): Promise<string> {
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body ?? null,
    date: update.date ?? null,
  };
}

export async function installUpdate(): Promise<void> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const { relaunch } = await import("@tauri-apps/plugin-process");
  const update = await check();
  if (!update) throw new Error("No update available");
  await update.downloadAndInstall();
  await relaunch();
}

const DISMISSED_UPDATE_KEY = "updater.dismissedVersion";
const LAST_CHECKED_KEY = "updater.lastCheckedAt";

export async function getDismissedUpdateVersion(): Promise<string | null> {
  const v = await getSettingString(DISMISSED_UPDATE_KEY, "");
  return v || null;
}

export async function dismissUpdateVersion(version: string): Promise<void> {
  await setSettingString(DISMISSED_UPDATE_KEY, version);
}

export async function getLastUpdateCheckMs(): Promise<number> {
  const v = await getSettingString(LAST_CHECKED_KEY, "");
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

export async function setLastUpdateCheckMs(ms: number): Promise<void> {
  await setSettingString(LAST_CHECKED_KEY, String(ms));
}

/** Wipe everything back to first-install state: every DB table's rows (which
 *  per Q34 now includes the portal passwords and smtp.password), autostart,
 *  and the disclaimer flag. Schema stays intact (migrations re-run cleanly on
 *  next launch). Caller typically chains this with `quitApp()` so the user
 *  relaunches fresh.
 *
 *  Legacy keychain entries from v0.1.2-era installs are deliberately NOT
 *  swept here — each keychainDelete triggers a macOS ACL prompt on unsigned
 *  builds (the very UX problem Q34 moved away from). Orphaned keychain
 *  entries are harmless; the first-launch docs describe manual cleanup via
 *  Keychain Access for users who want it. */
export async function resetAllAppData(): Promise<void> {
  const d = await getDb();

  // Wipe every DB table. Order matters for FKs (children last).
  await d.execute("DELETE FROM grades");
  await d.execute("DELETE FROM assignments");
  await d.execute("DELETE FROM standards");
  await d.execute("DELETE FROM classes");
  await d.execute("DELETE FROM homework");
  await d.execute("DELETE FROM raw_payloads");
  await d.execute("DELETE FROM fetch_runs");
  await d.execute("DELETE FROM settings");
  await d.execute("DELETE FROM children");

  // 3. Disable autostart (best-effort; plugin tolerates already-disabled).
  try {
    await disableAutostart();
  } catch {
    // Best-effort.
  }

  await pluginInfo("settings: resetAllAppData executed");
}

/** Quit the app immediately (used after resetAllAppData so the next
 *  launch replays the disclaimer gate). Wraps tauri-plugin-process. */
export async function quitApp(): Promise<void> {
  const { exit } = await import("@tauri-apps/plugin-process");
  await exit(0);
}

// ---------------------------------------------------------------------------
// Autostart (T28)
// ---------------------------------------------------------------------------

export async function setupAutostart(): Promise<void> {
  const enabled = await isAutostartEnabled();
  if (!enabled) {
    await enableAutostart();
  }
}

export async function disableAutostart(): Promise<void> {
  const { disable } = await import("@tauri-apps/plugin-autostart");
  await disable();
}

export async function checkAutostartEnabled(): Promise<boolean> {
  return await isAutostartEnabled();
}

// ---------------------------------------------------------------------------
// Logging (Q14, Phase 28) — routes to tauri-plugin-log. The plugin's built-in
// IPC carries webview-source lines into the same single sink the Rust side
// writes to (<appDataDir>/logs/app.log). Public wrappers keep their original
// names so component call sites don't change. Plugin tags webview lines with
// logger="webview" natively (replaces the old [webview] string prefix).
// Never log PII or secrets (see CLAUDE.md).
// ---------------------------------------------------------------------------

import {
  error as pluginError,
  info as pluginInfo,
  warn as pluginWarn,
} from "@tauri-apps/plugin-log";

export async function initLogging(): Promise<void> {
  await pluginInfo("frontend logging initialized");
}

export async function log(message: string): Promise<void> {
  await pluginInfo(message);
}

export async function logWarning(message: string): Promise<void> {
  await pluginWarn(message);
}

export async function logErr(message: string): Promise<void> {
  await pluginError(message);
}

export async function openLogDir(): Promise<void> {
  await invoke("open_log_dir");
}
