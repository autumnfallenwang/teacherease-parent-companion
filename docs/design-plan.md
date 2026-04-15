# TeacherEase Parent Companion — Design Plan

> The "what we're building" document. For the "why" behind each choice, see [decisions.md](decisions.md). For current build status, see [progress.md](progress.md).

## Concept

A standalone desktop app that monitors a child's TeacherEase parent portal in the background and notifies the parent when there's a new missing assignment, a low score, or other things that need attention. Replaces a Python + Playwright + cron script with a real cross-platform app a non-technical parent can install and forget about.

**Target user:** a parent who can download an installer and click through a 90-second setup wizard, but cannot configure cron, install Python, or generate a Gmail App Password unassisted.

## Tech Stack

| Layer | Tech | Why |
|-------|------|-----|
| Desktop shell | Tauri 2 | ~15 MB installer vs Electron's ~100 MB+ (uses native OS webview). See decisions Q6. |
| Frontend | Next.js (App Router, static export) + React + TypeScript | Familiar stack, renders inside Tauri webview. |
| Styling | Tailwind + shadcn/ui (planned) | Fast, consistent, matches dashboard UX. |
| Scraper | Node `fetch` + `cheerio` | TeacherEase is server-rendered ASP.NET. No browser needed. See decisions Q1. |
| Storage | SQLite via `tauri-plugin-sql` | Embedded, one file, zero dependencies. See decisions Q8. |
| Credentials | OS keychain via `tauri-plugin-stronghold` or `keytar` | Credential Manager / Keychain / libsecret. |
| Scheduler | In-process `setTimeout` timer | Tray-resident, event-driven. See decisions Q2. |
| Notifications | `tauri-plugin-notification` | Toast / Notification Center / libnotify. |
| Autostart | `tauri-plugin-autostart` | Per-OS launch-at-login registration. |
| Updater | `tauri-plugin-updater` | Signed update payloads from GitHub Releases. See decisions Q9. |
| Lint/Format | Biome | Single tool, fast. |
| Tests | Vitest (TS) + `cargo test` (Rust) | Standard per language. |

## Data Model (SQLite)

See decisions Q8 for the rationale.

```sql
-- One row per child. Credentials NOT here — live in OS keychain keyed by child.id.
CREATE TABLE children (
  id            INTEGER PRIMARY KEY,
  display_name  TEXT NOT NULL,
  portal_type   TEXT NOT NULL DEFAULT 'teacherease',
  username      TEXT NOT NULL,          -- portal login email, not a secret
  grade         TEXT,
  school        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per scrape run.
CREATE TABLE scrapes (
  id            INTEGER PRIMARY KEY,
  child_id      INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  run_at        TEXT NOT NULL DEFAULT (datetime('now')),
  status        TEXT NOT NULL CHECK (status IN ('success', 'failed', 'parser_error')),
  duration_ms   INTEGER,
  error_message TEXT
);

-- Raw parsed JSON payload for retroactive re-rendering / parser-bug fixes.
CREATE TABLE raw_payloads (
  scrape_id     INTEGER PRIMARY KEY REFERENCES scrapes(id) ON DELETE CASCADE,
  json          TEXT NOT NULL
);

-- Normalized per-class snapshot per scrape.
CREATE TABLE grades (
  id              INTEGER PRIMARY KEY,
  scrape_id       INTEGER NOT NULL REFERENCES scrapes(id) ON DELETE CASCADE,
  class_name      TEXT NOT NULL,
  current_grade   TEXT,
  status          TEXT,
  needs_attention INTEGER NOT NULL DEFAULT 0
);

-- Normalized per-assignment snapshot per scrape.
CREATE TABLE assignments (
  id              INTEGER PRIMARY KEY,
  scrape_id       INTEGER NOT NULL REFERENCES scrapes(id) ON DELETE CASCADE,
  class_name      TEXT NOT NULL,
  assignment_name TEXT NOT NULL,
  score           TEXT,
  max_score       TEXT,
  status          TEXT,
  due_date        TEXT
);

CREATE INDEX idx_scrapes_child_run ON scrapes(child_id, run_at DESC);
CREATE INDEX idx_grades_scrape ON grades(scrape_id);
CREATE INDEX idx_assignments_scrape ON assignments(scrape_id);
```

