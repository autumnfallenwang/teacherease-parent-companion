use tauri_plugin_sql::{Migration, MigrationKind};

/// Initial schema — design-plan.md Q8 (history/data model) + Q13 (settings).
/// Single migration because there's no prior version to migrate from.
pub fn initial() -> Vec<Migration> {
    vec![Migration {
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
    }]
}
