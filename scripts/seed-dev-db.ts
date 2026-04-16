/**
 * Seed the Tauri dev database with realistic dummy data for UI testing.
 *
 * Usage: pnpm tsx scripts/seed-dev-db.ts [--reset]
 *   --reset  Drops and recreates all tables before seeding
 *
 * Creates:
 *   - 2 children (Alex, Sam)
 *   - 7 days of scrape history (4 scrapes/day per child = ~56 scrapes)
 *   - 8 classes per child with evolving grades
 *   - Missing assignments, low scores, and status changes over time
 *
 * The dashboard should show a populated, realistic state after running this.
 * NOTE: No keychain credentials are seeded — the Refresh button won't work
 * for seeded children. Use the wizard to add a real child for live scraping.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const APP_ID = "dev.autumnfallenwang.teacherease-parent-companion";
// tauri-plugin-sql uses appConfigDir (~/.config/ on Linux), NOT appDataDir (~/.local/share/)
const DB_PATH = process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, APP_ID, "app.db")
  : join(homedir(), ".config", APP_ID, "app.db");
const RESET = process.argv.includes("--reset");

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS children (
  id            INTEGER PRIMARY KEY,
  display_name  TEXT NOT NULL,
  portal_type   TEXT NOT NULL DEFAULT 'teacherease',
  base_url      TEXT NOT NULL,
  username      TEXT NOT NULL,
  grade         TEXT,
  school        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scrapes (
  id            INTEGER PRIMARY KEY,
  child_id      INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  run_at        TEXT NOT NULL DEFAULT (datetime('now')),
  status        TEXT NOT NULL CHECK (status IN ('success', 'failed', 'parser_error')),
  duration_ms   INTEGER,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS raw_payloads (
  scrape_id     INTEGER PRIMARY KEY REFERENCES scrapes(id) ON DELETE CASCADE,
  json          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS grades (
  id              INTEGER PRIMARY KEY,
  scrape_id       INTEGER NOT NULL REFERENCES scrapes(id) ON DELETE CASCADE,
  class_name      TEXT NOT NULL,
  current_grade   TEXT,
  status          TEXT,
  needs_attention INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assignments (
  id              INTEGER PRIMARY KEY,
  scrape_id       INTEGER NOT NULL REFERENCES scrapes(id) ON DELETE CASCADE,
  class_name      TEXT NOT NULL,
  assignment_name TEXT NOT NULL,
  score           TEXT,
  max_score       TEXT,
  status          TEXT,
  due_date        TEXT
);

CREATE INDEX IF NOT EXISTS idx_scrapes_child_run ON scrapes(child_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_grades_scrape ON grades(scrape_id);
CREATE INDEX IF NOT EXISTS idx_assignments_scrape ON assignments(scrape_id);
`;

interface ChildDef {
  name: string;
  username: string;
  grade: string;
  school: string;
  classes: ClassDef[];
}

interface ClassDef {
  name: string;
  baseStatus: "meeting" | "needs_attention" | "not_assessed";
  assignments: AssignmentDef[];
}

interface AssignmentDef {
  name: string;
  score: string;
  isMissing: boolean;
  dueOffset: number;
}

const CHILDREN: ChildDef[] = [
  {
    name: "Alex",
    username: "test@example.com",
    grade: "7",
    school: "Example Middle School",
    classes: [
      {
        name: "Mathematics 7",
        baseStatus: "meeting",
        assignments: [
          { name: "Chapter 5 Quiz", score: "3=M", isMissing: false, dueOffset: -5 },
          { name: "Fraction Practice", score: "2.5=P", isMissing: false, dueOffset: -3 },
          { name: "Unit Test Review", score: "3=M", isMissing: false, dueOffset: -1 },
        ],
      },
      {
        name: "English 7",
        baseStatus: "meeting",
        assignments: [
          { name: "Book Report", score: "3=M", isMissing: false, dueOffset: -6 },
          { name: "Vocabulary Week 12", score: "2=P", isMissing: false, dueOffset: -4 },
          { name: "Essay Draft", score: "3=M", isMissing: false, dueOffset: -2 },
        ],
      },
      {
        name: "Science 7",
        baseStatus: "not_assessed",
        assignments: [{ name: "Lab Report: Plants", score: "", isMissing: false, dueOffset: -4 }],
      },
      {
        name: "Social Studies 7",
        baseStatus: "needs_attention",
        assignments: [
          { name: "Map Activity", score: "2.5=P", isMissing: false, dueOffset: -6 },
          { name: "Gandhi Article", score: "", isMissing: true, dueOffset: -4 },
          { name: "Geography Quiz", score: "", isMissing: true, dueOffset: -2 },
          { name: "Current Events", score: "1=B", isMissing: false, dueOffset: -1 },
        ],
      },
      {
        name: "French 7",
        baseStatus: "meeting",
        assignments: [
          { name: "Famille moderne", score: "3=M", isMissing: false, dueOffset: -5 },
          { name: "Verb Conjugation", score: "2.71=M", isMissing: false, dueOffset: -3 },
        ],
      },
      {
        name: "Art 7",
        baseStatus: "not_assessed",
        assignments: [],
      },
      {
        name: "Physical Education 7",
        baseStatus: "meeting",
        assignments: [
          { name: "Fitness Log Week 8", score: "3=M", isMissing: false, dueOffset: -3 },
          { name: "Fitness Log Week 9", score: "", isMissing: true, dueOffset: -1 },
        ],
      },
      {
        name: "Computer Science 7",
        baseStatus: "meeting",
        assignments: [
          { name: "Scratch Project", score: "3=M", isMissing: false, dueOffset: -5 },
          { name: "HTML Basics", score: "3=M", isMissing: false, dueOffset: -2 },
        ],
      },
    ],
  },
  {
    name: "Sam",
    username: "test2@example.com",
    grade: "5",
    school: "Example Elementary",
    classes: [
      {
        name: "Mathematics 5",
        baseStatus: "meeting",
        assignments: [
          { name: "Multiplication Drill", score: "3=M", isMissing: false, dueOffset: -4 },
          { name: "Word Problems Set 6", score: "3=M", isMissing: false, dueOffset: -2 },
        ],
      },
      {
        name: "Reading 5",
        baseStatus: "meeting",
        assignments: [
          { name: "Charlotte's Web Ch.1-5", score: "3=M", isMissing: false, dueOffset: -5 },
          { name: "Reading Log Week 9", score: "2.5=P", isMissing: false, dueOffset: -1 },
        ],
      },
      {
        name: "Writing 5",
        baseStatus: "needs_attention",
        assignments: [
          { name: "Persuasive Essay", score: "", isMissing: true, dueOffset: -3 },
          { name: "Journal Entry 12", score: "2=P", isMissing: false, dueOffset: -1 },
        ],
      },
      {
        name: "Science 5",
        baseStatus: "meeting",
        assignments: [{ name: "Weather Journal", score: "3=M", isMissing: false, dueOffset: -4 }],
      },
      {
        name: "Social Studies 5",
        baseStatus: "meeting",
        assignments: [
          { name: "State Report", score: "3=M", isMissing: false, dueOffset: -6 },
          { name: "Timeline Project", score: "2.5=P", isMissing: false, dueOffset: -2 },
        ],
      },
      {
        name: "Music 5",
        baseStatus: "not_assessed",
        assignments: [],
      },
    ],
  },
];

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function formatDueDate(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function statusToCode(s: string): string {
  if (s === "meeting") return "1";
  if (s === "needs_attention") return "2";
  return "0";
}

function main() {
  console.info(`Opening DB at: ${DB_PATH}`);
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  if (RESET) {
    console.info("--reset: dropping all tables");
    db.exec("DROP TABLE IF EXISTS assignments");
    db.exec("DROP TABLE IF EXISTS grades");
    db.exec("DROP TABLE IF EXISTS raw_payloads");
    db.exec("DROP TABLE IF EXISTS scrapes");
    db.exec("DROP TABLE IF EXISTS settings");
    db.exec("DROP TABLE IF EXISTS children");
  }

  console.info("Running migrations...");
  db.exec(MIGRATION_SQL);

  const existingChildren = db.prepare("SELECT COUNT(*) as count FROM children").get() as {
    count: number;
  };
  if (existingChildren.count > 0 && !RESET) {
    console.info(
      `DB already has ${existingChildren.count} children. Use --reset to clear. Aborting.`,
    );
    db.close();
    return;
  }

  const insertChild = db.prepare(
    "INSERT INTO children (display_name, portal_type, base_url, username, grade, school, created_at) VALUES (?, 'teacherease', ?, ?, ?, ?, ?)",
  );
  const insertScrape = db.prepare(
    "INSERT INTO scrapes (child_id, run_at, status, duration_ms) VALUES (?, ?, 'success', ?)",
  );
  const insertGrade = db.prepare(
    "INSERT INTO grades (scrape_id, class_name, current_grade, status, needs_attention) VALUES (?, ?, ?, ?, ?)",
  );
  const insertAssignment = db.prepare(
    "INSERT INTO assignments (scrape_id, class_name, assignment_name, score, max_score, status, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertPayload = db.prepare("INSERT INTO raw_payloads (scrape_id, json) VALUES (?, ?)");

  const seedAll = db.transaction(() => {
    for (const childDef of CHILDREN) {
      const childResult = insertChild.run(
        childDef.name,
        "https://school.example.teacherease.com",
        childDef.username,
        childDef.grade,
        childDef.school,
        daysAgo(-7),
      );
      const childId = childResult.lastInsertRowid;
      console.info(`  Child "${childDef.name}" (id=${childId})`);

      let scrapeCount = 0;
      for (let day = -7; day <= 0; day++) {
        for (const hourOffset of [0, 6, 12, 18]) {
          const runAt = new Date();
          runAt.setDate(runAt.getDate() + day);
          runAt.setHours(hourOffset, 0, 0, 0);
          if (runAt > new Date()) continue;

          const duration = 2000 + Math.floor(Math.random() * 3000);
          const scrapeResult = insertScrape.run(
            childId,
            runAt.toISOString().replace("T", " ").slice(0, 19),
            duration,
          );
          const scrapeId = scrapeResult.lastInsertRowid;

          for (const cls of childDef.classes) {
            const dayProgress = (day + 7) / 7;
            let status = cls.baseStatus;
            if (cls.baseStatus === "needs_attention" && dayProgress < 0.3) {
              status = "meeting";
            }

            insertGrade.run(
              scrapeId,
              cls.name,
              statusToCode(status),
              status,
              status === "needs_attention" ? 1 : 0,
            );

            for (const asn of cls.assignments) {
              const asnDayThreshold = asn.dueOffset;
              if (day < asnDayThreshold - 1) continue;

              insertAssignment.run(
                scrapeId,
                cls.name,
                asn.name,
                asn.score || null,
                null,
                asn.isMissing ? "missing" : null,
                formatDueDate(asn.dueOffset),
              );
            }
          }

          insertPayload.run(scrapeId, JSON.stringify({ seeded: true, day, hour: hourOffset }));
          scrapeCount++;
        }
      }
      console.info(`    ${scrapeCount} scrapes created`);
    }
  });

  seedAll();

  const stats = {
    children: (db.prepare("SELECT COUNT(*) as c FROM children").get() as { c: number }).c,
    scrapes: (db.prepare("SELECT COUNT(*) as c FROM scrapes").get() as { c: number }).c,
    grades: (db.prepare("SELECT COUNT(*) as c FROM grades").get() as { c: number }).c,
    assignments: (db.prepare("SELECT COUNT(*) as c FROM assignments").get() as { c: number }).c,
  };

  console.info("\nSeed complete:");
  console.info(`  ${stats.children} children`);
  console.info(`  ${stats.scrapes} scrapes`);
  console.info(`  ${stats.grades} grade records`);
  console.info(`  ${stats.assignments} assignment records`);
  console.info(`\nRun \`pnpm tauri:dev\` and the dashboard should show populated data.`);
  console.info("NOTE: Refresh button won't work for seeded children (no keychain credentials).");

  db.close();
}

main();