## Project Structure (planned)

```
teacherease-parent-companion/
├── CLAUDE.md
├── README.md
├── package.json             # pnpm workspace root
├── pnpm-lock.yaml
├── biome.json
├── tsconfig.json
├── next.config.mjs          # Next.js static export
├── src/                     # Next.js frontend
│   ├── app/                 # App Router pages
│   │   ├── page.tsx         # Dashboard
│   │   ├── setup/           # First-run wizard
│   │   └── settings/        # Settings pages
│   ├── components/          # Shared React components
│   └── lib/                 # Client-side helpers (IPC wrappers, formatting)
├── src-tauri/               # Rust shell
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   └── src/
│       ├── main.rs          # Tauri entry, plugin wiring, tray, commands
│       ├── commands.rs      # #[tauri::command] handlers callable from frontend
│       └── scraper/         # TypeScript scraper (built as sidecar or inlined)
├── scraper/                 # OR: scraper as standalone Node module
│   ├── teacherease.ts       # login + navigation + HTML parsing (fetch + cheerio)
│   ├── parser.ts
│   └── types.ts
├── tests/                   # Vitest tests
│   ├── scraper/
│   └── fixtures/            # saved HTML fixtures from TeacherEase for offline tests
├── docs/
│   ├── decisions.md
│   ├── design-plan.md       # this file
│   ├── progress.md
│   └── lessons.md
└── .claude/
    ├── settings.json
    ├── agents/
    ├── hooks/
    └── skills/
```

> Scraper location (Rust sidecar vs in-process Node module vs part of the Tauri Rust core) is still open. Deciding during the scaffolding task.

## Build Phases

### Phase 0 — Scaffolding
Stand up the empty Tauri + Next.js shell that builds and runs on all three OSes. No features yet.

### Phase 1 — Core scraper
Port the Python scraper to TypeScript using `fetch` + `cheerio`. Prove login + grade overview + class detail extraction against saved HTML fixtures.

### Phase 2 — Local persistence
Wire up SQLite schema, persist scrape runs, expose read queries to the frontend.

### Phase 3 — Dashboard UI (core)
Minimal read-only dashboard: current grades, needs-attention list, last-run timestamp, Refresh-now button.

### Phase 4 — First-run wizard
4-screen wizard per decisions Q7, with live-login validation on the child-add screen.

### Phase 5 — Scheduler + notifications + tray
Tray-resident timer, OS notifications on "needs attention," autostart registration.

### Phase 6 — Multi-child support
Child switcher, per-child data isolation, Settings → Children page.

### Phase 7 — Dashboard UI (full)
Trends, history, assignment drilldowns. Detailed UX to be designed later (decisions Q-dashboard deferred).

### Phase 8 — Optional email (advanced)
BYO SMTP form in Settings → Advanced. Tutorial copy, not wizard.

### Phase 9 — Updater + release pipeline
`tauri-plugin-updater` wired up, GitHub Actions building per-OS installers, signed update payloads, first release published.

### Phase 10 — First-launch warning docs
Screenshots and walkthrough for Windows SmartScreen / macOS Gatekeeper bypass.

See [progress.md](progress.md) for the concrete task list tracking these phases.

## Out of scope for v1

- Multi-portal support (PowerSchool, Infinite Campus, Canvas, etc.)
- Multi-parent sharing / cloud sync / accounts
- Localization beyond English
- App-store distribution (Mac App Store / Microsoft Store)
- OS code signing (deferred — documented first-launch warnings instead)
- Native OS scheduler integration (Task Scheduler / launchd / systemd)
