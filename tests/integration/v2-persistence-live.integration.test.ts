// D7 — Live e2e test for v2 data model. Full pipeline:
// login → fetch ALL detail pages → persist to v2 schema → validate tables.
// NEVER runs in CI — gated by TEACHEREASE_LIVE=1 env var.
//
// Run manually:
//   TEACHEREASE_LIVE=1 pnpm test tests/integration/v2-persistence-live.integration.test.ts
//
// Uses better-sqlite3 with a temp DB (no Tauri needed).

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { parseClassDetails, parseGradesOverview } from "@/lib/scraper/parser";
import { login } from "@/lib/scraper/teacherease";
import type { ClassDetails, ClassOverview, Standard } from "@/lib/scraper/types";

const LIVE_ENABLED = process.env.TEACHEREASE_LIVE === "1";
const ENV_PATH = join(__dirname, "../../sandbox/.env");
const DB_PATH = join(__dirname, "../../sandbox/test-v2-e2e.db");

function loadEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return env;
}

const V2_SCHEMA = `
CREATE TABLE children (id INTEGER PRIMARY KEY, display_name TEXT NOT NULL, portal_type TEXT NOT NULL DEFAULT 'teacherease', base_url TEXT NOT NULL, username TEXT NOT NULL, grade TEXT, school TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE fetch_runs (id INTEGER PRIMARY KEY, child_id INTEGER NOT NULL REFERENCES children(id), run_at TEXT NOT NULL DEFAULT (datetime('now')), status TEXT NOT NULL, duration_ms INTEGER, error_message TEXT);
CREATE TABLE raw_payloads (fetch_run_id INTEGER PRIMARY KEY REFERENCES fetch_runs(id), json TEXT NOT NULL);
CREATE TABLE classes (id INTEGER PRIMARY KEY, child_id INTEGER NOT NULL REFERENCES children(id), te_class_id INTEGER NOT NULL, te_cgpid INTEGER NOT NULL, name TEXT NOT NULL, instructor TEXT, grading_scale TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(child_id, te_class_id));
CREATE TABLE grades (id INTEGER PRIMARY KEY, fetch_run_id INTEGER NOT NULL REFERENCES fetch_runs(id), class_id INTEGER REFERENCES classes(id), class_name TEXT NOT NULL, current_grade TEXT, status TEXT, needs_attention INTEGER NOT NULL DEFAULT 0, targets_meeting INTEGER, targets_not_meeting INTEGER, targets_not_assessed INTEGER);
CREATE TABLE standards (id INTEGER PRIMARY KEY, fetch_run_id INTEGER NOT NULL REFERENCES fetch_runs(id), class_id INTEGER NOT NULL REFERENCES classes(id), parent_id INTEGER REFERENCES standards(id), name TEXT NOT NULL, score_numeric REAL, score_letter TEXT, is_meeting INTEGER);
CREATE TABLE assignments (id INTEGER PRIMARY KEY, fetch_run_id INTEGER NOT NULL REFERENCES fetch_runs(id), class_id INTEGER REFERENCES classes(id), class_name TEXT NOT NULL, assignment_name TEXT NOT NULL, te_assignment_id INTEGER, name TEXT, score TEXT, score_numeric REAL, score_letter TEXT, max_score TEXT, weight INTEGER, status TEXT, is_missing INTEGER NOT NULL DEFAULT 0, due_date TEXT, feedback TEXT);
`;

// Persistence helpers (mirrors ipc.ts logic, adapted for better-sqlite3)
function upsertClasses(
  db: Database.Database,
  childId: number,
  classes: readonly ClassOverview[],
): Map<number, number> {
  const upsert = db.prepare(
    `INSERT INTO classes (child_id, te_class_id, te_cgpid, name, instructor, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(child_id, te_class_id) DO UPDATE SET te_cgpid = excluded.te_cgpid, name = excluded.name, instructor = excluded.instructor, updated_at = datetime('now')`,
  );
  const lookup = db.prepare("SELECT id FROM classes WHERE child_id = ? AND te_class_id = ?");
  const map = new Map<number, number>();
  for (const cls of classes) {
    upsert.run(childId, cls.classId, cls.cgpId, cls.name, cls.instructor);
    const row = lookup.get(childId, cls.classId) as { id: number };
    map.set(cls.classId, row.id);
  }
  return map;
}

