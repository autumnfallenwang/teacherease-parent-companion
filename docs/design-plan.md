# TeacherEase Parent Companion — Design Plan

> Single source of truth for what we're building and why. For current build status, see [progress.md](progress.md). For corrections and patterns to avoid, see [lessons.md](lessons.md).

## Concept

A standalone desktop app that monitors a child's TeacherEase parent portal in the background and notifies the parent when there's a new missing assignment, a low score, or other things that need attention. Replaces a Python + Playwright + cron script with a real cross-platform app a non-technical parent can install and forget about.

**Target user:** a parent who can download an installer and click through a 90-second setup wizard, but cannot configure cron, install Python, or generate a Gmail App Password unassisted.

**Target OS priority:**
- **Primary (shipped and tested):** Windows x64, macOS ARM.
- **Secondary (built, lightly tested):** macOS x64, Linux x64.

---

## Locked Decisions

Each entry below is final unless explicitly revisited. Append new decisions here; never rewrite a past one silently.

### Q1 — Scraping: plain HTTP, no browser

**Drop Playwright. Use `fetch` + `cheerio` in plain Node/TS.** Evidence from `ref/teacherease_parents_helper/`: login is a plain HTML form, pages are server-rendered ASP.NET WebForms, no Cloudflare/captcha/2FA. Impact: ~310 MB → ~15 MB installer, 5–10× faster per run, no browser crashes. Known caveat: ASP.NET `__VIEWSTATE` / `__EVENTVALIDATION` two-step login dance. Last-resort fallback (not planned): bundle a headless browser. Revisit if TeacherEase adds JS rendering, bot-detection, or SSO/2FA.

### Q2 — Scheduling: tray-resident internal timer

**Tray-resident app with in-process `setTimeout` timer.** No OS-level scheduler (Task Scheduler / launchd / systemd) in v1. Behavior: launch at login (toggleable, default on), scrape on startup then every 6h while awake, manual "Refresh now" always works, OS notifications on "needs attention," webview destroyed when main window closed.

**Battery guarantees (non-negotiable):**
1. No resident Chromium.
2. Event-driven timer, zero idle CPU.
3. Each scrape ~5–10s, ≤4×/day → ~40s CPU/day.
4. Sleeps with the OS, no wake-from-sleep.
5. Failed scrapes use exponential backoff with hard retry cap (3), then wait for next scheduled run.
6. Main window closed → only Rust core + tray (~10–20 MB RAM).
7. Settings toggle: "Only run scheduled scrapes when plugged in" (off by default).
8. No telemetry, analytics, animations, websockets, keep-alives.

Target: under 0.1% battery per day.

### Q3 — Multi-child from v1

**Support multiple children on the same portal type (TeacherEase) from v1. No in-app login — whoever opens the app sees all children.** Single-child is a degenerate case of multi-child (child-switcher hidden when only one). Not in v1: multi-portal, multi-parent sharing, cloud sync, accounts, in-app auth. Rationale: retrofitting multi-child later means data migration + UI rewrite; doing it now is near-zero cost.

