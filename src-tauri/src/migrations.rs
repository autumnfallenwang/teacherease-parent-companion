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
    ]
}