function insertStandards(
  db: Database.Database,
  fetchRunId: number,
  classId: number,
  standards: readonly Standard[],
  parentId: number | null,
): void {
  const ins = db.prepare(
    "INSERT INTO standards (fetch_run_id, class_id, parent_id, name, score_numeric, score_letter, is_meeting) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const std of standards) {
    const res = ins.run(
      fetchRunId,
      classId,
      parentId,
      std.name,
      std.scoreNumeric || null,
      std.scoreLetter || null,
      std.isMeeting ? 1 : 0,
    );
    if (std.children.length > 0)
      insertStandards(db, fetchRunId, classId, std.children, Number(res.lastInsertRowid));
  }
}

function insertAssignments(
  db: Database.Database,
  fetchRunId: number,
  classId: number,
  className: string,
  standards: readonly Standard[],
  seen: Set<number>,
): void {
  const ins = db.prepare(
    "INSERT INTO assignments (fetch_run_id, class_id, class_name, assignment_name, te_assignment_id, name, score, score_numeric, score_letter, weight, is_missing, due_date, feedback, max_score, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const std of standards) {
    for (const asn of std.assignments) {
      if (asn.testNameId > 0 && seen.has(asn.testNameId)) continue;
      if (asn.testNameId > 0) seen.add(asn.testNameId);
      ins.run(
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
        null,
        asn.isMissing ? "missing" : asn.gradeLetter || null,
      );
    }
    if (std.children.length > 0)
      insertAssignments(db, fetchRunId, classId, className, std.children, seen);
  }
}

