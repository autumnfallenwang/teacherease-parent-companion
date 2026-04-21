use tauri_plugin_sql::{Migration, MigrationKind};

/// Initial schema — design-plan.md Q8 (history/data model) + Q13 (settings).
/// Single migration because there's no prior version to migrate from.
pub fn initial() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: r#"
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
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "v2_classes_standards_normalization",
            sql: r#"
            CREATE TABLE IF NOT EXISTS classes (
                id              INTEGER PRIMARY KEY,
                child_id        INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
                te_class_id     INTEGER NOT NULL,
                te_cgpid        INTEGER NOT NULL,
                name            TEXT NOT NULL,
                instructor      TEXT,
                grading_scale   TEXT,
                updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(child_id, te_class_id)
            );

            CREATE TABLE IF NOT EXISTS standards (
                id              INTEGER PRIMARY KEY,
                scrape_id       INTEGER NOT NULL REFERENCES scrapes(id) ON DELETE CASCADE,
                class_id        INTEGER NOT NULL REFERENCES classes(id),
                parent_id       INTEGER REFERENCES standards(id),
                name            TEXT NOT NULL,
                score_numeric   REAL,
                score_letter    TEXT,
                is_meeting      INTEGER
            );

            ALTER TABLE grades ADD COLUMN class_id INTEGER REFERENCES classes(id);
            ALTER TABLE grades ADD COLUMN targets_meeting INTEGER;
            ALTER TABLE grades ADD COLUMN targets_not_meeting INTEGER;
            ALTER TABLE grades ADD COLUMN targets_not_assessed INTEGER;

            ALTER TABLE assignments ADD COLUMN class_id INTEGER REFERENCES classes(id);
            ALTER TABLE assignments ADD COLUMN te_assignment_id INTEGER;
            ALTER TABLE assignments ADD COLUMN score_numeric REAL;
            ALTER TABLE assignments ADD COLUMN score_letter TEXT;
            ALTER TABLE assignments ADD COLUMN weight INTEGER;
            ALTER TABLE assignments ADD COLUMN is_missing INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE assignments ADD COLUMN feedback TEXT;

            CREATE INDEX IF NOT EXISTS idx_classes_child ON classes(child_id);
            CREATE INDEX IF NOT EXISTS idx_standards_scrape ON standards(scrape_id);
            CREATE INDEX IF NOT EXISTS idx_standards_class ON standards(class_id, scrape_id);
            CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id, scrape_id);
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "v3_homework_table",
            sql: r#"
            ALTER TABLE children ADD COLUMN homework_url TEXT;

            CREATE TABLE IF NOT EXISTS homework (
                id         INTEGER PRIMARY KEY,
                child_id   INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
                hw_date    TEXT NOT NULL,
                subject    TEXT NOT NULL,
                content    TEXT NOT NULL,
                due_date   TEXT,
                scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(child_id, hw_date, subject)
            );

            CREATE INDEX IF NOT EXISTS idx_homework_child_date ON homework(child_id, hw_date DESC);
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "v4_homework_due_date_inferred",
            sql: r#"
            ALTER TABLE homework ADD COLUMN due_date_inferred INTEGER NOT NULL DEFAULT 0;
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "v5_rename_scrapes_to_fetch_runs",
            sql: r#"
            ALTER TABLE scrapes RENAME TO fetch_runs;
            ALTER TABLE fetch_runs ADD COLUMN source TEXT NOT NULL DEFAULT 'teacherease';

            ALTER TABLE raw_payloads RENAME COLUMN scrape_id TO fetch_run_id;
            ALTER TABLE grades       RENAME COLUMN scrape_id TO fetch_run_id;
            ALTER TABLE standards    RENAME COLUMN scrape_id TO fetch_run_id;
            ALTER TABLE assignments  RENAME COLUMN scrape_id TO fetch_run_id;

            DROP INDEX IF EXISTS idx_scrapes_child_run;
            CREATE INDEX IF NOT EXISTS idx_fetch_runs_child_run ON fetch_runs(child_id, run_at DESC);

            DROP INDEX IF EXISTS idx_grades_scrape;
            CREATE INDEX IF NOT EXISTS idx_grades_fetch_run ON grades(fetch_run_id);

            DROP INDEX IF EXISTS idx_standards_scrape;
            CREATE INDEX IF NOT EXISTS idx_standards_fetch_run ON standards(fetch_run_id);

            DROP INDEX IF EXISTS idx_standards_class;
            CREATE INDEX IF NOT EXISTS idx_standards_class ON standards(class_id, fetch_run_id);

            DROP INDEX IF EXISTS idx_assignments_scrape;
            CREATE INDEX IF NOT EXISTS idx_assignments_fetch_run ON assignments(fetch_run_id);

            DROP INDEX IF EXISTS idx_assignments_class;
            CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id, fetch_run_id);

            CREATE INDEX IF NOT EXISTS idx_fetch_runs_child_source
                ON fetch_runs(child_id, source, run_at DESC);
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "v6_assignments_add_name_column",
            // Column was written by ipc.ts but never declared in migrations 1-5.
            sql: r#"
            ALTER TABLE assignments ADD COLUMN name TEXT;
        "#,
            kind: MigrationKind::Up,
        },
    ]
}
