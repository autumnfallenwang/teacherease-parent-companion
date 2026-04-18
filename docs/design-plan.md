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

### Q14 — Logging architecture

**One unified log stream (Rust + TS → one file), file-based with rotation, level controlled by build mode.**

All writable data lives in the OS app-data directory (not inside the app binary). This is the universal desktop app convention — the installed binary is read-only (`/Applications/`, `C:\Program Files\`, AppImage). Logs, the SQLite database, and any other writable files go to:
- Linux: `~/.local/share/<identifier>/`
- macOS: `~/Library/Application Support/<identifier>/`
- Windows: `%APPDATA%/<identifier>/`

Tauri manages these paths via `appDataDir()` and `appLogDir()`. We never hardcode OS-specific paths in application code.

**Log targets:**

| Mode | File | Console | Level |
|---|---|---|---|
| Dev (`debug_assertions`) | Yes (rotation) | Yes (stdout) | `DEBUG` |
| Release | Yes (rotation) | No | `INFO` |

File rotation: 5 files × 2 MB max. `tauri-plugin-log` handles this automatically.

**Cross-language logging:**
- Rust: `log::info!()`, `log::warn!()`, etc. — captured by `tauri-plugin-log`.
- TypeScript: `import { info, warn, error } from "@tauri-apps/plugin-log"` — routes through Tauri IPC into the same log file as Rust. Both languages produce one interleaved chronological stream.
- The app logs its DB path and version on startup so developers always know where files are.

**What to log:**
- App version + DB path on startup
- Plugin registration success/failure
- Keychain operations (which key — NOT the password value)
- Scrape lifecycle: start, login success/fail, pages fetched, class count, missing count, scrape ID, duration
- Errors with context (message + stack)

**What to NEVER log (security constraint):**
- Passwords, cookies, session tokens, SMTP credentials
- Raw HTML from TeacherEase (may contain PII)
- Student names, grades, scores, assignment details (PII)
- Any value from the OS keychain

**User access (release):**
- Settings → About → "View logs" button opens the OS log directory in the file manager.
- For bug reports: user sends the log file. Contains only operational metadata, no PII.

**User-configurable level (future):**
- Settings → Advanced → Log Level dropdown (stored in `settings` table). Not in v1 — compile-time level is sufficient.

### Q15 — Legal disclaimer

**Single source of truth: `src/lib/legal.ts`.** All legal text (disclaimer, privacy notice, responsible use) lives in one TypeScript file. Every other location references or mirrors it:

| Location | What it shows | How |
|---|---|---|
| Wizard welcome screen | Short disclaimer (1 sentence) | Imports `DISCLAIMER_SHORT` from `legal.ts` |
| `/about` page | Full disclaimer + privacy + responsible use | Imports `DISCLAIMER_FULL`, `PRIVACY_NOTICE`, `RESPONSIBLE_USE` |
| Settings page | "About & Legal" link → `/about` | Navigation link |
| `DISCLAIMER.md` (repo root) | Mirror of full text | Manual mirror, header says "update `legal.ts`, not this file" |
| `README.md` | Points to `DISCLAIMER.md` | One-line reference, no duplication |

**Why the app shows it, not just the repo:** parents who download the installer never see the README. The disclaimer must be visible before they enter credentials (wizard step 1) and accessible anytime (Settings → About).

**Key legal positions (from TeacherEase TOS review 2026-04-16):**
- TeacherEase TOS has no anti-scraping clause, no bot prohibition, no third-party app ban.
- Data is owned by schools (not TeacherEase). FERPA gives parents the right to access it.
- The app uses authorized access (parent's own credentials), not security bypasses.
- MIT license provides "as is" + "no warranty" protection for the developer.
- The in-app disclaimer establishes informed consent: user acknowledges the tool is unofficial and accepts responsibility.

### Project name & repo

"TeacherEase Parent Companion." Repo: `github.com/autumnfallenwang/teacherease-parent-companion`, MIT license. Local working copy: `/home/aaronwang/agentic/homework/teacherease-parent-companion/`. Predecessor (`teacherease_parents_helper`, Python + Playwright) stays as-is; the new repo is the rewrite. A local reference copy of the predecessor lives at `ref/teacherease_parents_helper/` (gitignored) for HTML fixture mining and parser cross-checks — never committed because it contains real portal dumps with PII.

### Q16 — Dashboard UX (Phase 7)

**The dashboard is a living progress report.** Each class is a section you can open to see the full standard-by-standard breakdown, with a gentle status timeline showing change over time. No separate pages — everything is progressive disclosure within the main scroll.

**Design direction:** warm editorial — deepening the existing Newsreader + DM Sans / oklch earth-tone / binder-tab / paper-texture aesthetic. The dashboard evolves from a flat class list into an interactive report card.

#### Status history strip (T33)

Each class row gets a **5-dot timeline** between the class name and status badge:

- 5 small circles (8px) representing the last 5 scrapes, oldest→newest left→right.
- Colors use existing tokens: `--meeting` (teal-green), `--attention` (warm amber), `--ungraded` (cool gray).
- Filled circles for data, empty ring-only circles for "no data yet" (fewer than 5 scrapes).
- Solid fills with subtle 1px inset shadow for an "ink stamp on paper" feel.
- Optional trend arrow alongside the status badge: `↑` (improved, teal) / `↓` (declined, amber) / nothing if unchanged.

#### Class accordion drilldown (T34)

Clicking a class row expands an **inline detail panel** below it:

- **Background**: `bg-secondary/50` with a subtle top border matching the class's binder-tab color — like opening a tabbed folder section.
- **Animation**: CSS `grid-template-rows: 0fr → 1fr` transition (pure CSS, no motion library).
- **Chevron**: `ChevronRight` rotates to `ChevronDown` on expand.
- **One class at a time**: clicking another collapses the previous.

**Standards tree inside the accordion:**
- Each standard is a section header in Newsreader serif with a meeting/not-meeting indicator.
- Sub-standards indent with left-margin steps (no tree lines — clean).
- Assignments listed under their parent standard: `name · grade letter · score`. Missing items use the existing amber attention treatment (`bg-attention/5 + border-attention/20`).
- Standards with no assignments show "(no assignments yet)" in muted text.

**Data source:** `raw_payloads` JSON contains the full recursive `Standard[]` tree, already persisted by `persistScrape()`.

#### New IPC queries

| Query | Purpose |
|---|---|
| `getStatusHistory(childId, className, limit=5)` | Last N scrape statuses for one class (JOIN grades ↔ scrapes) |
| `getClassDetail(scrapeId, className)` | Parse `ClassDetails` from `raw_payloads` JSON for one class |

#### New components

| Component | Task | Description |
|---|---|---|
| `StatusDots` | T33 | 5 colored circles showing status history, inline in class row |
| `ClassRow` | T33 | Refactored clickable class row (replaces current static row in GradesTable) |
| `ClassAccordion` | T34 | Expandable panel below class row with smooth CSS transition |
| `StandardsTree` | T34 | Recursive standard → sub-standard → assignment renderer |

#### Explicit non-goals

- No chart library (recharts, D3) — status is categorical (3 values), dots are sufficient.
- No date range picker — always latest scrape + last 5 for history.
- No separate trends page — everything in the dashboard via progressive disclosure.
- No per-assignment history across scrapes — only class-level status history.
- No assignment editing — read-only always.

### Q18 — Dashboard UX v2: "The Progress Report" (supersedes Q16 layout)

**The dashboard is a peace-of-mind monitor, not a data table.** A parent opens the app and gets a family-wide verdict in 2 seconds. Detail is available on demand through progressive disclosure in one vertical scroll. No separate pages, no mode toggles, no confusion.

Q16 established the aesthetic direction (warm editorial, Newsreader + DM Sans, binder tabs, paper texture) and the accordion/dots primitives — those remain. Q18 redesigns the information architecture for the full v2 data (all classes detailed, progress numbers, standards tree everywhere) and multi-child families.

#### Design direction

**Tone:** Like a well-designed weekly progress letter from a thoughtful school counselor. Not a dashboard. Not a grade tracker. A report. The parent feels informed and calm after a 10-second glance.

**The unforgettable element:** The Status Hero — a family-wide card at the top that shows ALL children's status before the parent reads anything else. Green when everything's fine. Amber when any child needs attention.

#### Multi-child architecture

The dashboard has two zones: **family-wide** (Status Hero) and **per-child** (everything below).

- **1 child:** Hero shows just them. No child tabs visible — clean single-child experience.
- **2+ children:** Hero shows all children's verdicts stacked. Below the hero, a **tab bar** (not dropdown) switches the per-child content. Auto-selects the child who needs attention on load.

The header child-switcher dropdown is replaced by the tab bar below the hero — more visible, more tappable, contextually placed.

#### Full layout (vertical scroll)

```
┌────────────────────────────────────────────────────────┐
│  Header: [T] Parent Companion        [Refresh]  [⚙]   │
│          Checked 2h ago                                │
╞════════════════════════════════════════════════════════╡
│                                                        │
│  LAYER 1: Status Hero (FAMILY-WIDE)                    │
│  ┌────────────────────────────────────────────────┐    │
│  │                                                │    │
│  │  ✓ Alex — all good                            │    │  Newsreader 18px
│  │    7 meeting · 1 not assessed                  │    │  DM Sans 12px muted
│  │                                                │    │
│  │  ⚠ Sam — 1 class needs attention              │    │  amber tint on this row
│  │    Writing 5 · 1 missing                       │    │
│  │    4 meeting · 1 not assessed                  │    │
│  │                                                │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  CHILD TABS (hidden if 1 child)                        │
│  ┌──────────┐┌──────────┐                              │
│  │   Alex   ││  ● Sam   │  ← dot = needs attention    │
│  └──────────┘└──────────┘    selected tab underlined   │
│                                                        │
│─ ─ ─ ─ ─ ─  Per-child content below  ─ ─ ─ ─ ─ ─ ─ ─│
│                                                        │
│  LAYER 2: Recent Activity (time-based, 24h)            │
│  ┌────────────────────────────────────────────────┐    │
│  │  Today                                         │    │
│  │  ↑ Geography improved 2.50 → 2.84             │    │
│  │  ★ 2 new scores in Mathematics                 │    │
│  │  ⚠ Mount Everest still missing (3 weeks)      │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  LAYER 3: Missing Work (if any exist for this child)   │
│  ┌────────────────────────────────────────────────┐    │
│  │  ✕ Missing Work                           11   │    │
│  │                                                │    │
│  │  Overdue (3+ weeks)                            │    │  deep amber bg
│  │  ├ Mount Everest · Social Studies · 3/25       │    │
│  │  ├ Forger Google Form · Social Studies · 12/23 │    │
│  │                                                │    │
│  │  Overdue (1–3 weeks)                           │    │  medium amber bg
│  │  ├ Gandhi Article · Social Studies · 4/2       │    │
│  │                                                │    │
│  │  Recent                                        │    │  light amber border
│  │  ├ SW Asia Map · Social Studies · 4/15         │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  LAYER 4: All Classes (for selected child)             │
│  ┌────────────────────────────────────────────────┐    │
│  │  Classes                              8 total  │    │
│  │                                                │    │
│  │  ⚠ Social Studies 7          Paddol, D         │    │  ← attention first
│  │     ████░░░░░░░░░░░░  5/20   ◐ ◐ ◐ ◐ ◐       │    │     progress + dots
│  │                                                │    │
│  │  ✓ Mathematics 7             Isles, D          │    │  ← meeting: quieter
│  │     █████████░░░░░░░  9/74   ● ● ● ● ●        │    │
│  │                                                │    │
│  │  ✓ Computer Science 7        Zides, T          │    │
│  │     █░░░░░░░░░░░░░░░  1/23   ● ● ● ● ●        │    │
│  │                                                │    │
│  │  ✓ Music 7                   Lee, S            │    │
│  │     ██████████░░░░░░  2/4    ● ● ● ● ●        │    │
│  │                                                │    │
│  │  ─ Science 7                 Welsh, J          │    │  ← not assessed: gray
│  │     ░░░░░░░░░░░░░░░░  0/33                    │    │
│  │  ...                                           │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  LAYER 5: Class Detail (accordion, one at a time)      │
│  ┌────────────────────────────────────────────────┐    │
│  │  ▾ Social Studies 7                            │    │
│  │  ┌──────────────────────────────────────────┐  │    │
│  │  │  Research Skills              3=M   ✓    │  │    │
│  │  │    Uses note taking...        3=M   ✓    │  │    │
│  │  │      Gandhi Packet    w:512   3=M        │  │    │
│  │  │                                          │  │    │
│  │  │  Geography                   2.84=M ✓    │  │    │
│  │  │    Identifies and locates     3=M   ✓    │  │    │
│  │  │      South Asia Map  w:512   3=M         │  │    │
│  │  │      Mount Everest           Missing ⚠   │  │    │
│  │  │    Understands the role of   2.67=M ✓    │  │    │
│  │  │      ...                                 │  │    │
│  │  └──────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
└────────────────────────────────────────────────────────┘
```

#### Layer 1: Status Hero (family-wide)

A rounded card spanning the full content width, immediately below the header. Shows ALL children's status.

**Visual spec:**

| Element | Detail |
|---|---|
| Container | `rounded-xl`, `shadow-[0_2px_8px_rgba(0,0,0,0.04)]`, `px-5 py-4` |
| Per-child row | Flex row: icon + name + verdict. ~28px per child. |
| Child name | Newsreader 18px, `font-medium`. Teal if all good, amber if attention. |
| Status line | DM Sans 12px, `text-muted-foreground`: "7 meeting · 1 not assessed" |
| Attention detail | DM Sans 12px, `text-attention-foreground`: "Social Studies 7 · 8 missing" |
| Row background | Subtle per-row tint: `bg-meeting/6` if all good, `bg-attention/6` if attention. Rounded. |
| Divider | 1px `border-border/50` between children. No divider for single child. |

**Behavior:**
- Tapping a child's name in the hero auto-selects their tab below (on multi-child)
- If only 1 child, the hero is simpler — no name prefix, just the verdict

**Single child:**
```
┌─────────────────────────────────────────┐
│  ✓ All good                            │  bg-meeting/6
│  7 meeting · 1 not assessed            │
└─────────────────────────────────────────┘
```

**Multi-child, mixed status:**
```
┌─────────────────────────────────────────┐
│  ✓ Alex — all good                     │  bg-meeting/6 on this row
│    7 meeting · 1 not assessed           │
│─────────────────────────────────────────│  1px divider
│  ⚠ Sam — 1 class needs attention      │  bg-attention/6 on this row
│    Writing 5 · 1 missing                │
│    4 meeting · 1 not assessed           │
└─────────────────────────────────────────┘
```

#### Child Tabs (replaces header dropdown)

Positioned directly below the Status Hero. Only visible when 2+ children.

| Element | Detail |
|---|---|
| Tab bar | Flex row, `gap-1`, `px-1`, `py-1`, `bg-secondary/50`, `rounded-lg` |
| Tab button | `px-4 py-1.5`, `rounded-md`, `text-[13px]`, DM Sans `font-medium` |
| Selected tab | `bg-card`, `shadow-sm`, `text-foreground` |
| Unselected tab | `text-muted-foreground`, hover `text-foreground` |
| Attention dot | 6px amber circle to the left of the name: `bg-attention`, `rounded-full` |
| Transition | Selected tab background slides with `transition-all duration-200` |

**Auto-select logic:** On load, select the first child with `needs_attention`. If all are fine, select the first child. When switching tabs, the per-child content (Layers 2–5) updates instantly from cached data.

#### Layer 2: Recent Activity (per-child, time-based)

**Time-based, not scrape-based.** Compares current scrape vs the nearest scrape ~24h ago. Stable across multiple refreshes in the same day.

| Element | Detail |
|---|---|
| Section heading | "Today" or "Since yesterday" in DM Sans 11px, `uppercase`, `tracking-wider`, `text-muted-foreground`, `border-t border-border/30`, `pt-3 mt-4` |
| Item row | Flex row: icon (16px) + text (DM Sans 12px). `py-1`. |
| Improvement | `TrendingUp` icon in `text-meeting`. Text: "Geography improved 2.50 → 2.84" |
| Decline | `TrendingDown` icon in `text-attention`. Text: "Algebra declined 3.0 → 2.5" |
| New scores | `Sparkles` icon in `text-primary`. Text: "2 new scores in Mathematics" |
| Aging missing | `Clock` icon in `text-attention`. Text: "Mount Everest still missing (3 weeks)" |
| Empty state | Hidden entirely if no activity. No "nothing new" message — absence = no news. |
| Overflow | Max 5 items visible. "Show N more" link in `text-muted-foreground` if overflow. |

**Data source:** Pure function `computeRecentActivity()` in `core/activity.ts`. Inputs: current grades + assignments, 24h-ago grades + assignments. Output: `ActivityItem[]`.

**IPC query:** `getScrapeBefore(childId, isoDate)` — `SELECT * FROM scrapes WHERE child_id = $1 AND run_at < $2 AND status = 'success' ORDER BY run_at DESC LIMIT 1`

#### Layer 3: Attention (per-child — missing work + low scores)

Replaces the former "Missing Work" section. Shows two categories of attention items in one section. Only renders if there are any items.

**Recency-first layout.** Items grouped by time (this week vs older), not by category. Within each time group, missing work appears before low scores. Older items collapsed by default.

**Time groups:**

| Group | Condition | Default state |
|---|---|---|
| This week | `dueDate >= now - 7d` or missing for < 7d | **Expanded** — what's new and actionable |
| Older | Everything else | **Collapsed** — parent already knows about these |

**Within each time group, two categories:**
- Missing work: amber-tinted rows with overdue indicators
- Low scores: lighter rows with score badge. Threshold: `gradeNumeric > 0 && gradeNumeric < 3.0` (below Meeting)

**Layout:**
```
⚠ Attention                                   5

  This week                                        ← expanded
  ├ Missing: Fitness Log Week 9 · PE · 1 day
  ├ Low: Gandhi Article · Social Studies · 2=P

  ▸ Older (3)                                      ← collapsed, click to expand
    ├ Missing: Geography Quiz · Social Studies · 2 wks
    ├ Low: Current Events · Social Studies · 1=B
    └ Low: Fraction Practice · Math · 2.5=P
```

**Visual spec:**
- "This week" header: DM Sans 11px, uppercase, `text-muted-foreground`
- "Older (N)" header: same style + chevron, clickable to toggle
- Missing rows: `border-attention/20 bg-attention/5` with clock icon + due date
- Low score rows: `border-border bg-amber-50/30` with score badge (amber if < 2.0, muted if 2.0-2.99)

**Data source:**
- Pure function `groupAttentionByRecency()` in `core/attention.ts`
- Input: missing `AssignmentRecord[]` + all `AssignmentRecord[]`
- Output: `{ thisWeek: AttentionItem[], older: AttentionItem[] }`
- `AttentionItem = { type: "missing" | "lowScore", assignment: AssignmentRecord }`

#### Layer 4: All Classes (per-child)

All classes always visible. No toggle. Sorted by urgency.

**Sort order:**
1. `needs_attention` — amber binder-tab border
2. `meeting` — subject-color binder-tab border
3. `not_assessed` — gray binder-tab border

**Class row layout (enhanced from T33):**

```
┌─ border-left-3px (binder tab color) ─────────────────────────────────┐
│  ▸  Mathematics 7                Isles, D                            │
│     ███████████░░░░░░░░  9/74    ● ● ● ● ●    Meeting ✓            │
└──────────────────────────────────────────────────────────────────────┘
     ↑chevron  ↑name 14px          ↑instructor   ↑progress   ↑dots    ↑badge
               font-medium         11px muted     bar 4px     8px      existing
```

| Element | Detail |
|---|---|
| Row container | `button`, full width, `rounded-lg`, `bg-card`, `shadow-[0_1px_2px_rgba(0,0,0,0.04)]`, border-left binder tab. `py-3 px-4`. |
| Class name | DM Sans 14px, `font-medium`, left-aligned. |
| Instructor | DM Sans 11px, `text-muted-foreground`, below class name or right-aligned on wide screens. |
| Progress bar | 4px tall, `rounded-full`, `w-24`. Three segments: teal (`meeting`) + amber (`not_meeting`) + gray track. |
| Progress label | DM Sans 11px, `tabular-nums`, `text-muted-foreground`: "9/74" to the right of the bar. |
| Status dots | 5 circles, 8px, from T33. Already built. |
| Status badge | Pill badge from T33. Already built. |
| Chevron | `ChevronRight` 14px, muted. Rotates 90° on expand. `transition-transform duration-200`. |
| Row height | ~60px (two lines: name/instructor + progress/dots/badge). |

**Progress bar component:**
```
<div class="h-1 w-24 rounded-full bg-muted overflow-hidden flex">
  <div class="bg-meeting" style="width: ${meetingPct}%" />
  <div class="bg-attention" style="width: ${notMeetingPct}%" />
</div>
```

#### Layer 5: Class Detail (accordion, per-child)

Already built in T34. Now available for ALL classes. One class expanded at a time.

**Changes from T34:**
- Remove the "Detailed breakdown available for classes that need attention" empty state — all classes have detail now.
- Replace with "No standards data available" only if `standards.length === 0` (rare edge case).

#### New components

| Component | Props | Description |
|---|---|---|
| `StatusHero` | `children: Array<{ name, meeting, attention, notAssessed, attentionClasses }>`, `onChildSelect` | Family-wide verdict card. One row per child. |
| `ChildTabs` | `children: ChildRecord[]`, `selectedId`, `attentionChildIds`, `onSelect` | Tab bar below hero. Hidden if 1 child. Amber dot for attention children. |
| `RecentActivity` | `activities: ActivityItem[]` | Time-based change list. Hidden if empty. |
| `ProgressBar` | `meeting`, `notMeeting`, `total` | Thin 4px horizontal bar with label. |

#### Modified components

| Component | Change |
|---|---|
| `GradesTable` | Add `ProgressBar`, instructor name, sort by status. |
| `MissingWork` → `AttentionSection` | Show missing work (grouped by urgency) + low scores (below M/3.0) in one section. |
| `Dashboard` | Replace `ChildSwitcher` with `ChildTabs`. Add `StatusHero` + `RecentActivity`. Load all children's grades for hero. Pass low-score assignments to AttentionSection. |
| `Header` | Remove children slot (tabs move below hero). |
| `StandardsTree` | Remove needs-attention-only empty state. |

#### New IPC queries

| Query | Purpose |
|---|---|
| `getScrapeBefore(childId, isoDate)` | Nearest successful scrape before timestamp (for 24h activity comparison) |

#### New pure functions (in `core/`, no platform imports)

| Function | File | Purpose |
|---|---|---|
| `computeRecentActivity()` | `core/activity.ts` | Diff two scrape snapshots → `ActivityItem[]` with type/icon/text |
| `groupMissingByUrgency()` | `core/missing.ts` | Group missing `AssignmentRecord[]` by overdue duration |
| `getLowScoreAssignments()` | `core/attention.ts` | Filter assignments where `scoreNumeric > 0 && scoreNumeric < 3.0`, sorted by score ascending |
| `sortClassesByUrgency()` | `core/sort.ts` | Sort grades: attention → meeting → not_assessed |

#### Seed data requirements

The seed script must generate **time-varying data** to exercise all dashboard features:

| Day | Event | Tests |
|---|---|---|
| -7 to -5 | All classes meeting, few assignments | Baseline state |
| -4 | New assignment appears (not graded yet) | RecentActivity: "new assignment" |
| -3 | Assignment marked missing. Low score (2=P) graded. | Attention: missing + low score appear |
| -2 | Social Studies drops to needs_attention | StatusHero changes, status dots shift |
| -1 | Student turns in one missing assignment (→ graded 2=P) | RecentActivity: "resolved" + "new score" |
| 0 | Current state: mix of meeting, attention, missing, low scores | Full dashboard exercise |

This gives:
- Status dots with visible color transitions (green → amber)
- Trend arrows (↓ for declining classes)
- RecentActivity with real change data
- Attention section with both missing and low-score items
- Progress bars with non-trivial ratios

#### Explicit non-goals

- No chart library — status dots + progress bars are pure CSS/HTML
- No separate analytics/trends page — everything in the main scroll
- No toggle between "attention" and "full" view — sort order does this naturally
- No cross-trimester comparison — current trimester only
- No date range picker for activity — fixed 24h window
- No assignment editing — read-only always
- No per-child separate pages — one scroll, tab-switch for child selection

### Q19 — Homework scraping (Google Sites, Phase 8)

**Scrape daily homework assignments from a public Google Sites page and display in the dashboard.** No authentication needed. Optional per-child feature — if no URL configured, homework section is hidden.

#### Source

Public Google Sites page maintained by the school team (e.g., `sites.google.com/lexingtonma.org/explorer-team/homework`). Verified: plain `fetch` + cheerio works — content is server-rendered in `div.hJDwNd-AhqUyc-uQSCkd`. No Playwright needed.

#### Data structure

```
Homework for 4/16/26
Science:
Unnatural selection video and worksheet due Friday. Video on Google classroom
Due: Friday 4/17

World Geography:
None
Due: Friday 4/17

English
Read Chapter 3 of The Giver and answer the questions in the packet for Chapter 3
Due: Friday 4/17

Math:
MCAS Packet #3 (due Fri)
Due: Friday 4/17
```

Parsed into: `HomeworkEntry { date, subjects: [{ name, content, dueDate }] }`

#### Configuration

- `homework_url` column on `children` table (nullable)
- Set during child setup wizard or settings page
- If null → homework feature completely hidden for this child

#### Schema (migration v3)

```sql
ALTER TABLE children ADD COLUMN homework_url TEXT;

CREATE TABLE homework (
  id         INTEGER PRIMARY KEY,
  child_id   INTEGER NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  hw_date    TEXT NOT NULL,
  subject    TEXT NOT NULL,
  content    TEXT NOT NULL,
  due_date   TEXT,
  scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(child_id, hw_date, subject)
);

CREATE INDEX idx_homework_child_date ON homework(child_id, hw_date DESC);
```

#### Dashboard integration

"Tonight's Homework" card between the Attention section and Classes list. Shows today's (or tomorrow's if after school hours) homework by subject. Only renders when `homework_url` is configured and homework data exists.

#### Scrape behavior

- Fetched on dashboard refresh (alongside TeacherEase scrape)
- Upsert by `(child_id, hw_date, subject)` — idempotent
- Only current month's entries persisted (matches original behavior)

#### Future (not v1): cross-referencing with TeacherEase

- Class name mapping: "Science" in homework ↔ "Science 7" in TeacherEase
- Assignment correlation: homework "Lab worksheet" → TeacherEase "Lab worksheet" graded
- Would need manual class mapping per child in settings

### Q17 — Data model v2: full normalization + fetch all detail pages

**Fetch detail pages for ALL classes (not just needs_attention) and normalize the data model.**

#### Decision

The v1 model stored class-level status only, discarded ClassID/CGPID/instructor/progress numbers, and only fetched detail pages for needs_attention classes. After exploring the live portal (2026-04-16), we found rich per-class data being thrown away and confirmed that the standards tree structure varies across classes (2-3 layers, different grading scales).

v2 changes:
1. **Scraper fetches detail pages for ALL 8 classes**, not just needs_attention. Cost: ~8 extra HTTP requests per scrape (~12s total). Acceptable for a 6-hour interval.
2. **New `classes` table** — persists class metadata (ClassID, CGPID, instructor, grading scale). Upserted each scrape, not snapshotted.
3. **New `standards` table** — self-referential tree (adjacency list via `parent_id`). Snapshotted each scrape for trend tracking.
4. **Enhanced `grades`** — FK to `classes`, adds progress numbers (targets_meeting/not_meeting/not_assessed). Drops redundant `current_grade` column.
5. **Enhanced `assignments`** — FK to `classes`, adds `te_assignment_id` (TestNameID for deduplication), weight, score breakdown. Deduplicated per scrape (one row per assignment, not per standard-assignment link).
6. **No junction table** — the many-to-many (assignment under multiple standards) stays in `raw_payloads` JSON only. The drilldown UI parses JSON; SQL doesn't need the junction.

#### Schema (v2 migration)

```sql
CREATE TABLE classes (
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

-- grades: FK to classes, add progress, drop current_grade
ALTER TABLE grades ADD COLUMN class_id INTEGER REFERENCES classes(id);
ALTER TABLE grades ADD COLUMN targets_meeting INTEGER;
ALTER TABLE grades ADD COLUMN targets_not_meeting INTEGER;
ALTER TABLE grades ADD COLUMN targets_not_assessed INTEGER;
-- (migration backfills class_id from class_name, then drops class_name + current_grade)

CREATE TABLE standards (
  id              INTEGER PRIMARY KEY,
  scrape_id       INTEGER NOT NULL REFERENCES scrapes(id) ON DELETE CASCADE,
  class_id        INTEGER NOT NULL REFERENCES classes(id),
  parent_id       INTEGER REFERENCES standards(id),
  name            TEXT NOT NULL,
  score_numeric   REAL,
  score_letter    TEXT,
  is_meeting      INTEGER
);

-- assignments: FK to classes, add weight + score breakdown + te_assignment_id
ALTER TABLE assignments ADD COLUMN class_id INTEGER REFERENCES classes(id);
ALTER TABLE assignments ADD COLUMN te_assignment_id INTEGER;
ALTER TABLE assignments ADD COLUMN score_numeric REAL;
ALTER TABLE assignments ADD COLUMN score_letter TEXT;
ALTER TABLE assignments ADD COLUMN weight INTEGER;
ALTER TABLE assignments ADD COLUMN is_missing INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assignments ADD COLUMN feedback TEXT;
-- (migration backfills class_id, renames status→is_missing where status='missing')

CREATE INDEX idx_classes_child ON classes(child_id);
CREATE INDEX idx_standards_scrape ON standards(scrape_id);
CREATE INDEX idx_standards_class ON standards(class_id, scrape_id);
CREATE INDEX idx_assignments_class ON assignments(class_id, scrape_id);
```

#### Table roles

| Table | Role | Growth pattern |
|---|---|---|
| `children` | Who | Static (1-2 rows) |
| `classes` | What classes exist | Upsert (~8 rows, stable) |
| `scrapes` | Timeline (when) | +1 per scrape |
| `grades` | Class status snapshot | +8 per scrape |
| `standards` | Standard scores snapshot | +~50 per scrape |
| `assignments` | Assignment grades snapshot | +~40 per scrape |
| `raw_payloads` | Full tree for drilldown | +1 per scrape |

#### What this unlocks

- Progress bars on class rows (targets_meeting / total)
- Standard-level trend tracking (e.g., "Geography went from 2.5 → 2.84")
- Instructor shown in UI
- Build detail URLs from DB without re-scraping overview
- Detect new/dropped classes and instructor changes
- Foundation for smarter notifications ("Geography is declining")

#### Observed structure variations (live site 2026-04-16)

- Tree depth varies: Math has 3 layers, PE is mostly flat, Science is empty
- Grading scales differ: Computer Science uses PS/FL, all others use M/P/B/NY
- "Completes activities" standard with "Cycle 1-4 Learning Habits" sub appears in every class (school-wide behavior)
- Standards can exist with no score (defined but no assignments graded)
- Our recursive `Standard` type and adjacency-list `standards` table handle all variations

### Q20 — Unified fetch pipeline (supersedes per-source inline fetch blocks)

**All data sources implement a common `FetchSource` contract; a `FetchRunner` orchestrates them and records observability to a `fetch_runs` table.**

**What unifies:**
- Runtime contract — each source has `name`, `isApplicable(child)`, and `run(ctx)`; throws on failure.
- Orchestration — `FetchRunner.runAll(child)` iterates sources sequentially, captures `started_at / completed_at / status / duration_ms / error_message` per run.
- Observability — one `fetch_runs(id, source, child_id, ...)` table replaces the narrow `scrapes` table. Migration v4 renames `scrapes` → `fetch_runs` and adds a `source` column (existing rows default to `"teacherease"`); FK columns `scrape_id` in `grades`/`standards`/`assignments`/`raw_payloads` rename to `fetch_run_id`.

**What does NOT unify:** data schemas. TeacherEase (nested: class → standards tree → assignments with grades + trends) and homework (flat: subject + content + due) keep their own tables and queries. Each source owns its domain. The runner only reaches the shared observability layer.

**What's rejected:** dynamic plugin registration, per-source scheduling, auth abstractions. Sources are a hardcoded array for v1.

**Consequence:** `handleRefresh` shrinks from two inline fetch/parse/persist blocks to `await runner.runAll(child)`. Adding a 3rd source = adding one file under `src/lib/fetch/`.

### Q21 — Unified notification pipeline (supersedes direct `sendNotification` call sites)

**Notifications flow through a `NotifyRouter` with pluggable `NotifyChannel` modules** (OS notification + email, plus future channels).

**Shape:**
- Domain events are a discriminated union: `gradesAttention`, `newHomework`, `fetchFailed` (new — surfaces scrape failures the user doesn't otherwise see).
- Each channel has `isEnabled(event)` + `send(event)`. OS channel wraps `tauri-plugin-notification`; email channel (Phase 9) wraps SMTP.
- Router iterates channels sequentially, swallows per-channel failures, logs each delivery.
- **First real use of the `settings` table** (which has existed empty since v1): per-event-type per-channel user toggles, keyed `notify.{eventType}.{channelName} = "1" | "0"`. Each channel's `isEnabled` consults the setting.

**Integration with Q20:** `FetchContext` carries `notify: NotifyRouter`. Sources dispatch events during `run()`. Notifications move out of `handleRefresh` and into the source modules that own the domain logic.

**Non-goals:** no message queue (synchronous), no subscription registry (channels are hardcoded), no template engine (TS string concatenation per channel until a real driver exists).

### Q22 — Sidebar shell UI architecture (supersedes Q18's one-scroll layout claim)

**Replaces the single-scroll dashboard with a sidebar-shell app: five route-backed sections (Today / Classes / History / Settings / About) and a bounded Today view.**

**Q18's peace-of-mind tone, editorial aesthetic (Q16), attention-first priority, and family-wide hero remain in force.** What changes is the container: Today holds the glance+scan view (Hero + Child Tabs + Attention + Tonight's Homework) at bounded density, not an ever-growing scroll. All Classes + drilldown move to their own Classes section. History hosts past homework and `fetch_runs` observability. Settings / About become sidebar items rather than header-icon routes.

**Sections:**
| Section | Content |
|---|---|
| Today | Status Hero + Child Tabs + Attention + Tonight's Homework (bounded) |
| Classes | Full class list + per-class accordion drilldown + per-class history |
| History | Past homework entries + past scrape runs (from `fetch_runs`) + future trend views |
| Settings | Children · Notifications · Email (Phase 9) · Advanced, tab-organized |
| About | Disclaimer + version + links + View Logs |

**Desktop-native posture:**
- **Sidebar IS the navigation** — each item is a Next.js route. Persistent shell layout; the dashboard is one route among peers.
- **No OS menu bar.** Tauri's menu API has cross-platform quirks (GTK / macOS role attribution / Windows positioning) that aren't worth debugging for a 5-section app. The tray already handles Quit.
- **No keyboard shortcuts in v1.** Deferred until a user asks. Click targets are large and the sidebar is always visible — parents don't need power-user affordances.
- **Tray menu** (existing) unchanged.

**Q18 supersede scope:** only the layout claim ("one vertical scroll, no separate pages") is revised. The aesthetic direction, priority ordering, and multi-child behavior are preserved.

### Q23 — User-selectable theme profiles (supersedes Q16's palette lock only)

**Supersedes Q16's claim that the warm-editorial palette is fixed.** Users pick from a curated library of theme profiles, each ships its own light + dark variants; the running app resolves palette × mode at runtime via CSS variables.

**What stays locked (Q16 still holds):**
- **Typography** — Newsreader (headings) + DM Sans (body). Profile selection does not change the font stack. Keeps the brand coherent across themes and avoids per-profile web-font loads.
- **Layout + density** — sidebar shell (Q22), card-based surface, status-dot semantics, accordion drilldown, progress-bar component, all chrome proportions.
- **Semantic colors** — `meeting` (green), `attention` (amber), `not-assessed` (gray) are grade-state *meaning*, not theme style. Profiles may shift the hue/saturation slightly to fit palette harmony, but the meaning-to-color mapping is invariant. Red stays "something wrong," green stays "good," amber stays "caution."

**What becomes theme-driven:**
- **Chrome neutrals** — background / card / popover / border / muted / input surfaces.
- **Primary + accent tokens** — the teal-ish "progress" accent becomes profile-dependent.
- **Foreground colors** — tied to the profile's contrast strategy.

**Profile library (v1):**
| Profile | Character | Mode coverage |
|---|---|---|
| Default (soft) | Softened warm off-white + warm slate — Q16's original direction, palette refined to feel less clinical than the current pure-white / pure-black extremes | Light + Dark |
| Solarized | Classic warm ochre + cyan; timeless and readable | Light + Dark |
| Nord | Cool blue-gray, modern, calm | Light + Dark |
| Dracula | Dark-first purple/pink identity; Light variant is a muted derivation | Dark-primary, Light-derived |
| High contrast | Near-pure black/white, maximal contrast for a11y | Light + Dark |

New profiles can be added in future walkthrough findings without needing another superseding Q — the selection mechanism is the decision; individual profiles are content.

**Storage:**
- `appearance.profile` — the selected profile name (default `"default"`).
- `appearance.theme` — mode toggle within the profile (`light` / `dark` / `system`), unchanged from A1.

**Implementation shape:**
- Each profile = a set of CSS variable overrides under a `.theme-<name>` class on `<html>`, scoped alongside the `.dark` class for mode. Dark-variant variables live inside `.theme-<name>.dark`.
- `globals.css:5` `@custom-variant dark` still drives mode; profile is an orthogonal axis.
- Theme provider (A1's `src/components/theme/theme-provider.tsx`) adds the class manipulation for `.theme-<name>` alongside its existing `.dark` toggle.

**Rejected:**
- Per-profile font stacks (scope creep; per above, hurts brand coherence + perf).
- User-authored themes (YAGNI for v1; can be a future phase).
- Monokai / syntax-highlighting-derived themes — not a fit for a parent-facing app; removed from the shortlist during planning.

### Q24 — UI save-pattern rule

**When a setting or form should save instantly vs. require an explicit Save button vs. commit on Enter.** Consistent interaction patterns across the app so users never ask "did that save?".

| UI element | Pattern | Why |
|---|---|---|
| Switch / toggle | **Instant** | Binary, reversible, zero friction. |
| Segmented control / radio group / single-choice dropdown | **Instant** | Single-choice, no intermediate invalid state. |
| Single text / number input | **Enter or blur** | Intermediate typing isn't a valid value; commit only when the user has clearly finished. |
| Multi-field form (SMTP config, add-child form, etc.) | **Save button** | Fields validate as a group; partial save is nonsense. Typically disable Save until required fields pass validation. |
| Destructive action (delete, clear history) | **Button + confirmation** | Explicit `window.confirm` or dialog. Never instant. |
| Expensive side-effect (hits network, file I/O, long compute) | **Save button** | Don't fire a scrape / upload / SMTP send on every keystroke. |

**Existing code this rule applies to (already consistent with the rule):**
- Settings → Notifications + Advanced toggles → Instant (correct).
- Settings → Appearance profile / mode / size presets → Instant (correct).
- Settings → Email SMTP fields → Save button (correct — multi-field with validation).
- Settings → Children add form + Homework URL edit → Save button (correct — multi-field or expensive-side-effect).
- Settings → Advanced Clear history → Button + `window.confirm` (correct).

**Applies going forward to:**
- Custom font-size numeric input (Enter or blur — single field, intermediate typing not valid).
- Any future single-line search or quick-add boxes (Enter).
- Any future multi-field config panels (Save button, validate on submit).

**Rejected:** universal auto-save-on-blur even for multi-field forms (partial state can invalidate the whole form — e.g., SMTP with wrong port but valid host should not trigger a save attempt).

---

### Q25 — Unified attention engine (supersedes Q18's claims that class-level `needs_attention` mirrors TeacherEase's portal `status` column and that the Attention section's "This week vs older" cutoff is a fixed 7 days)

**Problem.** Q18 left two attention-related logics living side-by-side with no explicit contract: the Classes list uses TeacherEase's own `status` (needs_attention / meeting / not_assessed), while the Today-tab Attention section independently harvests all missing items + low scores. A class can therefore show green on the Classes tab while its assignments light up the Attention section. Parents can't tell which signal to trust. Walkthrough surfaced the confusion: "seems like two different logics of needs_attention."

**Decision.** Attention becomes a first-class signal owned by this app, computed bottom-up from assignments, propagated through standards to classes, and used consistently across every surface (Hero / ChildTabs / Attention section / Classes list / Standards tree). TeacherEase continues to own the "meeting" dimension — its M / P / B / PS rollup scores at standard and class level keep rendering exactly as they do today. The two signals are orthogonal: a standard can read `M` from TeacherEase and `!` from us simultaneously, and that's expected, not a bug.

**Rule for a single assignment:** attention-worthy if it's flagged `Missing` OR its numeric grade is below the configurable low-score threshold.

**Propagation:**
- Leaf standard: `!` if any of its assignments (not yet aged out) is attention-worthy.
- Parent standard: `!` if any child standard has `!`.
- Class: our `needs_attention` if any standard has `!`.
- Child / family hero: driven off our computed class status, not the portal's.

A `✓` appears only when *every* assignment in the subtree is clean (or aged out). TeacherEase's M / P / B / PS letter continues to display next to our marker — same row, two independent glyphs.

**Time-based decay.** Attention isn't forever. Every attention-worthy item has an age = days since its due date (or scrape date if no due date). Once age > configured forgiveness window:
- It's no longer attention-worthy (so its standard / class may upgrade back to `✓`).
- On the Today tab's Attention section, it's pushed into the "Older" collapsed group instead of being surfaced under "This week."

The "This week vs older" split in the existing UI becomes "Within the window vs aged out." Default forgiveness window is **2 weeks**; configurable per user.

**Two user-editable thresholds** (both govern how aggressive the attention engine is; live together under a new Settings sub-tab):

| Setting | Default | Meaning |
|---|---|---|
| `attention.forgivenessWeeks` | `2` | Missing / low-score items older than this no longer count as attention-worthy. |
| `attention.lowScoreThreshold` | `3.0` | Numeric grades strictly below this value count as low-score. TeacherEase's rubric caps at `M=3`, so `3.0` means "flag anything below Meeting." Lowering (e.g., to `2.0`) relaxes the alert to only flag clearly-below-progressing. |

**Settings UI location.** New sub-tab: **Settings → Attention** (sibling of Children / Appearance / Notifications / Email / Advanced). Tab order: Children / Appearance / Attention / Notifications / Email / Advanced — puts it between "how it looks" (Appearance) and "what it tells me" (Notifications), which matches its role of shaping what gets surfaced.

**What stays locked from Q18:**
- Dashboard layer structure (Hero, ChildTabs, Recent Activity, Attention section, Classes list) — unchanged.
- Per-standard and per-class M / P / B / PS rollup display — unchanged (that's TeacherEase's rubric; we don't touch it).
- Visual treatment of attention rows (amber tint, clock icon, score badge) — unchanged; the new engine just decides which rows qualify.
- Per-child / family-level verdicts on the Status Hero — unchanged in look, now driven by our computed class attention instead of the portal's status column.

**What this does not attempt (explicitly deferred):**
- Per-child or per-class thresholds. Single global threshold for v1.
- Custom per-item "snooze" or "remind me in X days." Out of scope.
- Notification pipeline changes — the existing Q21 NotifyRouter continues to use its own event triggers. Whether to align `gradesAttention` notifications to the new engine's output is a separate follow-up (not promoted yet).

**Why:** Without this unification, the app has two contradictory definitions of "needs attention" visible at the same time — parents don't know which to trust, and the Classes-tab red / green is dictated by a black-box TeacherEase calculation they can't tune. With it, attention becomes a predictable, transparent, parent-tunable signal; TeacherEase stays the source of truth for the official "meeting" rubric, which is what it actually is.

**Promoted to:** Phase 15 in `docs/progress.md` (AT1 – AT6).

---

### Q26 — Unified page-chrome pattern (supersedes Q18's claim that ChildTabs lives in the page body as a segmented control, and extends Q22's sidebar-shell architecture with a locked per-route header pattern)

**Problem.** Q22 set up the five-route shell but left each route to invent its own chrome. The Dashboard has a bespoke `Header` (logo + refresh); Classes / History / Settings / About have plain `<h1>` tags with no affordances; Settings renders its sub-tab nav inline with body content; ChildTabs is a segmented pill rendered mid-page on Dashboard + Classes. When a page overflows, nothing pins — the user loses their anchor. Parents need consistent, always-visible controls: which page am I on, who am I looking at, what can I do here? The current mix answers that question differently on every route.

**Decision.**

1. **Every route uses a unified sticky page-header.** One React component (`PageHeader`) rendered by every top-level route. Stays `sticky top-0` within the right-hand scroll column. Contains:
   - **Route title** on the left — "Today" / "Classes" / "History" / "Settings" / "About"
   - **Page actions** slot on the right — route-specific (Refresh on Today; empty on others)
   - **Sub-tab nav** row below the title — optional; only Settings uses it today
   - The title row + optional sub-tab row form **one cohesive sticky block**. Scroll happens below this block, never underneath it.

2. **ChildTabs leaves the page body.** It's a *context selector*, not navigation. Moves to the **sidebar middle**, styled as a radio-group list (not a segmented control). When exactly one child exists, the child selector (and its separator) renders nothing — no vestigial UI. Rationale: navigation (where in the app) and context (whose data) are orthogonal axes; sidebar owns both, content area shows the current route × current child intersection. Removes the "moving sub-tab inside page body" artifact.

3. **Sidebar reorganization.** The nav list splits into two groups with the child selector sandwiched between them:
   ```
   T Companion           (top)
   
   · Today               ┐
   · Classes             │  primary nav (per-child views)
   · History             ┘
   ───────────────
   Viewing child:
   ● Alex                   child radio-group (hidden if 1 child)
   ○ Sam
   ───────────────
   · Settings            ┐  utility nav (app-level, child-independent)
   · About               ┘
   ```
   Settings + About move to the bottom because they're app-level (not per-child); Today / Classes / History are per-child and sit above the context selector they depend on. The separators visually tie each group to its neighbor's relevance.

4. **The right-hand content column is the only scroll container.** Sidebar + page header (incl. sub-tabs) stay pinned. Only content below the header scrolls. B-06 landed the shell wiring for this; Q26 locks it as the intended model.

**What stays locked.**
- **Q22's sidebar-shell architecture** — five route-backed sections. Unchanged.
- **Q18's dashboard content priority** — Hero → Attention → Recent Activity → Homework → Classes link. Order and priority unchanged; everything lives below the unified sticky header.
- **Q23 / Q16 typography + palette** — unchanged.

**What this supersedes.**
- **Q18's "ChildTabs as in-body segmented control" claim** — ChildTabs moves to the sidebar as a radio-group context selector.
- **Implicit per-route freedom to invent chrome** — every route conforms to `PageHeader`.

**Open sub-decisions (resolved during Phase 16).**
- Sub-tab nav inline with the title row vs below — **below the title, inside the sticky block** (same sticky chunk; title + sub-tabs visually tied).
- App branding location — **sidebar top only**; don't duplicate in the page header.
- UpdateBanner — **above page header**, scrolls away when header pins (it's transient).

**Promoted to:** Phase 16 in `docs/progress.md` (L1 – L4).

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

Rationale: Q8 (original), Q17 (v2 normalization).

v1 schema shipped with initial build. v2 migration adds `classes` + `standards` tables, enhances `grades` and `assignments`. See Q17 for full rationale.

```sql
-- Unchanged from v1
CREATE TABLE children ( ... );    -- see Q8
CREATE TABLE settings ( ... );    -- see Q13
CREATE TABLE scrapes ( ... );     -- timeline, one row per scrape run
CREATE TABLE raw_payloads ( ... );-- full JSON tree for drilldown

-- NEW in v2: class metadata, upserted each scrape
CREATE TABLE classes (
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

-- CHANGED in v2: FK to classes, progress numbers, drop current_grade
CREATE TABLE grades (
  id                  INTEGER PRIMARY KEY,
  scrape_id           INTEGER NOT NULL REFERENCES scrapes(id) ON DELETE CASCADE,
  class_id            INTEGER NOT NULL REFERENCES classes(id),
  status              TEXT,
  needs_attention     INTEGER NOT NULL DEFAULT 0,
  targets_meeting     INTEGER,
  targets_not_meeting INTEGER,
  targets_not_assessed INTEGER
);

-- NEW in v2: standard scores per scrape, self-referential tree
CREATE TABLE standards (
  id              INTEGER PRIMARY KEY,
  scrape_id       INTEGER NOT NULL REFERENCES scrapes(id) ON DELETE CASCADE,
  class_id        INTEGER NOT NULL REFERENCES classes(id),
  parent_id       INTEGER REFERENCES standards(id),
  name            TEXT NOT NULL,
  score_numeric   REAL,
  score_letter    TEXT,
  is_meeting      INTEGER
);

-- CHANGED in v2: FK to classes, add weight + score breakdown + dedup key
CREATE TABLE assignments (
  id                INTEGER PRIMARY KEY,
  scrape_id         INTEGER NOT NULL REFERENCES scrapes(id) ON DELETE CASCADE,
  class_id          INTEGER NOT NULL REFERENCES classes(id),
  te_assignment_id  INTEGER,
  name              TEXT NOT NULL,
  score             TEXT,
  score_numeric     REAL,
  score_letter      TEXT,
  weight            INTEGER,
  is_missing        INTEGER NOT NULL DEFAULT 0,
  due_date          TEXT,
  feedback          TEXT
);

CREATE INDEX idx_scrapes_child_run ON scrapes(child_id, run_at DESC);
CREATE INDEX idx_classes_child ON classes(child_id);
CREATE INDEX idx_grades_scrape ON grades(scrape_id);
CREATE INDEX idx_standards_scrape ON standards(scrape_id);
CREATE INDEX idx_standards_class ON standards(class_id, scrape_id);
CREATE INDEX idx_assignments_scrape ON assignments(scrape_id);
CREATE INDEX idx_assignments_class ON assignments(class_id, scrape_id);
```

---

## Project Structure

**One rule: everything that ships lives under `src/`.** `src-tauri/` is the sole exception — required by Tauri's build system (separate compiler, separate runtime). `tests/` holds non-shipped test infrastructure (fixtures, integration tests). Everything else at the root is config.

```
teacherease-parent-companion/
├── CLAUDE.md
├── README.md
├── package.json
├── pnpm-lock.yaml
├── biome.json
├── tsconfig.json
├── vitest.config.ts
├── next.config.mjs              # Next.js static export
├── src/                         # Everything that ships (TS/React)
│   ├── app/                     # Next.js App Router pages
│   │   ├── layout.tsx
│   │   ├── page.tsx             # Dashboard
│   │   ├── setup/               # First-run wizard (Phase 4)
│   │   └── settings/            # Settings pages (Phase 6)
│   ├── components/              # React components (props in, callbacks out)
│   ├── hooks/                   # React hooks (call ipc, manage state)
│   └── lib/
│       ├── ipc.ts               # Tauri bridge — ONLY file with @tauri-apps/*
│       ├── scraper/             # Pure TS: HTTP + parsing + types (Q11)
│       │   ├── types.ts         # ALL data types (producer defines the shapes)
│       │   ├── teacherease.ts   # Login + session management
│       │   ├── parser.ts        # HTML/JSON → typed data
│       │   ├── cookie-jar.ts    # Set-Cookie parser
│       │   ├── cookie-jar.test.ts   # colocated tests
│       │   ├── parser.test.ts
│       │   └── teacherease.test.ts
│       └── core/                # Pure TS: business logic (diff, attention, trends)
│           └── index.ts
├── src-tauri/                   # Rust shell (fixed by Tauri, separate program)
│   ├── Cargo.toml
│   ├── Cargo.lock
│   ├── tauri.conf.json
│   ├── rust-toolchain.toml
│   ├── build.rs
│   ├── capabilities/
│   │   └── default.json
│   └── src/
│       ├── main.rs              # Tauri entry point
│       ├── lib.rs               # Plugin wiring, command registration
│       ├── keychain.rs          # #[tauri::command] keychain handlers
│       └── migrations.rs        # SQLite schema migrations
├── tests/                       # Non-shipped test infrastructure
│   ├── smoke.test.ts
│   ├── fixtures/                # Scrubbed HTML fixtures for offline parser tests
│   │   ├── README.md
│   │   ├── login-page.html
│   │   ├── grades-page.html
│   │   ├── classes/             # Per-class detail pages
│   │   └── expected/            # Reference parser output
│   └── integration/             # e2e tests (sandbox-loaded, gated)
├── docs/
│   ├── design-plan.md           # this file
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
- `src/lib/scraper/` — `fetch` + `cheerio` + types, per Q11. The producer of all data shapes.
- `src/lib/core/` — pure business logic (diff algorithms, "needs attention" rules, trend computations, grade formatting). No Tauri, no SQLite, no keychain, no `process.env`.
- `src/components/` — React components that receive data as props and emit callbacks. No direct Tauri imports.

**Platform integration** (non-portable — rewritten when platform changes):
- `src-tauri/src/` — Rust shell, Tauri commands, plugin wiring.
- `src/lib/ipc.ts` — the single TS file allowed to import from `@tauri-apps/*`. A future web version replaces this file with `src/lib/api.ts` (REST client) and every React component keeps working.
- `next.config.mjs` — static-export config specific to Tauri bundling.

**Rules enforcing this** (cheap to follow, expensive to retrofit):
1. `src/lib/scraper/` never imports from `@tauri-apps/*` or `src/lib/ipc.ts`. Pure module. (Q11 locks this; Biome `noRestrictedImports` enforces it.)
2. `src/lib/core/` never imports from `@tauri-apps/*`, `src/lib/ipc.ts`, SQLite, or keychain. Pure functions only.
3. React components (`src/app/`, `src/components/`) import from `src/lib/ipc.ts`, **never** from `@tauri-apps/*` directly. Biome blocks the direct imports.
4. Business logic never lives in React components or Rust code — it lives in `src/lib/core/` so both platforms can reuse it.

**What we explicitly do NOT do upfront:**
- No ports/adapters hexagonal architecture. Designing interfaces against one implementation produces the wrong interfaces.
- No local Hono/Express server inside Tauri. It would force shipping a Node runtime (contradicts Q6's installer-size win) and it's cosplay rather than a real backend — a real backend has auth, multi-user isolation, cron, deploy pipeline, none of which a local in-process server provides.
- No premature `packages/` workspace extraction. The project has one consumer today; Turborepo pays for itself when there are real sibling apps (homecal-style), not before.

**Migration shape if SaaS ever happens:**
```
src/lib/scraper/      →  packages/core/scraper/
src/lib/core/         →  packages/core/business/
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
Status history dots, clickable class rows with accordion drilldowns, standards tree. UX spec: Q16.

### Phase 8 — Homework scraping (Google Sites)
Public Google Sites homework page. Optional per-child. Plain `fetch` + cheerio. Spec: Q19.

### Phase 9 — Platform refactor (backend foundation)
Unified fetch pipeline (Q20) + unified notify pipeline (Q21) + homework date normalization. `handleRefresh` becomes `runner.runAll(child)`. `scrapes` table renamed to `fetch_runs` with a `source` column. Notifications flow through a router. No user-visible UI change.

### Phase 10 — Desktop shell (UI architecture)
Sidebar-shell app per Q22: Today / Classes / History / Settings / About as route-backed sections. Window-state persistence. Supersedes Q18's one-scroll layout while preserving its aesthetic and priority principles.

### Phase 11 — Email reports (Phase 9's original scope, reshaped onto Q21)
BYO SMTP as a second `NotifyChannel` plugging into the Phase 9 router. Settings → Email tab, per-event toggles, HTML + plaintext templates, Gmail App Password tutorial. Q4 realized.

### Phase 12 — Release pipeline
`tauri-plugin-updater` wired up, GitHub Actions building per-OS installers, signed update payloads, first v0.1.0 release.

### Phase 13 — First-launch warning docs
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
