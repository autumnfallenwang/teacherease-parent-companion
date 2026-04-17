// Thin facade over Tauri IPC. All calls from React into the Rust shell and
// Tauri plugins go through this file — components never import from
// `@tauri-apps/*` directly. See design-plan.md "Forward compatibility."
//
// A future web version replaces this file with src/lib/api.ts (REST client)
// and every React component keeps working.

import { invoke } from "@tauri-apps/api/core";
import {
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import Database from "@tauri-apps/plugin-sql";
import type {
  ChildRecord,
  ClassDetails,
  ClassOverview,
  GradesOverview,
  Standard,
} from "./scraper/types";

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
// Keychain (thin wrappers around Rust #[tauri::command] handlers)
// ---------------------------------------------------------------------------

async function keychainSet(key: string, password: string): Promise<void> {
  await invoke("keychain_set", { key, password });
}

async function keychainGet(key: string): Promise<string | null> {
  return await invoke<string | null>("keychain_get", { key });
}

async function keychainDelete(key: string): Promise<void> {
  await invoke("keychain_delete", { key });
}

function childKeychainKey(childId: number): string {
  return `child-${childId}`;
}

// ---------------------------------------------------------------------------
// Child CRUD (DB + keychain orchestration per Q3 atomicity pattern)
// ---------------------------------------------------------------------------

export interface AddChildParams {
  displayName: string;
  baseUrl: string;
  username: string;
  password: string;
  grade?: string;
  school?: string;
}

export async function addChild(params: AddChildParams): Promise<number> {
  const d = await getDb();

  const result = await d.execute(
    `INSERT INTO children (display_name, base_url, username, grade, school)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      params.displayName,
      params.baseUrl,
      params.username,
      params.grade ?? null,
      params.school ?? null,
    ],
  );
  const childId = result.lastInsertId;
  if (childId == null) {
    throw new Error("INSERT returned no lastInsertId");
  }

  try {
    await keychainSet(childKeychainKey(childId), params.password);
  } catch (e) {
    await d.execute("DELETE FROM children WHERE id = $1", [childId]);
    await invoke("log_error", {
      message: `addChild: keychain failed, rolled back childId=${childId}`,
    });
    throw new Error("Failed to store credentials", { cause: e });
  }

  await invoke("log_info", {
    message: `addChild: id=${childId} name=${params.displayName}`,
  });
  return childId;
}

export async function removeChild(childId: number): Promise<void> {
  await invoke("log_info", { message: `removeChild: id=${childId}` });
  await keychainDelete(childKeychainKey(childId));
  const d = await getDb();
  await d.execute("DELETE FROM children WHERE id = $1", [childId]);
}

export async function updateChildPassword(childId: number, password: string): Promise<void> {
  await keychainSet(childKeychainKey(childId), password);
}

export async function getChildPassword(childId: number): Promise<string | null> {
  return await keychainGet(childKeychainKey(childId));
}

interface RawChildRow {
  id: number;
  display_name: string;
  portal_type: string;
  base_url: string;
  username: string;
  grade: string | null;
  school: string | null;
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
    createdAt: row.created_at,
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

export type ScrapeStatus = "success" | "failed" | "parser_error";

export interface ScrapeResult {
  childId: number;
  status: ScrapeStatus;
  durationMs: number;
  errorMessage?: string;
  overview?: GradesOverview;
  classDetails?: ClassDetails[];
  rawPayload?: string;
}

/**
 * Persist a scrape run and its results (v2 schema — Q17).
 * Upserts classes, inserts grades with progress, standards tree,
 * and deduplicated assignments.
 */
export async function persistScrape(result: ScrapeResult): Promise<number> {
  const d = await getDb();

  // 1. Insert scrape record
  const scrapeRes = await d.execute(
    `INSERT INTO scrapes (child_id, status, duration_ms, error_message)
     VALUES ($1, $2, $3, $4)`,
    [result.childId, result.status, result.durationMs, result.errorMessage ?? null],
  );
  const scrapeId = scrapeRes.lastInsertId;
  if (scrapeId == null) {
    throw new Error("INSERT scrape returned no lastInsertId");
  }

  // 2. Raw payload (full JSON for drilldown)
  if (result.rawPayload) {
    await d.execute("INSERT INTO raw_payloads (scrape_id, json) VALUES ($1, $2)", [
      scrapeId,
      result.rawPayload,
    ]);
  }

  // 3. Upsert classes + insert grades with progress
  if (result.overview) {
    const classIdMap = await upsertClasses(d, result.childId, result.overview.classes);

    for (const cls of result.overview.classes) {
      const classId = classIdMap.get(cls.classId);
      const notAssessed = cls.totalTargets - cls.targetsMeeting - cls.targetsNotMeeting;
      await d.execute(
        `INSERT INTO grades (scrape_id, class_id, class_name, current_grade, status, needs_attention,
                             targets_meeting, targets_not_meeting, targets_not_assessed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          scrapeId,
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

    // 4. Insert standards tree + deduplicated assignments per class detail
    if (result.classDetails) {
      for (const detail of result.classDetails) {
        const cls = result.overview.classes.find((c) => c.name === detail.className);
        const classId = cls ? classIdMap.get(cls.classId) : undefined;
        if (!classId) continue;

        await persistStandards(d, scrapeId, classId, detail.standards, null);
        await persistAssignmentsDeduplicated(
          d,
          scrapeId,
          classId,
          detail.className,
          detail.standards,
        );
      }
    }
  }

  await invoke("log_info", {
    message: `persistScrape: scrapeId=${scrapeId} childId=${result.childId} status=${result.status} duration=${result.durationMs}ms`,
  });
  return scrapeId;
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
  scrapeId: number,
  classId: number,
  standards: readonly Standard[],
  parentId: number | null,
): Promise<void> {
  for (const std of standards) {
    const res = await d.execute(
      `INSERT INTO standards (scrape_id, class_id, parent_id, name, score_numeric, score_letter, is_meeting)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        scrapeId,
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
      await persistStandards(d, scrapeId, classId, std.children, stdId);
    }
  }
}

async function persistAssignmentsDeduplicated(
  d: Database,
  scrapeId: number,
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
          `INSERT INTO assignments (scrape_id, class_id, class_name, assignment_name,
                                    te_assignment_id, name, score, score_numeric, score_letter,
                                    weight, is_missing, due_date, feedback,
                                    max_score, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            scrapeId,
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

export interface ScrapeRecord {
  id: number;
  childId: number;
  runAt: string;
  status: ScrapeStatus;
  durationMs: number | null;
  errorMessage: string | null;
}

export interface GradeRecord {
  id: number;
  scrapeId: number;
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
  scrapeId: number;
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

interface RawScrapeRow {
  id: number;
  child_id: number;
  run_at: string;
  status: ScrapeStatus;
  duration_ms: number | null;
  error_message: string | null;
}

interface RawGradeRow {
  id: number;
  scrape_id: number;
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
  scrape_id: number;
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

function mapScrapeRow(row: RawScrapeRow): ScrapeRecord {
  return {
    id: row.id,
    childId: row.child_id,
    runAt: row.run_at,
    status: row.status,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
  };
}

export async function getLatestScrape(childId: number): Promise<ScrapeRecord | null> {
  const d = await getDb();
  const rows = await d.select<RawScrapeRow[]>(
    "SELECT * FROM scrapes WHERE child_id = $1 ORDER BY run_at DESC LIMIT 1",
    [childId],
  );
  const row = rows[0];
  return row ? mapScrapeRow(row) : null;
}

/**
 * Nearest successful scrape strictly before `isoDate`.
 * Used for 24h-ago comparisons in the Recent Activity section.
 */
export async function getScrapeBefore(
  childId: number,
  isoDate: string,
): Promise<ScrapeRecord | null> {
  const d = await getDb();
  const rows = await d.select<RawScrapeRow[]>(
    "SELECT * FROM scrapes WHERE child_id = $1 AND run_at < $2 AND status = 'success' ORDER BY run_at DESC LIMIT 1",
    [childId, isoDate],
  );
  const row = rows[0];
  return row ? mapScrapeRow(row) : null;
}

function mapGradeRow(r: RawGradeRow): GradeRecord {
  return {
    id: r.id,
    scrapeId: r.scrape_id,
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
    scrapeId: r.scrape_id,
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

export async function getGradesForScrape(scrapeId: number): Promise<GradeRecord[]> {
  const d = await getDb();
  const rows = await d.select<RawGradeRow[]>("SELECT * FROM grades WHERE scrape_id = $1", [
    scrapeId,
  ]);
  return rows.map(mapGradeRow);
}

export async function getAssignmentsForScrape(scrapeId: number): Promise<AssignmentRecord[]> {
  const d = await getDb();
  const rows = await d.select<RawAssignmentRow[]>(
    "SELECT * FROM assignments WHERE scrape_id = $1",
    [scrapeId],
  );
  return rows.map(mapAssignmentRow);
}

export async function getNeedsAttentionGrades(scrapeId: number): Promise<GradeRecord[]> {
  const d = await getDb();
  const rows = await d.select<RawGradeRow[]>(
    "SELECT * FROM grades WHERE scrape_id = $1 AND needs_attention = 1",
    [scrapeId],
  );
  return rows.map(mapGradeRow);
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

  // Window function ranks scrapes per class, then we filter to top N.
  // SQLite supports ROW_NUMBER() since 3.25 (2018).
  const rows = await d.select<RawStatusHistoryRow[]>(
    `SELECT class_name, status, needs_attention, run_at FROM (
       SELECT g.class_name, g.status, g.needs_attention, s.run_at,
              ROW_NUMBER() OVER (PARTITION BY g.class_name ORDER BY s.run_at DESC) AS rn
       FROM grades g JOIN scrapes s ON g.scrape_id = s.id
       WHERE s.child_id = $1 AND s.status = 'success'
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
  scrapeId: number,
  className: string,
): Promise<ClassDetails | null> {
  const d = await getDb();
  const rows = await d.select<RawPayloadRow[]>(
    "SELECT json FROM raw_payloads WHERE scrape_id = $1",
    [scrapeId],
  );
  const row = rows[0];
  if (!row) return null;

  const payload = JSON.parse(row.json) as {
    classDetails?: ClassDetails[];
  };

  return payload.classDetails?.find((cd) => cd.className === className) ?? null;
}

export async function getMissingAssignments(scrapeId: number): Promise<AssignmentRecord[]> {
  const d = await getDb();
  // Query both old (status='missing') and new (is_missing=1) columns for compat
  const rows = await d.select<RawAssignmentRow[]>(
    "SELECT * FROM assignments WHERE scrape_id = $1 AND (is_missing = 1 OR status = 'missing')",
    [scrapeId],
  );
  return rows.map(mapAssignmentRow);
}

// ---------------------------------------------------------------------------
// Notifications (T27)
// ---------------------------------------------------------------------------

export async function ensureNotificationPermission(): Promise<boolean> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const result = await requestPermission();
    granted = result === "granted";
  }
  return granted;
}

export async function notifyNeedsAttention(
  childName: string,
  attentionCount: number,
  missingCount: number,
): Promise<void> {
  const granted = await ensureNotificationPermission();
  if (!granted) {
    await invoke("log_warn", { message: "notification: permission not granted, skipping" });
    return;
  }

  const parts: string[] = [];
  if (attentionCount > 0)
    parts.push(`${attentionCount} class${attentionCount > 1 ? "es" : ""} need attention`);
  if (missingCount > 0)
    parts.push(`${missingCount} missing assignment${missingCount > 1 ? "s" : ""}`);
  if (parts.length === 0) return;

  await invoke("log_info", {
    message: `notification: sent attention=${attentionCount} missing=${missingCount}`,
  });
  sendNotification({
    title: `${childName}: Grade update`,
    body: parts.join(", "),
  });
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
// Logging (Q14) — routes to Rust JSON logger via custom commands.
// Never log PII or secrets (see CLAUDE.md).
// ---------------------------------------------------------------------------

export async function initLogging(): Promise<void> {
  await invoke("log_info", { message: "frontend logging initialized" });
}

export async function log(message: string): Promise<void> {
  await invoke("log_info", { message });
}

export async function logWarning(message: string): Promise<void> {
  await invoke("log_warn", { message });
}

export async function logErr(message: string): Promise<void> {
  await invoke("log_error", { message });
}

export async function openLogDir(): Promise<void> {
  await invoke("open_log_dir");
}