describe("D7: live e2e v2 persistence", () => {
  const env = LIVE_ENABLED ? loadEnv() : {};
  const baseUrl = env.TEACHEREASE_BASE_URL ?? "";
  const username = env.TEACHEREASE_USERNAME ?? "";
  const password = env.TEACHEREASE_PASSWORD ?? "";
  const hasCredentials = Boolean(baseUrl && username && password);

  afterAll(() => {
    // Keep DB for manual inspection, but clean up on next run
  });

  it.skipIf(!LIVE_ENABLED || !hasCredentials)(
    "full pipeline: login → fetch all → persist → validate",
    async () => {
      // Clean slate
      if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
      const db = new Database(DB_PATH);
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      db.exec(V2_SCHEMA);

      // Login
      const session = await login(baseUrl, { username, password });
      expect(session.cookieHeader.length).toBeGreaterThan(0);

      // Fetch overview
      const gradesUrl = new URL(
        "/App/Parents/StandardGrade/GradeViewAllWithProgress",
        baseUrl,
      ).toString();
      const gradesRes = await fetch(gradesUrl, { headers: { Cookie: session.cookieHeader } });
      const overview = parseGradesOverview(await gradesRes.text());
      expect(overview.classes.length).toBe(8);

      // Fetch ALL detail pages
      const classDetails: ClassDetails[] = [];
      for (const cls of overview.classes) {
        const url = new URL(
          `/common/StudentProgressStandardsDetails.aspx?ClassID=${cls.classId}&CGPID=${cls.cgpId}`,
          baseUrl,
        ).toString();
        const res = await fetch(url, { headers: { Cookie: session.cookieHeader } });
        classDetails.push(parseClassDetails(await res.text(), cls.name));
      }
      expect(classDetails.length).toBe(8);

      // Persist: child + scrape
      const childId = Number(
        db
          .prepare(
            "INSERT INTO children (display_name, portal_type, base_url, username) VALUES ('Test', 'teacherease', ?, ?)",
          )
          .run(baseUrl, username).lastInsertRowid,
      );
      const fetchRunId = Number(
        db
          .prepare(
            "INSERT INTO fetch_runs (child_id, status, duration_ms) VALUES (?, 'success', 0)",
          )
          .run(childId).lastInsertRowid,
      );

      // Persist: classes
      const classIdMap = upsertClasses(db, childId, overview.classes);
      expect(classIdMap.size).toBe(8);

      // Persist: grades with progress
      const insGrade = db.prepare(
        "INSERT INTO grades (fetch_run_id, class_id, class_name, current_grade, status, needs_attention, targets_meeting, targets_not_meeting, targets_not_assessed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const cls of overview.classes) {
        const classId = classIdMap.get(cls.classId);
        const notAssessed = cls.totalTargets - cls.targetsMeeting - cls.targetsNotMeeting;
        insGrade.run(
          fetchRunId,
          classId,
          cls.name,
          `${cls.statusCode}`,
          cls.status,
          cls.needsAttention ? 1 : 0,
          cls.targetsMeeting,
          cls.targetsNotMeeting,
          notAssessed,
        );
      }

      // Persist: standards + assignments
      for (const detail of classDetails) {
        const cls = overview.classes.find((c) => c.name === detail.className);
        const classId = cls ? classIdMap.get(cls.classId) : undefined;
        if (!classId) continue;
        insertStandards(db, fetchRunId, classId, detail.standards, null);
        insertAssignments(db, fetchRunId, classId, detail.className, detail.standards, new Set());
      }

      // Persist: raw_payloads
      db.prepare("INSERT INTO raw_payloads (fetch_run_id, json) VALUES (?, ?)").run(
        fetchRunId,
        JSON.stringify({ overview, classDetails }),
      );

      // ===== VALIDATION =====

      const count = (table: string) =>
        (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number }).c;

      // Table row counts
      expect(count("classes")).toBe(8);
      expect(count("grades")).toBe(8);
      expect(count("standards")).toBeGreaterThan(0);
      expect(count("assignments")).toBeGreaterThan(0);

      // No null class_id anywhere
      const nullClassIdGrades = (
        db.prepare("SELECT COUNT(*) as c FROM grades WHERE class_id IS NULL").get() as { c: number }
      ).c;
      expect(nullClassIdGrades).toBe(0);

      const nullClassIdStds = (
        db.prepare("SELECT COUNT(*) as c FROM standards WHERE class_id IS NULL").get() as {
          c: number;
        }
      ).c;
      expect(nullClassIdStds).toBe(0);

      const nullClassIdAsns = (
        db.prepare("SELECT COUNT(*) as c FROM assignments WHERE class_id IS NULL").get() as {
          c: number;
        }
      ).c;
      expect(nullClassIdAsns).toBe(0);

      // Standards parent_id integrity
      const orphanStds = (
        db
          .prepare(
            "SELECT COUNT(*) as c FROM standards WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM standards)",
          )
          .get() as { c: number }
      ).c;
      expect(orphanStds).toBe(0);

      // Progress numbers present for needs_attention class
      const attnGrade = db
        .prepare(
          "SELECT targets_meeting, targets_not_meeting FROM grades WHERE needs_attention = 1 LIMIT 1",
        )
        .get() as { targets_meeting: number; targets_not_meeting: number } | undefined;
      expect(attnGrade).toBeDefined();
      expect(attnGrade?.targets_meeting).toBeGreaterThan(0);

      // All assignments have testNameId
      const withTnId = (
        db
          .prepare("SELECT COUNT(*) as c FROM assignments WHERE te_assignment_id IS NOT NULL")
          .get() as { c: number }
      ).c;
      const totalAsns = count("assignments");
      expect(withTnId).toBe(totalAsns);

      // Assignments are deduplicated (unique te_assignment_id)
      const uniqueTnId = (
        db
          .prepare(
            "SELECT COUNT(DISTINCT te_assignment_id) as c FROM assignments WHERE te_assignment_id IS NOT NULL",
          )
          .get() as { c: number }
      ).c;
      expect(uniqueTnId).toBe(withTnId);

      // Each of 8 classes has at least 1 standard
      const classesWithStds = (
        db.prepare("SELECT COUNT(DISTINCT class_id) as c FROM standards").get() as { c: number }
      ).c;
      expect(classesWithStds).toBe(8);

      // Raw payload exists
      expect(count("raw_payloads")).toBe(1);

      console.info(
        `\nD7 PASSED: ${count("classes")} classes, ${count("grades")} grades, ${count("standards")} standards, ${totalAsns} assignments`,
      );
      console.info(`DB at: ${DB_PATH}`);

      db.close();
    },
    120_000, // 2 min timeout for network
  );
});
