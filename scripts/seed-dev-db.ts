/**
 * Seed the Tauri dev database with realistic dummy data for UI testing (v2 schema).
 *
 * Usage: pnpm tsx scripts/seed-dev-db.ts [--reset]
 *   --reset  Drops and recreates all tables before seeding
 *
 * Creates:
 *   - 2 children (Alex, Sam)
 *   - 7 days of scrape history (4 scrapes/day per child)
 *   - 8 classes for Alex, 6 for Sam (with ClassID, CGPID, instructor)
 *   - Standards tree per class with evolving scores
 *   - Assignments with TestNameID, weights, dedup
 *   - Progress numbers (targets_meeting/not_meeting/not_assessed)
 *
 * NOTE: No keychain credentials are seeded — the Refresh button won't work
 * for seeded children. Use the wizard to add a real child for live scraping.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const APP_ID = "dev.autumnfallenwang.teacherease-parent-companion";
const DB_PATH = process.env.XDG_CONFIG_HOME
  ? join(process.env.XDG_CONFIG_HOME, APP_ID, "app.db")
  : join(homedir(), ".config", APP_ID, "app.db");
const RESET = process.argv.includes("--reset");

// ---------------------------------------------------------------------------
// v2 schema (matches migrations.rs v1 + v2)
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS children (
  id INTEGER PRIMARY KEY, display_name TEXT NOT NULL, portal_type TEXT NOT NULL DEFAULT 'teacherease',
  base_url TEXT NOT NULL, username TEXT NOT NULL, grade TEXT, school TEXT, homework_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS homework (
  id INTEGER PRIMARY KEY, child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  hw_date TEXT NOT NULL, subject TEXT NOT NULL, content TEXT NOT NULL, due_date TEXT,
  scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(child_id, hw_date, subject)
);
CREATE INDEX IF NOT EXISTS idx_homework_child_date ON homework(child_id, hw_date DESC);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS scrapes (
  id INTEGER PRIMARY KEY, child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  run_at TEXT NOT NULL DEFAULT (datetime('now')), status TEXT NOT NULL CHECK (status IN ('success','failed','parser_error')),
  duration_ms INTEGER, error_message TEXT
);
CREATE TABLE IF NOT EXISTS raw_payloads (scrape_id INTEGER PRIMARY KEY REFERENCES scrapes(id) ON DELETE CASCADE, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY, child_id INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  te_class_id INTEGER NOT NULL, te_cgpid INTEGER NOT NULL, name TEXT NOT NULL,
  instructor TEXT, grading_scale TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(child_id, te_class_id)
);
CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY, scrape_id INTEGER NOT NULL REFERENCES scrapes(id) ON DELETE CASCADE,
  class_id INTEGER REFERENCES classes(id), class_name TEXT NOT NULL, current_grade TEXT,
  status TEXT, needs_attention INTEGER NOT NULL DEFAULT 0,
  targets_meeting INTEGER, targets_not_meeting INTEGER, targets_not_assessed INTEGER
);
CREATE TABLE IF NOT EXISTS standards (
  id INTEGER PRIMARY KEY, scrape_id INTEGER NOT NULL REFERENCES scrapes(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id), parent_id INTEGER REFERENCES standards(id),
  name TEXT NOT NULL, score_numeric REAL, score_letter TEXT, is_meeting INTEGER
);
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY, scrape_id INTEGER NOT NULL REFERENCES scrapes(id) ON DELETE CASCADE,
  class_id INTEGER REFERENCES classes(id), class_name TEXT NOT NULL, assignment_name TEXT NOT NULL,
  te_assignment_id INTEGER, name TEXT, score TEXT, score_numeric REAL, score_letter TEXT,
  max_score TEXT, weight INTEGER, status TEXT, is_missing INTEGER NOT NULL DEFAULT 0,
  due_date TEXT, feedback TEXT
);
CREATE INDEX IF NOT EXISTS idx_scrapes_child_run ON scrapes(child_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_classes_child ON classes(child_id);
CREATE INDEX IF NOT EXISTS idx_grades_scrape ON grades(scrape_id);
CREATE INDEX IF NOT EXISTS idx_standards_scrape ON standards(scrape_id);
CREATE INDEX IF NOT EXISTS idx_standards_class ON standards(class_id, scrape_id);
CREATE INDEX IF NOT EXISTS idx_assignments_scrape ON assignments(scrape_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id, scrape_id);
`;

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

interface StandardDef {
  name: string;
  isMeeting: boolean;
  score: string;
  assignments: AssignmentDef[];
  children?: StandardDef[];
}

interface AssignmentDef {
  testNameId: number;
  name: string;
  score: string;
  weight: number;
  isMissing: boolean;
  dueOffset: number;
}

interface ClassDef {
  teClassId: number;
  teCgpid: number;
  name: string;
  instructor: string;
  baseStatus: "meeting" | "needs_attention" | "not_assessed";
  targetsMeeting: number;
  targetsNotMeeting: number;
  totalTargets: number;
  standards: StandardDef[];
}

interface ChildDef {
  name: string;
  username: string;
  grade: string;
  school: string;
  homeworkUrl?: string | null;
  classes: ClassDef[];
}

interface HomeworkSubjectDef {
  name: string;
  content: string;
  dueDate: string;
}

interface HomeworkDayDef {
  dateOffset: number; // 0 = today, -1 = yesterday, ...
  subjects: HomeworkSubjectDef[];
}

const ALEX_HOMEWORK: HomeworkDayDef[] = [
  {
    dateOffset: 0,
    subjects: [
      {
        name: "Science",
        content: "Unnatural selection video and worksheet due Friday. Video on Google classroom",
        dueDate: "Friday 4/17",
      },
      { name: "World Geography", content: "None", dueDate: "Friday 4/17" },
      {
        name: "English",
        content: "Read Chapter 3 of The Giver and answer the questions in the packet for Chapter 3",
        dueDate: "Friday 4/17",
      },
      { name: "Math", content: "MCAS Packet #3 (due Fri)", dueDate: "Friday 4/17" },
    ],
  },
  {
    dateOffset: -1,
    subjects: [
      {
        name: "Science",
        content: "Unnatural selection video and worksheet due Friday. Video on Google classroom",
        dueDate: "Thursday 4/16",
      },
      { name: "World Geography", content: "None", dueDate: "Thursday 4/16" },
      {
        name: "English",
        content: "Read Chapter 2 of The Giver and answer the questions in the packet for Chapter 2",
        dueDate: "Thursday 4/16",
      },
      { name: "Math", content: "MCAS Packet #3 (due Fri)", dueDate: "Friday 4/17" },
    ],
  },
  {
    dateOffset: -2,
    subjects: [
      { name: "Science", content: "None", dueDate: "Wednesday 4/15" },
      {
        name: "World Geography",
        content: "Complete the Political Map of Southwest Asia & Northern Africa",
        dueDate: "Wednesday 4/15",
      },
      {
        name: "English",
        content: "Finish reading Ch.1 of The Giver and finish up to pg. 3 of the packet",
        dueDate: "Wednesday 4/15",
      },
      { name: "Math", content: "Packet #2 (due Wed)", dueDate: "Wednesday 4/15" },
    ],
  },
];

const HOMEWORK_URL_ALEX = "https://sites.google.com/lexingtonma.org/explorer-team/homework";

let nextTestNameId = 90000;
function tnid(): number {
  return nextTestNameId++;
}

const CHILDREN: ChildDef[] = [
  {
    name: "Alex",
    username: "test@example.com",
    grade: "7",
    school: "Example Middle School",
    homeworkUrl: HOMEWORK_URL_ALEX,
    classes: [
      {
        teClassId: 1000001,
        teCgpid: 5000001,
        name: "Mathematics 7",
        instructor: "Isles, D",
        baseStatus: "meeting",
        targetsMeeting: 9,
        targetsNotMeeting: 0,
        totalTargets: 74,
        standards: [
          {
            name: "Expressions and Equations",
            isMeeting: true,
            score: "3=M",
            assignments: [
              {
                testNameId: tnid(),
                name: "Chapter 5 Quiz",
                score: "3=M",
                weight: 512,
                isMissing: false,
                dueOffset: -5,
              },
              {
                testNameId: tnid(),
                name: "Fraction Practice",
                score: "2.5=P",
                weight: 256,
                isMissing: false,
                dueOffset: -3,
              },
            ],
            children: [],
          },
          {
            name: "Statistics and Probability",
            isMeeting: true,
            score: "3=M",
            assignments: [
              {
                testNameId: tnid(),
                name: "Unit Test Review",
                score: "3=M",
                weight: 512,
                isMissing: false,
                dueOffset: -1,
              },
            ],
            children: [],
          },
        ],
      },
      {
        teClassId: 1000002,
        teCgpid: 5000002,
        name: "English 7",
        instructor: "Sutherland, J",
        baseStatus: "meeting",
        targetsMeeting: 2,
        targetsNotMeeting: 0,
        totalTargets: 17,
        standards: [
          {
            name: "Reading",
            isMeeting: true,
            score: "3=M",
            assignments: [
              {
                testNameId: tnid(),
                name: "Book Report",
                score: "3=M",
                weight: 512,
                isMissing: false,
                dueOffset: -6,
              },
              {
                testNameId: tnid(),
                name: "Vocabulary Week 12",
                score: "2=P",
                weight: 256,
                isMissing: false,
                dueOffset: -4,
              },
            ],
            children: [],
          },
          {
            name: "Writing",
            isMeeting: true,
            score: "3=M",
            assignments: [
              {
                testNameId: tnid(),
                name: "Essay Draft",
                score: "3=M",
                weight: 512,
                isMissing: false,
                dueOffset: -2,
              },
            ],
            children: [],
          },
        ],
      },
      {
        teClassId: 1000003,
        teCgpid: 5000003,
        name: "Science 7",
        instructor: "Welsh, J",
        baseStatus: "not_assessed",
        targetsMeeting: 0,
        targetsNotMeeting: 0,
        totalTargets: 33,
        standards: [
          {
            name: "Completes activities",
            isMeeting: false,
            score: "",
            assignments: [
              {
                testNameId: tnid(),
                name: "Lab Report: Plants",
                score: "",
                weight: 0,
                isMissing: false,
                dueOffset: -4,
              },
            ],
            children: [],
          },
        ],
      },
      {
        teClassId: 1000004,
        teCgpid: 5000004,
        name: "Social Studies 7",
        instructor: "Paddol, D",
        baseStatus: "needs_attention",
        targetsMeeting: 5,
        targetsNotMeeting: 1,
        totalTargets: 20,
        standards: [
          {
            name: "Geography",
            isMeeting: true,
            score: "2.84=M",
            assignments: [],
            children: [
              {
                name: "Identifies and locates features",
                isMeeting: true,
                score: "3=M",
                assignments: [
                  {
                    testNameId: tnid(),
                    name: "Map Activity",
                    score: "2.5=P",
                    weight: 512,
                    isMissing: false,
                    dueOffset: -6,
                  },
                  {
                    testNameId: tnid(),
                    name: "Geography Quiz",
                    score: "",
                    weight: 0,
                    isMissing: true,
                    dueOffset: -14,
                  },
                ],
                children: [],
              },
            ],
          },
          {
            name: "History, Culture, Gov, Economy",
            isMeeting: false,
            score: "2.43=P",
            assignments: [
              {
                testNameId: tnid(),
                name: "Gandhi Article",
                score: "",
                weight: 0,
                isMissing: true,
                dueOffset: -25,
              },
              {
                testNameId: tnid(),
                name: "Current Events",
                score: "1=B",
                weight: 256,
                isMissing: false,
                dueOffset: -1,
              },
            ],
            children: [],
          },
        ],
      },
      {
        teClassId: 1000005,
        teCgpid: 5000005,
        name: "French 7",
        instructor: "Starczak, N",
        baseStatus: "meeting",
        targetsMeeting: 3,
        targetsNotMeeting: 0,
        totalTargets: 8,
        standards: [
          {
            name: "Speaking",
            isMeeting: true,
            score: "3=M",
            assignments: [
              {
                testNameId: tnid(),
                name: "Famille moderne",
                score: "3=M",
                weight: 512,
                isMissing: false,
                dueOffset: -5,
              },
              {
                testNameId: tnid(),
                name: "Verb Conjugation",
                score: "2.71=M",
                weight: 256,
                isMissing: false,
                dueOffset: -3,
              },
            ],
            children: [],
          },
        ],
      },
      {
        teClassId: 1000006,
        teCgpid: 5000006,
        name: "Art 7",
        instructor: "Johnson, K",
        baseStatus: "not_assessed",
        targetsMeeting: 0,
        targetsNotMeeting: 0,
        totalTargets: 4,
        standards: [],
      },
      {
        teClassId: 1000007,
        teCgpid: 5000007,
        name: "Physical Education 7",
        instructor: "Shannon, G",
        baseStatus: "meeting",
        targetsMeeting: 2,
        targetsNotMeeting: 0,
        totalTargets: 6,
        standards: [
          {
            name: "Participation",
            isMeeting: true,
            score: "3=M",
            assignments: [
              {
                testNameId: tnid(),
                name: "Fitness Log Week 8",
                score: "3=M",
                weight: 512,
                isMissing: false,
                dueOffset: -3,
              },
              {
                testNameId: tnid(),
                name: "Fitness Log Week 9",
                score: "",
                weight: 0,
                isMissing: true,
                dueOffset: -1,
              },
            ],
            children: [],
          },
        ],
      },
      {
        teClassId: 1000008,
        teCgpid: 5000008,
        name: "Computer Science 7",
        instructor: "Zides, T",
        baseStatus: "meeting",
        targetsMeeting: 1,
        targetsNotMeeting: 0,
        totalTargets: 23,
        standards: [
          {
            name: "Computational Thinking",
            isMeeting: true,
            score: "1=PS",
            assignments: [
              {
                testNameId: tnid(),
                name: "Scratch Project",
                score: "1=PS",
                weight: 512,
                isMissing: false,
                dueOffset: -5,
              },
              {
                testNameId: tnid(),
                name: "HTML Basics",
                score: "1=PS",
                weight: 256,
                isMissing: false,
                dueOffset: -2,
              },
            ],
            children: [],
          },
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
        teClassId: 2000001,
        teCgpid: 6000001,
        name: "Mathematics 5",
        instructor: "Chen, L",
        baseStatus: "meeting",
        targetsMeeting: 4,
        targetsNotMeeting: 0,
        totalTargets: 30,
        standards: [
          {
            name: "Number Operations",
            isMeeting: true,
            score: "3=M",
            assignments: [
              {
                testNameId: tnid(),
                name: "Multiplication Drill",
                score: "3=M",
                weight: 512,
                isMissing: false,
                dueOffset: -4,
              },
              {
                testNameId: tnid(),
                name: "Word Problems Set 6",
                score: "3=M",
                weight: 256,
                isMissing: false,
                dueOffset: -2,
              },
            ],
            children: [],
          },
        ],
      },
      {
        teClassId: 2000002,
        teCgpid: 6000002,
        name: "Reading 5",
        instructor: "Davis, R",
        baseStatus: "meeting",
        targetsMeeting: 2,
        targetsNotMeeting: 0,
        totalTargets: 12,
        standards: [
          {
            name: "Comprehension",
            isMeeting: true,
            score: "3=M",
            assignments: [
              {
                testNameId: tnid(),
                name: "Charlotte's Web Ch.1-5",
                score: "3=M",
                weight: 512,
                isMissing: false,
                dueOffset: -5,
              },
              {
                testNameId: tnid(),
                name: "Reading Log Week 9",
                score: "2.5=P",
                weight: 256,
                isMissing: false,
                dueOffset: -1,
              },
            ],
            children: [],
          },
        ],
      },
      {
        teClassId: 2000003,
        teCgpid: 6000003,
        name: "Writing 5",
        instructor: "Park, M",
        baseStatus: "needs_attention",
        targetsMeeting: 1,
        targetsNotMeeting: 1,
        totalTargets: 10,
        standards: [
          {
            name: "Composition",
            isMeeting: false,
            score: "2=P",
            assignments: [
              {
                testNameId: tnid(),
                name: "Persuasive Essay",
                score: "",
                weight: 0,
                isMissing: true,
                dueOffset: -10,
              },
              {
                testNameId: tnid(),
                name: "Journal Entry 12",
                score: "2=P",
                weight: 256,
                isMissing: false,
                dueOffset: -1,
              },
            ],
            children: [],
          },
        ],
      },
      {
        teClassId: 2000004,
        teCgpid: 6000004,
        name: "Science 5",
        instructor: "Kim, S",
        baseStatus: "meeting",
        targetsMeeting: 2,
        targetsNotMeeting: 0,
        totalTargets: 15,
        standards: [
          {
            name: "Earth Science",
            isMeeting: true,
            score: "3=M",
            assignments: [
              {
                testNameId: tnid(),
                name: "Weather Journal",
                score: "3=M",
                weight: 512,
                isMissing: false,
                dueOffset: -4,
              },
            ],
            children: [],
          },
        ],
      },
      {
        teClassId: 2000005,
        teCgpid: 6000005,
        name: "Social Studies 5",
        instructor: "Brown, A",
        baseStatus: "meeting",
        targetsMeeting: 3,
        targetsNotMeeting: 0,
        totalTargets: 18,
        standards: [
          {
            name: "US History",
            isMeeting: true,
            score: "3=M",
            assignments: [
              {
                testNameId: tnid(),
                name: "State Report",
                score: "3=M",
                weight: 512,
                isMissing: false,
                dueOffset: -6,
              },
              {
                testNameId: tnid(),
                name: "Timeline Project",
                score: "2.5=P",
                weight: 256,
                isMissing: false,
                dueOffset: -2,
              },
            ],
            children: [],
          },
        ],
      },
      {
        teClassId: 2000006,
        teCgpid: 6000006,
        name: "Music 5",
        instructor: "Garcia, E",
        baseStatus: "not_assessed",
        targetsMeeting: 0,
        targetsNotMeeting: 0,
        totalTargets: 4,
        standards: [],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRunAt(day: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + day);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function formatDueDate(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function parseScore(s: string): { numeric: number; letter: string } {
  if (!s.includes("=")) return { numeric: 0, letter: "" };
  const [num, letter] = s.split("=", 2) as [string, string];
  return { numeric: Number.parseFloat(num) || 0, letter: letter ?? "" };
}

function statusToCode(s: string): string {
  if (s === "meeting") return "1";
  if (s === "needs_attention") return "2";
  return "0";
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function insertStandards(
  db: Database.Database,
  scrapeId: number,
  classId: number,
  standards: StandardDef[],
  parentId: number | null,
): void {
  const ins = db.prepare(
    "INSERT INTO standards (scrape_id, class_id, parent_id, name, score_numeric, score_letter, is_meeting) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const std of standards) {
    const { numeric, letter } = parseScore(std.score);
    const res = ins.run(
      scrapeId,
      classId,
      parentId,
      std.name,
      numeric || null,
      letter || null,
      std.isMeeting ? 1 : 0,
    );
    if (std.children && std.children.length > 0) {
      insertStandards(db, scrapeId, classId, std.children, Number(res.lastInsertRowid));
    }
  }
}

/**
 * Get the time-evolved version of an assignment for a given day.
 * Simulates: assignments appearing, scores changing, missing work resolving.
 */
