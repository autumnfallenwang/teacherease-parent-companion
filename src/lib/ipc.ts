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
import type { ChildRecord, ClassDetails, GradesOverview, Standard } from "./scraper/types";

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
    throw new Error("Failed to store credentials", { cause: e });
  }

  return childId;
}

export async function removeChild(childId: number): Promise<void> {
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
 * Persist a scrape run and its results. Inserts into scrapes, raw_payloads,
 * grades, and assignments tables in one batch.
 */
export async function persistScrape(result: ScrapeResult): Promise<number> {
  const d = await getDb();

  const scrapeRes = await d.execute(
    `INSERT INTO scrapes (child_id, status, duration_ms, error_message)
     VALUES ($1, $2, $3, $4)`,
    [result.childId, result.status, result.durationMs, result.errorMessage ?? null],
  );
  const scrapeId = scrapeRes.lastInsertId;
  if (scrapeId == null) {
    throw new Error("INSERT scrape returned no lastInsertId");
  }

  if (result.rawPayload) {
    await d.execute("INSERT INTO raw_payloads (scrape_id, json) VALUES ($1, $2)", [
      scrapeId,
      result.rawPayload,
    ]);
  }

  if (result.overview) {
    for (const cls of result.overview.classes) {
      await d.execute(
        `INSERT INTO grades (scrape_id, class_name, current_grade, status, needs_attention)
         VALUES ($1, $2, $3, $4, $5)`,
        [scrapeId, cls.name, `${cls.statusCode}`, cls.status, cls.needsAttention ? 1 : 0],
      );
    }
  }

  if (result.classDetails) {
    for (const detail of result.classDetails) {
      await persistAssignments(d, scrapeId, detail);
    }
  }

  return scrapeId;
}

async function persistAssignments(
  d: Database,
  scrapeId: number,
  detail: ClassDetails,
): Promise<void> {
  for (const standard of detail.standards) {
    await persistStandardAssignments(d, scrapeId, detail.className, standard);
  }
}

async function persistStandardAssignments(
  d: Database,
  scrapeId: number,
  className: string,
  standard: Standard,
): Promise<void> {
  for (const asn of standard.assignments) {
    await d.execute(
      `INSERT INTO assignments (scrape_id, class_name, assignment_name, score, max_score, status, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        scrapeId,
        className,
        asn.name,
        asn.grade,
        null,
        asn.isMissing ? "missing" : asn.gradeLetter || null,
        asn.dueDate || null,
      ],
    );
  }

  for (const child of standard.children) {
    await persistStandardAssignments(d, scrapeId, className, child);
  }
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
  className: string;
  currentGrade: string | null;
  status: string | null;
  needsAttention: boolean;
}

export interface AssignmentRecord {
  id: number;
  scrapeId: number;
  className: string;
  assignmentName: string;
  score: string | null;
  maxScore: string | null;
  status: string | null;
  dueDate: string | null;
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
  class_name: string;
  current_grade: string | null;
  status: string | null;
  needs_attention: number;
}

interface RawAssignmentRow {
  id: number;
  scrape_id: number;
  class_name: string;
  assignment_name: string;
  score: string | null;
  max_score: string | null;
  status: string | null;
  due_date: string | null;
}

export async function getLatestScrape(childId: number): Promise<ScrapeRecord | null> {
  const d = await getDb();
  const rows = await d.select<RawScrapeRow[]>(
    "SELECT * FROM scrapes WHERE child_id = $1 ORDER BY run_at DESC LIMIT 1",
    [childId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    childId: row.child_id,
    runAt: row.run_at,
    status: row.status,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
  };
}

export async function getGradesForScrape(scrapeId: number): Promise<GradeRecord[]> {
  const d = await getDb();
  const rows = await d.select<RawGradeRow[]>("SELECT * FROM grades WHERE scrape_id = $1", [
    scrapeId,
  ]);
  return rows.map((r) => ({
    id: r.id,
    scrapeId: r.scrape_id,
    className: r.class_name,
    currentGrade: r.current_grade,
    status: r.status,
    needsAttention: r.needs_attention === 1,
  }));
}

export async function getAssignmentsForScrape(scrapeId: number): Promise<AssignmentRecord[]> {
  const d = await getDb();
  const rows = await d.select<RawAssignmentRow[]>(
    "SELECT * FROM assignments WHERE scrape_id = $1",
    [scrapeId],
  );
  return rows.map((r) => ({
    id: r.id,
    scrapeId: r.scrape_id,
    className: r.class_name,
    assignmentName: r.assignment_name,
    score: r.score,
    maxScore: r.max_score,
    status: r.status,
    dueDate: r.due_date,
  }));
}

export async function getNeedsAttentionGrades(scrapeId: number): Promise<GradeRecord[]> {
  const d = await getDb();
  const rows = await d.select<RawGradeRow[]>(
    "SELECT * FROM grades WHERE scrape_id = $1 AND needs_attention = 1",
    [scrapeId],
  );
  return rows.map((r) => ({
    id: r.id,
    scrapeId: r.scrape_id,
    className: r.class_name,
    currentGrade: r.current_grade,
    status: r.status,
    needsAttention: true,
  }));
}

export async function getMissingAssignments(scrapeId: number): Promise<AssignmentRecord[]> {
  const d = await getDb();
  const rows = await d.select<RawAssignmentRow[]>(
    "SELECT * FROM assignments WHERE scrape_id = $1 AND status = 'missing'",
    [scrapeId],
  );
  return rows.map((r) => ({
    id: r.id,
    scrapeId: r.scrape_id,
    className: r.class_name,
    assignmentName: r.assignment_name,
    score: r.score,
    maxScore: r.max_score,
    status: r.status,
    dueDate: r.due_date,
  }));
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
  if (!granted) return;

  const parts: string[] = [];
  if (attentionCount > 0)
    parts.push(`${attentionCount} class${attentionCount > 1 ? "es" : ""} need attention`);
  if (missingCount > 0)
    parts.push(`${missingCount} missing assignment${missingCount > 1 ? "s" : ""}`);
  if (parts.length === 0) return;

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

export { disable as disableAutostart } from "@tauri-apps/plugin-autostart";
export { isAutostartEnabled };