**Credential storage: OS keychain via the `keyring` Rust crate.** One crate, one API, three backends picked at compile time: Keychain (macOS, `Security.framework`), Credential Manager (Windows, DPAPI), Secret Service (Linux, libsecret via D-Bus). **Zero per-OS code** in our source — the `keyring` crate handles all target-specific dispatch internally. Rejected: `tauri-plugin-stronghold` (requires a user-remembered master password, breaks Q7's 90-second wizard flow — Stronghold is an encrypted file vault, NOT the OS keychain) and `keytar` (Node-library, doesn't fit Q11's webview-bundled scraper architecture).

**Keying convention (locks the DB ↔ keychain mapping):**
- **Service name:** `"teacherease-parent-companion"` (constant across all entries, our app's identifier)
- **Per-child portal password:** `user = "child-{id}"` where `{id}` is the SQLite `children.id` integer primary key. Stable across display-name or username edits; guaranteed unique; maps 1:1 to a DB row.
- **Optional SMTP password (Q4):** `user = "smtp-main"`. Flat, one entry, app-level not per-child.
- **Future multi-portal (Q3 v2):** prefix with portal type — `"teacherease-child-1"`, `"powerschool-child-1"`. Not needed day one.

**Atomicity pattern (SQLite and keychain are not one transaction):**
All keychain ops live behind Rust `#[tauri::command]` handlers that also touch the DB, with compensation on failure. Frontend never calls `keyring` directly. `add_child` inserts the DB row first, uses the returned id to write to the keychain; if keychain write fails, rolls back the DB insert. `delete_child` deletes the keychain entry first, then the DB row (orphaned keychain entry is harmless; orphaned DB row is not). `update_password` overwrites the keychain entry with no DB touch. The three commands total ~40 lines of Rust.

**User-visible behavior (all transparent):**
- No install-time dialog, no "enable keychain" toggle, no Settings panel to pre-configure. The vault already exists because the user is logged into their OS account.
- On macOS and Windows: zero prompts, ever.
- On Linux desktop (GNOME/KDE): zero prompts for any user who has ever used Chrome/Firefox/Slack/VS Code on the machine (the login keyring is already initialized). On a truly fresh GNOME account the very first keychain write can trigger a one-time "create default keyring?" dialog with a pre-filled login-matching password — click OK, done forever. This is a libsecret thing, not ours to fix; document in Q10 alongside the other first-launch OS prompts.
- Orphan-cleanup (scan keychain for `child-*` entries with no matching DB row on app startup) is a v1.1 nice-to-have, not day-one scope.

**Credentials never appear in SQLite, plain files, env vars, logs, error messages, or the Rust↔JS bridge more than once per operation** — fetch from keychain on-demand, never cache in JS memory. This is enforced by the security-reviewer agent.

### Q4 — Notifications & email

**Default = in-app dashboard + OS notifications. Email is opt-in, BYO SMTP, no hosted relay.** First-run never mentions email. Advanced setting under Settings → Advanced → "Email reports (optional)," collapsed by default. User provides SMTP host/port/user/pass (typically Gmail App Password). We provide a static tutorial, not an interactive wizard. SMTP creds in OS keychain. Rejected: hosted relay (cost + infra + breaks "100% local" story), per-user hosted signup (same usability cliff). Known limitation: laptop closed all day → no push unless email enabled. Documented in README.

### Q5 — Cross-platform: one codebase, zero per-OS branches

**No `if (platform === ...)` in application source.** All OS differences absorbed by Tauri plugins or mature libs with one unified API:

| Concern | Plugin / lib | Backends |
|---|---|---|
| Notifications | `tauri-plugin-notification` | Toast / UserNotifications / libnotify |
| Tray | built-in `TrayIconBuilder` | Notification area / menu bar / AppIndicator |
| Credentials | `keyring` Rust crate | Credential Manager (DPAPI) / Keychain (Security.framework) / Secret Service (libsecret) |
| Autostart | `tauri-plugin-autostart` | Registry Run / LaunchAgent / `.desktop` |
| App-data folder | Tauri `appDataDir()` | `%APPDATA%` / Application Support / `~/.config` |
| Updater | `tauri-plugin-updater` | MSI / DMG / AppImage or deb |

Per-OS config lives in `tauri.conf.json` (installer type, icons, bundle IDs) — config, not code branches. CI cost: GitHub Actions matrix (~1h one-time setup, free tier covers us).

### Q6 — Desktop shell: Tauri

**Tauri 2, not Electron.** Frontend is Next.js static export + React + TS. Rust is shell/plumbing only — no business logic in Rust. Why: ~15 MB installer vs Electron's ~100 MB+ (native OS webview, no bundled Chromium); ~10–20 MB RAM idle; sandboxed-by-default webview with explicit command allowlist; first-class plugins for every feature in our scope; Tauri 2.x is stable and mature. Trade-offs accepted: three different webviews (avoid bleeding-edge CSS/JS), Rust in build toolchain (handled in CI), smaller community than Electron (offset by good docs).

### Q7 — First-run wizard: 4 screens, linear, skippable

**4 screens, ~90 seconds, one input screen only. Everything also editable later in Settings.**

1. **Welcome.** One sentence, one "Get started" button, small "Skip setup" link.
2. **Add your first child.** Display name + portal email + password. On Continue, attempt real login immediately — success stores creds in keychain and advances; failure shows inline error. **Live validation non-negotiable.**
3. **Notification permission.** Pre-announce with our copy, then trigger OS prompt. Skip is a secondary button and is not nagged later.
4. **All set.** Run first scrape inline, show summary ("3 classes, 1 needs attention, 0 missing"), then "Open dashboard."

**Skip** link top-right of every screen. Skipping before adding a child → empty-state dashboard with CTA. Skipping notifications → one dismissible banner later, never re-prompted. Skip does not disable launch-at-login.

**Explicitly NOT in the wizard:** multi-child (add more via Settings), email/SMTP, launch-at-login prompt (default on silently), portal URL entry (hardcoded), "advanced/import/restore."

**Error copy** is plain language, no codes (e.g., "Couldn't log in. Double-check your email and password.").

### Q8 — History: keep everything forever in SQLite

**Full local history of all scrapes in SQLite. The app is stateful — not stateless like the old cron script.** Tables: `children`, `scrapes`, `raw_payloads` (for retroactive parser fixes), `grades`, `assignments` (normalized for fast trend queries). Retention: keep forever by default — a few years of one family's data is megabytes. Settings → Advanced → "Clear history older than N months" exists as an escape hatch but is off by default. Settings → Export dumps the full `.db`. DB location: Tauri `appDataDir()`, one file `app.db`. History enables: trend views, "first missing" timestamps, diffing between runs to avoid notification spam, retroactive parser fixes from `raw_payloads` without re-scraping.

### Q9 — Distribution: GitHub Releases, unsigned binaries in v1

**GitHub Releases for first-time download. `tauri-plugin-updater` for subsequent updates. Unsigned binaries in v1.** Per-OS assets: Windows `.msi`, macOS `.dmg`, Linux `.AppImage` + `.deb`. No app-store distribution. Updater checks a JSON feed on app launch and once per day; unobtrusive banner in dashboard header; "Later" remembers per version; disable via Settings → Advanced. OS code signing (Apple $99/yr + Windows ~$200+/yr) deferred until real user demand — consequence is first-launch Gatekeeper/SmartScreen warnings, documented with screenshots and click paths in README. **Updater signing is required and separate** from OS signing: Tauri updater keypair, public key baked into the app at build, private key in GitHub Actions secrets. Prevents compromised release → malicious update.

### Q10 — English only in v1

No i18n framework. Strings inline in React components. Retrofitting later is a known mechanical refactor (`react-i18next` or `next-intl`). Revisit if a real user asks (most likely Chinese) or the project grows beyond the initial circle.

### Q11 — Scraper lives in the frontend bundle

**Scraper is a plain TypeScript module under `scraper/`, imported by the Next.js frontend and bundled into the webview's JS. Invoked from React via a Tauri command that calls it through Tauri's `http` allowlist (bypasses CORS). No Node sidecar, no separate process.**

**Why:**
- `fetch` + `cheerio` is pure JS and runs fine inside a webview. Zero runtime dependencies beyond what Tauri already ships.
- Node sidecar would mean shipping Node (~40 MB), managing a child process, and coordinating IPC. All cost, no benefit for a few HTTP calls + HTML parsing.
- Tauri's `http` plugin has a fetch allowlist that bypasses webview CORS for whitelisted hosts (TeacherEase login + grade URLs). This is the intended pattern.
- Keeps the scraper testable in Vitest with fixture HTML — no webview needed for unit tests.

**Trade-off:** The scraper runs in the webview JS context. When the main window is closed, the webview is destroyed (Q2), so scheduled background scrapes need a way to run without the webview. Resolution: the Rust core keeps the webview alive (hidden) during scheduled scrapes, runs the scrape, then destroys the webview again. Alternative if that proves flaky: move the scraper to a small Rust `reqwest` + `scraper` crate reimplementation — but not until we've tried the webview approach.

**Revisit if:** webview-hidden-scrape proves unreliable, or cheerio parsing turns out to be a material bottleneck on a real dataset.

### Q12 — Lint, format, test tooling

**TypeScript side:** Biome 2.4 for lint + format (single tool, replaces ESLint + Prettier), Vitest 4 for tests, `tsc --noEmit` for type-checking. Orchestrated by plain pnpm scripts — **no Turborepo**. Turbo is worth it for real monorepos (see sibling project `homecal/` which has web + api + ios + shared); this project is one TS package plus a `scraper/` folder imported directly into the frontend bundle (Q11), so turbo would add config and caching complexity with zero payoff. Revisit only if `scraper/` later splits into its own workspace package.

**Biome config** is adapted from `homecal/biome.json`: Tailwind-aware CSS parser, `test: recommended` domain, `noFloatingPromises: error`, `useFilenamingConvention: kebab-case`, `noConsole` allowing `error/warn/info`, `noBarrelFile: warn`, `noSecrets: error`, line width 100, double quotes, semicolons, trailing commas. Adds `src-tauri/target` to ignores. Omits the `components/ui/**` override until shadcn/ui actually lands.

**Vitest layout** mirrors `homecal/apps/api`:
- `pnpm test` — full suite (unit + integration against live fixtures).
- `pnpm test:fast` — unit only, via `--exclude 'tests/**/*.integration.test.ts'`.

**Rust side:** stock `rustup` toolchain — no third-party lint/test engines.
- `cargo fmt` (rustfmt, default config) for formatting.
- `cargo clippy -- -D warnings` for linting (treat any lint as CI failure).
- `cargo test` for unit tests (inline `#[cfg(test)]` modules) and integration tests (`src-tauri/tests/`).
- `cargo check` for fast type-checking.
- **`rust-toolchain.toml`** at `src-tauri/` pins the Rust version so CI and dev match. Optional `clippy.toml` only if we need to tune thresholds — not day one.

**Root orchestration** (plain npm scripts in the root `package.json`, no turbo):
- `pnpm lint` → `biome check .` + `(cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings)`
- `pnpm lint:fix` → `biome check --write .` + `(cd src-tauri && cargo fmt)`
- `pnpm typecheck` → `tsc --noEmit`
- `pnpm test` → `vitest run` + `(cd src-tauri && cargo test)`
- `pnpm test:fast` → `vitest run --exclude '**/*.integration.test.ts'`
- `pnpm check` → lint + typecheck + test (full fan-out)

The existing `.claude/skills/check`, `/lint`, `/test` skills already cover both TS and Rust — they shell out to the scripts above.

**`rustup` prerequisite:** Arch's system `rustc` works but `rustup` is strongly preferred (toolchain pinning, what every Tauri guide assumes). Install separately when setting up dev environment.

---

### Q13 — Configuration storage

**A shipped desktop app has no `.env` at runtime.** `.env` is dev-only. All configuration in the installed app flows through UI → SQLite / OS keychain. Config splits into five categories, each with exactly one home:

| Category | Examples | Home |
|---|---|---|
| **Baked-in constants** | URL path templates (`/App/Parents/StandardGrade/GradeViewAllWithProgress`), grade letter mapping, default scrape interval, retry limits, status codes | `scraper/constants.ts` — hardcoded in source, shipped in the binary. Changes require a release. |
| **Per-child data** | Display name, portal username, portal `base_url`, grade, school | SQLite `children` table (see Q8 schema, extended below) |
| **Per-child secrets** | TeacherEase password, SMTP password | OS keychain, keyed by `child.id` or service name |
| **User settings** | Autostart, scrape interval, "only on AC power," notification toggles, updater auto-check, email SMTP host/port/user/from/to | SQLite `settings` table (key-value, see Q8 schema, extended below) |
| **Dev-only environment** | Real TeacherEase URL, real credentials for POCs and live e2e tests | `sandbox/.env` (gitignored, only read by scripts under `sandbox/`, never touched by shipped code) |

**Key insight: the TeacherEase base URL is per-school, not global.** TeacherEase uses per-school subdomains (e.g. `myschool.teacherease.com`). Sibling children at different schools will have different base URLs. So `base_url` lives on the `children` row — the URL **path** templates are constants, but the **host** is per-child.

**Why SQLite (not `tauri-plugin-store` JSON) for user settings:**
- `tauri-plugin-sql` is already wired — one dependency, not two.
- One file to back up / export — matches the Q8 "Settings → Export dumps the full `.db`" promise.
- Transactional: a half-written settings change can't corrupt on crash.
- Settings are all flat primitives — no nesting needed, so key-value is trivial.

**What `.env` becomes:**
- **No root `.env` is read by the shipped app.** Delete that mental model from the old Python repo.
- **`.env.example`** at repo root with dummy values, committed, for devs setting up a sandbox.
- **`sandbox/.env`** — real credentials, gitignored (via `sandbox/`), read only by scripts under `sandbox/`.
- Shipped code never reads `process.env` for configuration. Ever.

**Dummy values (use these in all non-sandbox code):**
- Portal URL: `https://school.example.teacherease.com`
- Email: `test@example.com`
- Password: `hunter2`
- Student name: `"Test Student"`
- Instructor: `"Instructor Name"`

### Project name & repo

"TeacherEase Parent Companion." Repo: `github.com/autumnfallenwang/teacherease-parent-companion`, MIT license. Local working copy: `/home/aaronwang/agentic/homework/teacherease-parent-companion/`. Predecessor (`teacherease_parents_helper`, Python + Playwright) stays as-is; the new repo is the rewrite. A local reference copy of the predecessor lives at `ref/teacherease_parents_helper/` (gitignored) for HTML fixture mining and parser cross-checks — never committed because it contains real portal dumps with PII.

---

## Tech Stack

| Layer | Tech | Rationale link |
|---|---|---|
| Desktop shell | Tauri 2 | Q6 |
| Frontend | Next.js (App Router, static export) + React + TypeScript | Q6 |
| Styling | Tailwind + shadcn/ui (planned) | — |
| Scraper | `fetch` + `cheerio`, bundled into frontend | Q1, Q11 |
| Storage | SQLite via `tauri-plugin-sql` | Q8 |
| Credentials | OS keychain via the `keyring` Rust crate (wrapped in Tauri commands) | Q3, Q5 |
| Scheduler | In-process `setTimeout` timer | Q2 |
| Notifications | `tauri-plugin-notification` | Q4, Q5 |
| Autostart | `tauri-plugin-autostart` | Q5 |
| Updater | `tauri-plugin-updater` | Q9 |
| Lint/Format | Biome | — |
| Tests | Vitest (TS) + `cargo test` (Rust) | — |

---

## Data Model (SQLite)

Rationale: Q8.

```sql
-- One row per child. Credentials NOT here — live in OS keychain keyed by child.id.
CREATE TABLE children (
  id            INTEGER PRIMARY KEY,
  display_name  TEXT NOT NULL,
  portal_type   TEXT NOT NULL DEFAULT 'teacherease',
  base_url      TEXT NOT NULL,          -- per-school subdomain, e.g. https://myschool.teacherease.com (Q13)
  username      TEXT NOT NULL,          -- portal login email, not a secret
  grade         TEXT,
  school        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Key-value user settings (Q13). Everything editable in the UI lives here:
-- autostart, scrape_interval_hours, only_on_ac_power, notifications_enabled,
-- updater_auto_check, email_enabled, email_smtp_host, email_smtp_port,
-- email_smtp_user, email_from, email_to, etc.
-- Secrets (SMTP password, portal passwords) NOT here — they live in the OS keychain.
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

---

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
├── scraper/                 # Plain TS module, imported by src/ (Q11)
│   ├── teacherease.ts       # Login + navigation (fetch, cookie jar)
│   ├── parser.ts            # cheerio HTML → normalized JSON
│   └── types.ts
├── src-tauri/               # Rust shell
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   └── src/
│       ├── main.rs          # Tauri entry, plugin wiring, tray, commands
│       └── commands.rs      # #[tauri::command] handlers callable from frontend
├── tests/                   # Vitest tests
│   ├── scraper/
│   └── fixtures/            # saved HTML fixtures from TeacherEase for offline tests
├── docs/
│   ├── design-plan.md       # this file (merged design + locked decisions)
│   ├── progress.md
│   └── lessons.md
└── .claude/
    ├── settings.json
    ├── agents/
    ├── hooks/
    └── skills/
```

## Forward compatibility (a note, not a decision)

This project has **no backend service** — it's a desktop-local app by Q3 (no server, no cloud, no accounts). However, if a future version ever grows into a web/SaaS product or gains a second frontend (iOS, etc.), the code is structured so the portable pieces can be lifted into a monorepo without a rewrite.

**Portable core** (zero platform imports — safe to promote to `packages/core/` later):
- `scraper/` — `fetch` + `cheerio` + types, per Q11.
- `src/lib/core/` — pure business logic (diff algorithms, "needs attention" rules, trend computations, grade formatting). No Tauri, no SQLite, no keychain, no `process.env`.
- `src/components/` — React components that receive data as props and emit callbacks. No direct Tauri imports.
- `scraper/types.ts` — single source of truth for `Child`, `Scrape`, `Grade`, `Assignment`. Imported by scraper, UI, and any future backend.

**Platform integration** (non-portable — rewritten when platform changes):
- `src-tauri/src/` — Rust shell, Tauri commands, plugin wiring.
- `src/lib/ipc.ts` — the single TS file allowed to import from `@tauri-apps/*`. A future web version replaces this file with `src/lib/api.ts` (REST client) and every React component keeps working.
- `next.config.mjs` — static-export config specific to Tauri bundling.

**Rules enforcing this** (cheap to follow, expensive to retrofit):
1. `scraper/` never imports from `@tauri-apps/*` or `src/lib/ipc.ts`. Pure module. (Q11 locks this; Biome `noRestrictedImports` enforces it.)
2. `src/lib/core/` never imports from `@tauri-apps/*`, `src/lib/ipc.ts`, SQLite, or keychain. Pure functions only.
3. React components (`src/app/`, `src/components/`) import from `src/lib/ipc.ts`, **never** from `@tauri-apps/*` directly. Biome blocks the direct imports.
4. Business logic never lives in React components or Rust code — it lives in `src/lib/core/` so both platforms can reuse it.

**What we explicitly do NOT do upfront:**
- No ports/adapters hexagonal architecture. Designing interfaces against one implementation produces the wrong interfaces.
- No local Hono/Express server inside Tauri. It would force shipping a Node runtime (contradicts Q6's installer-size win) and it's cosplay rather than a real backend — a real backend has auth, multi-user isolation, cron, deploy pipeline, none of which a local in-process server provides.
- No premature `packages/` workspace extraction. The project has one consumer today; Turborepo pays for itself when there are real sibling apps (homecal-style), not before.

**Migration shape if SaaS ever happens:**
```
scraper/              →  packages/core/scraper/
src/lib/core/         →  packages/core/business/
scraper/types.ts      →  packages/core/types.ts
src/components/       →  packages/ui/
src/lib/ipc.ts        →  stays in apps/desktop/ (Tauri-only)
                         apps/web/client/src/lib/api.ts created fresh (REST client)
                         apps/web/server/ created fresh (Hono + Postgres + auth + cron)
```
Mechanical file moves + import path updates, not a rewrite. The new backend imports `packages/core/scraper/` and runs it server-side. The web client imports the same `packages/ui/` components the desktop renders. Zero duplicated logic.

---

## Build Phases

### Phase 0 — Scaffolding
Empty Tauri + Next.js shell that builds and runs on all three OSes. No features.

### Phase 1 — Core scraper
Port the Python scraper to TS (`fetch` + `cheerio`). Prove login + grade overview + class detail against saved HTML fixtures.

### Phase 2 — Local persistence
SQLite schema, persist scrape runs, expose read queries to frontend.

### Phase 3 — Dashboard UI (core)
Minimal read-only dashboard: current grades, needs-attention list, last-run timestamp, Refresh-now button.

### Phase 4 — First-run wizard
4-screen wizard per Q7, with live-login validation.

### Phase 5 — Scheduler + notifications + tray
Tray-resident timer, OS notifications, autostart registration.

### Phase 6 — Multi-child support
Child switcher, per-child data isolation, Settings → Children page.

### Phase 7 — Dashboard UI (full)
Trends, history, assignment drilldowns. Detailed UX designed when implementing.

### Phase 8 — Optional email (advanced)
BYO SMTP form in Settings → Advanced. Tutorial copy, not wizard.

### Phase 9 — Updater + release pipeline
`tauri-plugin-updater` wired up, GitHub Actions building per-OS installers, signed update payloads, first release.

### Phase 10 — First-launch warning docs
Screenshots and walkthrough for Windows SmartScreen / macOS Gatekeeper bypass. Brief mention of the Linux GNOME "create default keyring" one-time dialog for fresh user accounts (per Q3) — not our bug, but worth pre-warning users who see it.

See [progress.md](progress.md) for the concrete task list tracking these phases.

---

## Out of scope for v1

- Multi-portal support (PowerSchool, Infinite Campus, Canvas, etc.)
- Multi-parent sharing / cloud sync / accounts
- Localization beyond English
- App-store distribution (Mac App Store / Microsoft Store)
- OS code signing (deferred — documented first-launch warnings instead)
- Native OS scheduler integration (Task Scheduler / launchd / systemd)