function evolveAssignment(
  asn: AssignmentDef,
  day: number,
): { score: string; isMissing: boolean; visible: boolean } {
  // Not visible yet (before due date)
  if (day < asn.dueOffset - 1) return { score: "", isMissing: false, visible: false };

  // For assignments that start as missing: only SOME resolve on day -1
  if (asn.isMissing) {
    // Use testNameId to deterministically decide which ones resolve
    const resolves = asn.testNameId % 3 === 0; // ~1/3 of missing work gets turned in
    if (resolves) {
      if (day < -1) return { score: "", isMissing: true, visible: true };
      // Day -1 onward: student turned it in, got a low grade
      return { score: "2=P", isMissing: false, visible: true };
    }
    // Stays missing forever
    return { score: "", isMissing: true, visible: true };
  }

  // For graded assignments: scores can evolve
  // Early days: slightly lower scores, improving over time
  if (asn.score && day < -4) {
    const { numeric } = parseScore(asn.score);
    if (numeric >= 3.0) {
      // Was meeting — show slightly lower early on
      return { score: "2.5=P", isMissing: false, visible: true };
    }
    return { score: asn.score, isMissing: false, visible: true };
  }

  return { score: asn.score, isMissing: asn.isMissing, visible: true };
}

function insertAssignments(
  db: Database.Database,
  scrapeId: number,
  classId: number,
  className: string,
  standards: StandardDef[],
  day: number,
  seen: Set<number>,
): void {
  const ins = db.prepare(
    "INSERT INTO assignments (scrape_id, class_id, class_name, assignment_name, te_assignment_id, name, score, score_numeric, score_letter, weight, is_missing, due_date, feedback, max_score, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const std of standards) {
    for (const asn of std.assignments) {
      const evolved = evolveAssignment(asn, day);
      if (!evolved.visible) continue;
      if (seen.has(asn.testNameId)) continue;
      seen.add(asn.testNameId);

      const { numeric, letter } = parseScore(evolved.score);
      ins.run(
        scrapeId,
        classId,
        className,
        asn.name,
        asn.testNameId,
        asn.name,
        evolved.score || null,
        numeric || null,
        letter || null,
        asn.weight || null,
        evolved.isMissing ? 1 : 0,
        formatDueDate(asn.dueOffset),
        null,
        null,
        evolved.isMissing ? "missing" : letter || null,
      );
    }
    if (std.children) {
      insertAssignments(db, scrapeId, classId, className, std.children, day, seen);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.info(`Opening DB at: ${DB_PATH}`);
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  if (RESET) {
    console.info("--reset: dropping all tables");
    for (const t of [
      "homework",
      "assignments",
      "standards",
      "grades",
      "raw_payloads",
      "scrapes",
      "classes",
      "settings",
      "children",
    ]) {
      db.exec(`DROP TABLE IF EXISTS ${t}`);
    }
  }

  console.info("Running migrations...");
  db.exec(SCHEMA_SQL);

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
    "INSERT INTO children (display_name, portal_type, base_url, username, grade, school, homework_url, created_at) VALUES (?, 'teacherease', ?, ?, ?, ?, ?, ?)",
  );
  const insertHomework = db.prepare(
    "INSERT INTO homework (child_id, hw_date, subject, content, due_date, scraped_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const upsertClass = db.prepare(
    "INSERT INTO classes (child_id, te_class_id, te_cgpid, name, instructor, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(child_id, te_class_id) DO UPDATE SET te_cgpid = excluded.te_cgpid, name = excluded.name, instructor = excluded.instructor, updated_at = datetime('now')",
  );
  const lookupClass = db.prepare("SELECT id FROM classes WHERE child_id = ? AND te_class_id = ?");
  const insertScrape = db.prepare(
    "INSERT INTO scrapes (child_id, run_at, status, duration_ms) VALUES (?, ?, 'success', ?)",
  );
  const insertGrade = db.prepare(
    "INSERT INTO grades (scrape_id, class_id, class_name, current_grade, status, needs_attention, targets_meeting, targets_not_meeting, targets_not_assessed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
        childDef.homeworkUrl ?? null,
        formatRunAt(-7, 0),
      );
      const childId = Number(childResult.lastInsertRowid);
      console.info(`  Child "${childDef.name}" (id=${childId})`);

      // Upsert classes
      const classIdMap = new Map<number, number>();
      for (const cls of childDef.classes) {
        upsertClass.run(childId, cls.teClassId, cls.teCgpid, cls.name, cls.instructor);
        const row = lookupClass.get(childId, cls.teClassId) as { id: number };
        classIdMap.set(cls.teClassId, row.id);
      }

      let scrapeCount = 0;
      for (let day = -7; day <= 0; day++) {
        for (const hour of [0, 6, 12, 18]) {
          const runAt = new Date();
          runAt.setDate(runAt.getDate() + day);
          runAt.setHours(hour, 0, 0, 0);
          if (runAt > new Date()) continue;

          const duration = 2000 + Math.floor(Math.random() * 3000);
          const scrapeResult = insertScrape.run(childId, formatRunAt(day, hour), duration);
          const scrapeId = Number(scrapeResult.lastInsertRowid);

          for (const cls of childDef.classes) {
            const classId = classIdMap.get(cls.teClassId);
            if (!classId) continue;

            // Evolve status: needs_attention classes start as meeting in early days
            const dayProgress = (day + 7) / 7;
            let status = cls.baseStatus;
            if (cls.baseStatus === "needs_attention" && dayProgress < 0.3) {
              status = "meeting";
            }

            const notAssessed = cls.totalTargets - cls.targetsMeeting - cls.targetsNotMeeting;
            insertGrade.run(
              scrapeId,
              classId,
              cls.name,
              statusToCode(status),
              status,
              status === "needs_attention" ? 1 : 0,
              cls.targetsMeeting,
              cls.targetsNotMeeting,
              notAssessed,
            );

            // Insert standards tree
            insertStandards(db, scrapeId, classId, cls.standards, null);

            // Insert assignments (deduplicated, filtered by day visibility)
            const seen = new Set<number>();
            insertAssignments(db, scrapeId, classId, cls.name, cls.standards, day, seen);
          }

          // Build classDetails for raw_payloads
          const classDetails = childDef.classes.map((cls) => ({
            className: cls.name,
            standards: cls.standards.map((std) => ({
              name: std.name,
              score: std.score,
              scoreNumeric: parseScore(std.score).numeric,
              scoreLetter: parseScore(std.score).letter,
              isMeeting: std.isMeeting,
              children: std.children ?? [],
              assignments: std.assignments.map((a) => ({
                testNameId: a.testNameId,
                dueDate: formatDueDate(a.dueOffset),
                name: a.name,
                weight: String(a.weight),
                grade: a.score,
                gradeNumeric: parseScore(a.score).numeric,
                gradeLetter: parseScore(a.score).letter,
                isMissing: a.isMissing,
                feedback: "",
              })),
              missingCount: std.assignments.filter((a) => a.isMissing).length,
              lowScoreCount: 0,
            })),
            summary: {
              missingAssignments: cls.standards
                .flatMap((s) => s.assignments)
                .filter((a) => a.isMissing).length,
            },
          }));
          insertPayload.run(scrapeId, JSON.stringify({ classDetails }));
          scrapeCount++;
        }
      }
      console.info(`    ${scrapeCount} scrapes, ${classIdMap.size} classes`);

      // Homework seed (only for children with a homework_url configured).
      if (childDef.homeworkUrl) {
        let hwCount = 0;
        for (const day of ALEX_HOMEWORK) {
          const d = new Date();
          d.setDate(d.getDate() + day.dateOffset);
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const scrapedAt = formatRunAt(day.dateOffset, 18);
          for (const subj of day.subjects) {
            insertHomework.run(childId, iso, subj.name, subj.content, subj.dueDate, scrapedAt);
            hwCount++;
          }
        }
        console.info(`    ${hwCount} homework rows across ${ALEX_HOMEWORK.length} days`);
      }
    }
  });

  seedAll();

  const count = (t: string) =>
    (db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as { c: number }).c;
  console.info("\nSeed complete:");
  console.info(`  ${count("children")} children`);
  console.info(`  ${count("classes")} classes`);
  console.info(`  ${count("scrapes")} scrapes`);
  console.info(`  ${count("grades")} grade records`);
  console.info(`  ${count("standards")} standard records`);
  console.info(`  ${count("assignments")} assignment records`);
  console.info(`  ${count("homework")} homework rows`);
  console.info(`\nRun \`pnpm tauri:dev\` and the dashboard should show populated data.`);
  console.info("NOTE: Refresh button won't work for seeded children (no keychain credentials).");

  db.close();
}

main();
