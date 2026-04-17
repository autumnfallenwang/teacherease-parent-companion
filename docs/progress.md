# TeacherEase Parent Companion — Progress

## Phase 0: Scaffolding

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Repo + planning docs | ✅ Done | GitHub repo, MIT license, .gitignore, CLAUDE.md, design-plan.md (merged with locked decisions), .claude/ scaffold |
| 2 | pnpm workspace + package.json | ✅ Done | Root package.json, Biome 2.4 + Vitest 4 + TS 5.9 + Next 15 + Tauri CLI 2 |
| 3 | Next.js static-export setup | ✅ Done | `src/app/{layout,page}.tsx`, `next.config.mjs` with `output: "export"`, static build to `out/` verified |
| 4 | Tauri 2 shell init | ✅ Done | `src-tauri/` scaffolded via `tauri init`, bundle id `dev.autumnfallenwang.teacherease-parent-companion`, `rust-toolchain.toml` pins stable, clippy+fmt+test green |
| 5 | Cross-platform CI | ✅ Done | `.github/workflows/ci.yml` with ts/rust jobs + Windows/macOS/Linux build matrix, bundle artifact upload |
| 6 | Biome + Vitest + tsc wiring | ✅ Done | `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm check` all green; Rust side via `cargo fmt --check` + `cargo clippy -D warnings` + `cargo test` |

## Phase 1: Core scraper

| # | Task | Status | Notes |
|---|------|--------|-------|
| 7 | HTML fixtures from ref repo | ✅ Done | 7 HTML + `expected/full-data.json` scrubbed (sandbox/scrub-fixtures.ts) and landed in `tests/fixtures/`; PII verified clean via independent grep; `tests/fixtures/README.md` documents dummy values and re-scrub workflow |
| 8 | TeacherEase login (fetch + cookie jar) | ✅ Done | `scraper/cookie-jar.ts` (manual Map-backed jar, 11 unit tests) + `scraper/teacherease.ts` with `login()`, `extractLoginFormFields()`, `buildLoginFormBody()` (14 unit tests); uses `tests/fixtures/login-page.html` captured via sandbox POC; NOT classic WebForms — regular HTML form with 5 hidden fields, credential fields `email`/`password`, POST target `/app/Login/Login` (different from GET `/common/login.aspx`); no `__VIEWSTATE` needed for login (grade pages may still be WebForms — to verify in T9) |
| 9 | Grade overview parser | ✅ Done | `scraper/parser.ts` with `extractClassesJson()` + `parseGradesOverview()` (12 tests). Not cheerio — data is embedded JSON extracted via regex + `JSON.parse`. Fixture mismatch with `full_data.json` discovered and documented (different scrapes). Two new instructors scrubbed (Zides, Lee). |
| 10 | Class detail parser (cheerio) | ✅ Done | `parseClassDetails()` in `scraper/parser.ts` (18 tests). Cheerio-based recursive parser: `ul.root-standard-item` → nested standards → `table.assignmentTable` rows. Missing detection via `data-bmissing="1"`, `style="color:red"`, `img[title="Missing"]`. Confirmed fixture ≠ `full-data.json` for ALL 3 detail classes (different scrape sessions); tests assert against manually verified fixture values. |
| 11a | Real-fixture parser tests | ✅ Done | `tests/integration/scraper-real-fixtures.integration.test.ts` — loads unscrubbed HTML from `sandbox/captures/`. 11 pass, 2 skip (old class names not in current schedule). Parsers verified against live unscrubbed HTML. |
| 11b | Live e2e scraper test | ✅ Done | `tests/integration/scraper-live.integration.test.ts` — full login → grades fetch → parse against real TeacherEase. 3/3 pass with `TEACHEREASE_LIVE=1`. Credentials from ref repo's `.env` → `sandbox/.env`. Authenticated capture script at `sandbox/capture-authenticated-pages.ts` fetches overview + all 8 class detail pages. |

## Phase 2: Local persistence

| # | Task | Status | Notes |
|---|------|--------|-------|
| 12 | SQLite schema + migrations | ✅ Done | `tauri-plugin-sql` with `sqlite` feature wired in Rust; migration v1 creates 6 tables (children, settings, scrapes, raw_payloads, grades, assignments) + 3 indexes; plugin registered in `lib.rs`, `sql:default` permission added; JS bindings installed (`@tauri-apps/plugin-sql`). Schema matches design-plan Q8/Q13. |
| 13 | Child CRUD (Rust + TS) | ✅ Done | 3 Rust `#[tauri::command]` keychain handlers (`keychain_set/get/delete`) via `keyring` crate; `src/lib/ipc.ts` with `addChild()`, `removeChild()`, `getChildren()`, `getChild()`, `updateChildPassword()`, `getChildPassword()` — DB + keychain orchestration with rollback on keychain failure (Q3 atomicity in TS layer). |
| 14 | Scrape persistence | ✅ Done | `persistScrape()` in `src/lib/ipc.ts` — inserts into scrapes, raw_payloads, grades, assignments; recursive standard→assignment flattening; maps scraper types to DB rows |
| 15 | Read queries for UI | ✅ Done | `getLatestScrape()`, `getGradesForScrape()`, `getAssignmentsForScrape()`, `getNeedsAttentionGrades()`, `getMissingAssignments()` in `src/lib/ipc.ts` |

## Phase 2b: Codebase reorganization

| # | Task | Status | Notes |
|---|------|--------|-------|
| 15b | Move `scraper/` → `src/lib/scraper/` | ✅ Done | All shipped code now under `src/`. Updated imports in `ipc.ts`, 4 test files, `vitest.config.ts`. Design-plan Project Structure + Forward Compatibility + CLAUDE.md Structure all updated. Zero logic changes. |

## Phase 3: Dashboard UI (core)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 16 | Layout + header + empty state | ✅ Done | Tailwind 4 + shadcn/ui bootstrapped. Layout with globals.css + theme vars. `Header` component (title + Refresh button + timestamp). `EmptyState` component (CTA to add child). Dashboard page wired with `"use client"`. `next build` produces static export. |
| 17 | Current-grades view | ✅ Done | `GradesTable` component with color-coded status badges (Meeting/Needs Attention/Not Assessed). shadcn Table + Badge. |
| 18 | Needs-attention section | ✅ Done | `NeedsAttention` component showing missing assignments list with class name + due date. shadcn Card. |
| 19 | Refresh-now wiring | ✅ Done | Full pipeline wired and verified in `tauri dev`. Dashboard component loaded via `next/dynamic` with `ssr: false` (Tauri APIs can't run during SSR). Linux workarounds baked into `pnpm tauri:dev` script (`WEBKIT_DISABLE_DMABUF_RENDERER=1 GDK_BACKEND=x11`). Empty-state dashboard renders in the Tauri webview. |

## Phase 4: First-run wizard

| # | Task | Status | Notes |
|---|------|--------|-------|
| 20 | Welcome screen | ✅ Done | `WizardWelcome` — one sentence + "Get started" + "Skip setup" link |
| 21 | Add-child screen + live login validation | ✅ Done | `WizardAddChild` — form with name/email/password, calls `login()` on submit, refuses to advance unless login succeeds, stores child via `addChild()` on success |
| 22 | Notification permission pre-prompt | ✅ Done (stub) | `WizardNotifications` — UI complete, OS permission request deferred to Phase 5 (`tauri-plugin-notification` not yet wired) |
| 23 | Inline first scrape + summary | ✅ Done | `WizardDone` — runs full scrape pipeline inline, shows "X classes — Y meeting, Z need attention" summary, error handling with "Open dashboard" fallback |
| 24 | Skip + resume-later flows | ✅ Done | Skip link on every screen + wizard header. Empty-state dashboard CTA links to `/setup`. `next/dynamic` with `ssr: false` on `/setup` page. |

## Phase 5: Scheduler + notifications + tray

| # | Task | Status | Notes |
|---|------|--------|-------|
| 25 | Tray icon + menu | ✅ Done | Rust `TrayIconBuilder` with Open/Refresh/Quit menu. Left-click opens window. "Refresh" emits `tray-refresh` event to webview. `tray-icon` feature enabled. |
| 26 | Internal scrape timer | ✅ Done (MVP) | Dashboard checks last scrape age on mount — if >6h, auto-refreshes. Background scrape while window closed deferred to v1.1 (needs hidden webview per Q11). |
| 27 | OS notifications on "needs attention" | ✅ Done | `tauri-plugin-notification` wired. `notifyNeedsAttention()` in ipc.ts sends OS notification after scrape if attention grades or missing assignments found. |
| 28 | Autostart registration | ✅ Done | `tauri-plugin-autostart` wired. `setupAutostart()` called on dashboard mount. Default: enabled. |
| 29 | Battery settings | Deferred | Requires OS power-status API not provided by Tauri. Q2 says "off by default" — defer to v1.1 when a real user asks. |

## Phase 6: Multi-child support

| # | Task | Status | Notes |
|---|------|--------|-------|
| 30 | Child switcher in header | ✅ Done | `ChildSwitcher` dropdown in header, hidden when ≤1 child. Dashboard loads all children on mount, switching clears grades and re-fetches. |
| 31 | Settings → Children CRUD page | ✅ Done | `/settings` page with child list (name + email), trash-to-remove, "+ Add another child" form with live login validation. Back arrow to dashboard. |

## Phase 6b: Logging + Legal

| # | Task | Status | Notes |
|---|------|--------|-------|
| L1 | Configure `tauri-plugin-log` properly | ✅ Done | File (LogDir, rotation 2MB) + Stdout (dev only) + Webview targets. DEBUG in dev, INFO in release. Logs app version, data dir, log dir on startup. |
| L2 | Add TS logging to scraper + IPC | ✅ Done | `log()`, `logWarning()`, `logErr()`, `initLogging()` wrappers in ipc.ts. Dashboard logs child count on load, errors on scrape failure. `@tauri-apps/plugin-log` added to biome restricted imports. |
| L3 | "View logs" in Settings → About | ✅ Done | `open_log_dir` Rust command via `open` crate → `openLogDir()` in ipc.ts → "View logs" button on About page. Opens OS file manager at log directory. |
| L4 | Document logging rules | ✅ Done | Q14 in design-plan, CLAUDE.md security constraint, progress tasks. |
| L5 | Legal disclaimer — single source of truth | ✅ Done | `src/lib/legal.ts` → wizard, /about, Settings, DISCLAIMER.md, README. Q15 locked. |

## Phase 7: Dashboard UI (full)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 32 | Dashboard UX design (separate question) | ✅ Done | Q16 locked in design-plan.md: status history dots (T33), accordion drilldown with standards tree (T34), new IPC queries, 4 new components. No chart library. |
| 33 | Grade trend charts | ✅ Done | `StatusDots` component (5 colored circles per class, ink-stamp style), `TrendArrow` (↑↓), `computeTrend()` pure function (10 tests), `getAllStatusHistory()` IPC query (window function, N+1-free), clickable class rows with chevron + accordion slot. Vitest `@/` alias added. |
| 34 | Assignment drilldown | ✅ Done | `StandardsTree` recursive component (standard headers with meeting/not-meeting icons, nested assignments, missing in amber). `getClassDetail()` IPC query from `raw_payloads` JSON. Detail cache in dashboard, cleared on refresh/child switch. Accordion panel with `bg-secondary/40` background. Graceful empty state for meeting classes. |

## Phase 7b: Data model v2 (Q17)

| # | Task | Status | Notes |
|---|------|--------|-------|
| D1 | v2 migration script | ✅ Done | Migration v2 in `migrations.rs`: `classes` + `standards` tables, ALTER `grades` + `assignments` with new columns + indexes. |
| D2 | Scraper: fetch all detail pages | ✅ Done | Removed `.filter(c => c.needsAttention)` in dashboard.tsx + wizard-done.tsx. All 8 classes fetched. |
| D3 | Parser: extract TestNameID | ✅ Done | `testNameId` added to `Assignment` type. Extracted from `data-testnameid` attr on `<tr>`, fallback to href URL. Fixed `tablesaw-cell-content` span fallback (live pages don't have it). |
| D4 | Persistence: rewrite `persistScrape()` | ✅ Done | `upsertClasses()` + `persistStandards()` (recursive) + `persistAssignmentsDeduplicated()` (dedup by testNameId). Writes both v1 legacy columns + v2 new columns. |
| D5 | Read queries: update to use class_id FK | ✅ Done | `GradeRecord` + `AssignmentRecord` types expanded. `mapGradeRow()` / `mapAssignmentRow()` helpers. `getMissingAssignments()` queries both `is_missing=1` and `status='missing'` for compat. |
| D6 | Seed script: update for v2 schema | Not started | Generate proper classes, standards, assignments with new columns. |
| D7 | E2E validation with real credentials | ✅ Done | `tests/integration/v2-persistence-live.integration.test.ts` — login → fetch all 8 detail pages → persist to v2 DB → 12 assertions passed. Plus `sandbox/poc-v2-persistence.ts` (11 checks). Foundation validated. |
| D8 | Dashboard UX v2 design | ✅ Done | Q18 locked: Status Hero + Recent Activity (24h time-based) + Missing Work (grouped by urgency) + All Classes with progress bars + accordion detail. No toggles — sort order separates attention from meeting. |

## Phase 7c: Dashboard UX v2 implementation (Q18)

| # | Task | Status | Notes |
|---|------|--------|-------|
| U1 | StatusHero component (family-wide) | ✅ Done | Shows ALL children's verdicts in one card. Per-child row with green/amber tint. Tappable to select child. |
| U2 | ChildTabs component | ✅ Done | Tab bar below hero, replaces header dropdown. Hidden if 1 child. Amber dot for attention children. |
| U3 | ProgressBar component | ✅ Done | Thin 4px bar with teal/amber segments. Label "5/20". |
| U4 | GradesTable: progress bars + instructor + sort | ✅ Done | ProgressBar + instructor per row. Sorted by urgency via `sortClassesByUrgency()`. |
| U5 | RecentActivity component + core logic | ✅ Done | `computeRecentActivity()` in `core/activity.ts` (12 tests) diffs current vs prior-scrape grades + assignments → improved/declined/newScores/agingMissing. `getScrapeBefore(childId, isoDate)` IPC query loads nearest prior successful scrape. `RecentActivity` component renders icon+text rows with "Show N more" overflow. Wired into dashboard between ChildTabs and AttentionSection. |
| U6 | AttentionSection: missing + low scores | ✅ Done | `AttentionSection` replaces `MissingWork`. Shows missing (urgency groups) + low scores (below M/3.0, sorted worst first). `getLowScoreAssignments()` in `core/attention.ts` (5 tests). Dashboard passes all assignments for filtering. |
| U7 | Dashboard wiring | ✅ Done | StatusHero + ChildTabs wired. Auto-selects attention child on load. Hero loads all children's grades. Header simplified (no children slot). `getClasses()` IPC query for instructor map. |
| U8 | StandardsTree: full detail for all classes | ✅ Done | Empty state updated to "No standards data available." |
| U9 | Seed script: v2 schema + time-varying data | ✅ Done | `evolveAssignment()` varies data over 7 days: missing work resolves on day -1 (→ 2=P), meeting scores start low early on (2.5=P → 3=M). Status transitions + score evolution verified in DB. |

## Phase 8: Homework scraping (Google Sites)

| # | Task | Status | Notes |
|---|------|--------|-------|
| H1 | Homework parser | ✅ Done | `src/lib/scraper/homework-parser.ts` — pure cheerio parser (13 tests). `parseHomework(html, { subjects? })` returns `HomeworkEntry[]`. Handles Google Sites concatenated-text format: entry anchor regex, position-based subject scan against known-subjects list, end-anchored `Due:` marker to avoid matching lowercase `due` in content. Types in `types.ts`. Default subject list: Science/World Geography/English/Math. Developed against real `ref/` capture (137 entries parsed cleanly). |
| H2 | Homework DB schema | ✅ Done | Migration v3 in `migrations.rs`: `ALTER TABLE children ADD COLUMN homework_url`, `homework` table (child_id, hw_date, subject, content, due_date, scraped_at; `UNIQUE(child_id, hw_date, subject)` for H3 upsert), `idx_homework_child_date` index. Matches Q19 locked schema. |
| H3 | Homework fetch + persist | ✅ Done | `persistHomework()` in `ipc.ts` normalizes `M/D/YY` → ISO `YYYY-MM-DD`, filters to current month per Q19, upserts via `ON CONFLICT(child_id, hw_date, subject) DO UPDATE`. `setHomeworkUrl()`, `getHomeworkForDate()`, `getRecentHomework()` helpers added. `homeworkUrl` added to `ChildRecord` + `AddChildParams`. Dashboard `handleRefresh` fetches + parses + persists when `homework_url` is set; errors logged but don't fail the grades scrape. |
| H4 | Homework URL in settings | ✅ Done | Optional `type="url"` input in `WizardAddChild` and Settings→Children `AddChildForm` (persists via `addChild({ homeworkUrl })`). New `ChildRow` component shows "Homework: not set / <url>" per child with inline Edit/Save/Cancel that calls `setHomeworkUrl()`. |
| H5 | Homework dashboard section | ✅ Done | `HomeworkCard` component renders between Attention and All Classes. Hides itself when empty. Header + date subtitle (`Wednesday · Apr 17`) + per-subject card (subject bold, content preserving line breaks, optional due-date chip). New `getLatestHomework(childId)` IPC query selects the newest `hw_date` via a subselect (uses `idx_homework_child_date`). Dashboard loads + resets homework on child switch. |
| H6 | Homework notifications | ✅ Done | `getMaxHomeworkDate()` + `notifyNewHomework()` in `ipc.ts`. Dashboard captures maxDate before/after persist in `handleRefresh`; when newest `hw_date` advances, sends OS notification with subject count for that date (`"3 subjects posted for Fri · Apr 17"`). Same-day content edits don't fire a notification. |
| H7 | POC + e2e test | ✅ Done | `sandbox/capture-homework-page.ts` POC fetches live page (1.3MB), saves to `sandbox/captures/homework-page.html`, parses → **138 entries, 135 populated**. `tests/integration/homework-live.integration.test.ts` (4/4 passing with `TEACHEREASE_LIVE=1`). `tests/integration/homework-real-fixture.integration.test.ts` (4/4 passing when fixture present, skip otherwise). `HOMEWORK_PAGE_URL` added to `sandbox/.env`. |

## Phase 9: Platform refactor (Q20 + Q21 + homework polish)

Backend foundation. No UI change — `handleRefresh` gets slimmer, the DB gains a unified observability table, notifications flow through a router. Sets up Phase 10 (UI shell) and Phase 11 (email) to be mechanical. Spec: design-plan Q20 + Q21. Sources: [fetch-pipeline-proposal.md](fetch-pipeline-proposal.md), [notify-pipeline-proposal.md](notify-pipeline-proposal.md), [homework-followups.md](homework-followups.md).

| # | Task | Status | Notes |
|---|------|--------|-------|
| P1 | Normalize `homework.due_date` to ISO | Not started | Addresses [homework-followups.md Q2](homework-followups.md). `persistHomework` anchors on `hw_date` year, emits `YYYY-MM-DD`. `HomeworkCard` reformats to weekday + short-date at render time. Low-risk warm-up for the phase. |
| P2 | Migration v4: rename `scrapes` → `fetch_runs` | Not started | Add `source TEXT NOT NULL` (existing rows default `"teacherease"`). Rename FK columns `scrape_id` → `fetch_run_id` in `grades` / `standards` / `assignments` / `raw_payloads`. Update `migrations.rs` and `seed-dev-db.ts` `SCHEMA_SQL`. TypeScript catches every rename at compile time. |
| P3 | `FetchSource` contract + `FetchRunner` | Not started | `src/lib/fetch/types.ts` (interface) + `runner.ts` (orchestrator writing to `fetch_runs`). New IPC helpers `startFetchRun` / `completeFetchRun`. Sequential execution for v1. |
| P4 | Extract TeacherEase source | Not started | `src/lib/fetch/teacherease-source.ts` — move login + overview + class-detail + `persistScrape` out of `dashboard.tsx`. `persistScrape` takes the renamed `fetch_run_id`. |
| P5 | Extract Homework source | Not started | `src/lib/fetch/homework-source.ts` — move fetch/parse/persist/notify block out of `handleRefresh`. Consumes P1's ISO dates. |
| P6 | `NotifyRouter` + `OSChannel` + event types | Not started | `src/lib/notify/types.ts` + `router.ts` + `os-channel.ts`. Port `notifyNeedsAttention` + `notifyNewHomework` into `OSChannel.send(event)` switch. Delete legacy wrapper functions. |
| P7 | Per-event notification prefs in `settings` | Not started | First real writes to the `settings` table. `notify.{eventType}.{channelName}` keys; `getSettingBool(key, default)` helper. Channels consult the table via `isEnabled(event)`. |
| P8 | Wire notify into the runner | Not started | `FetchContext.notify: NotifyRouter`. Sources dispatch events during `run()`. Emit new `fetchFailed` event from the runner's catch block (surfaces scrape failures that today get silently logged). |

**End state of Phase 9:** `handleRefresh` is a thin `await runner.runAll(child)` call. All scrape history lives in `fetch_runs`. All notifications flow through `NotifyRouter`. Dashboard UI visually unchanged.

## Phase 10: Desktop shell (Q22)

UI architecture: sidebar-shell app with 5 route-backed sections. Resolves the "scroll forever" problem and gives every future feature a designated home. Spec: design-plan Q22 (supersedes Q18's layout claim). Source: [ui-architecture-proposal.md](ui-architecture-proposal.md).

| # | Task | Status | Notes |
|---|------|--------|-------|
| S1 | Sidebar shell + route restructure | Not started | Persistent layout component with 5 sidebar items (Today / Classes / History / Settings / About). Move existing `/settings` and `/about` into the shell. New `/classes` and `/history` routes. `lucide` icons; expanded-by-default sidebar with collapse toggle. |
| S2 | Reshape Today view | Not started | Remove `GradesTable` + accordion from the Today route. Keep Hero + Child Tabs + Attention + Tonight's Homework. Add "View all in Classes →" bridge link. Bound Today to ~one viewport at comfortable density. |
| S3 | Build Classes page | Not started | `/classes` hosts the full class list + per-class accordion drilldown + per-class history. Near-zero new code; relocates `GradesTable` + `StandardsTree`. |
| S4 | Build History page | Not started | `/history` with sub-tabs "Homework" (past days via `getRecentHomework`) + "Scrapes" (reads P2's `fetch_runs` table — columns: source, started_at, status, duration, error). Addresses [homework-followups.md Q1](homework-followups.md) (viewing previous homework). |
| S5 | Expand Settings page | Not started | `/settings` gets sub-tabs: Children (existing) · Notifications (UI for P7's `notify.*` keys) · Email (placeholder — populated in Phase 11) · Advanced (autostart toggle, clear history, export DB, updater on/off). |
| S6 | Window state persistence | Not started | `tauri-plugin-window-state` for size/position between launches. Sidebar collapsed/expanded state stored in `settings` table (`ui.sidebarCollapsed`). |
| S7 | Recent Activity revive-or-delete decision | Not started | Addresses [homework-followups.md Q3](homework-followups.md). Either revive with renamed heading ("Since last check") and drop `agingMissing`, or delete `recent-activity.tsx` + `core/activity.ts` outright. Decide once the new Today layout is settled in S2. |

**End state of Phase 10:** Desktop-native feel with sidebar navigation, bounded Today view, and designated homes for every planned future feature.

## Phase 11: Email reports

Second `NotifyChannel` (SMTP) plugs into Phase 9's router. Also fills the Email tab placeholder from S5. BYO SMTP per Q4.

| # | Task | Status | Notes |
|---|------|--------|-------|
| E1 | `EmailChannel` implementation | Not started | `src/lib/notify/email-channel.ts` — implements `NotifyChannel`. `channelAvailable()` checks SMTP settings present + keychain has `smtp-main`. Uses a minimal SMTP client (likely `nodemailer` or a lighter alternative if we can find one). |
| E2 | Event → email template system | Not started | Per-event HTML + plaintext templates (template literals, no engine). Port the existing HTML design from `ref/teacherease_parents_helper/` for grades. New template for homework. |
| E3 | Settings → Email tab | Not started | Form: host / port / user / from / to, password written to keychain as `smtp-main` (never shown back). Per-event-type email toggles (writes `notify.{eventType}.email` keys from P7). "Send test email" button. |
| E4 | Gmail App Password tutorial | Not started | Static page under `/about/gmail-app-password` or linked from the Email tab. Screenshots of the Google Account → Security → App Passwords flow. No in-app automation. |
| E5 | Live-send integration test | Not started | Gated behind `EMAIL_LIVE=1` env var reading test-SMTP creds from `sandbox/.env`. One smoke test per template. Never runs in CI. |

**End state of Phase 11:** Parent with a laptop that closes during the day can still receive a daily email summary. Q4 fully realized.

## Phase 12: Release pipeline

Shipping foundation. Once this lands, users outside this machine can install the app.

| # | Task | Status | Notes |
|---|------|--------|-------|
| R1 | Updater signing keypair + GH secrets | Not started | `tauri signer generate`. Public key baked into the app at build. Private key only in GitHub Actions secrets. Documents the rotation/loss recovery plan. |
| R2 | `tauri-plugin-updater` wiring | Not started | Check JSON feed on app launch and once per day. Non-intrusive banner in the shell's top bar (fits the new sidebar layout from Phase 10). "Later" remembers per version. Kill-switch in Advanced tab (S5). |
| R3 | GitHub Actions release workflow | Not started | Tag → build 3 OSes → sign update payloads → publish GitHub Release + `latest.json` feed. Reuses existing CI matrix. |
| R4 | First public release v0.1.0 | Not started | Tag, release, smoke-test the installer on each OS, confirm the updater path works by shipping a v0.1.1 patch end-to-end. |

## Phase 13: First-launch documentation

OS signing is deferred (Q9); documented warnings instead. Ships alongside v0.1.0.

| # | Task | Status | Notes |
|---|------|--------|-------|
| FL1 | `docs/first-launch-windows.md` | Not started | SmartScreen "Windows protected your PC" bypass walkthrough with screenshots. Reference from README + the release-notes template. |
| FL2 | `docs/first-launch-macos.md` | Not started | Gatekeeper "cannot verify developer" bypass: right-click → Open. Screenshots of both Sequoia and earlier dialogs. Note for Apple Silicon vs Intel if behavior differs. Brief mention of the Linux GNOME one-time keyring dialog (per Q3). |

---

## What's Working

- **Scraper** — login, grades overview (embedded JSON), class detail (cheerio) all tested against real fixtures and live portal.
- **Persistence** — SQLite v2 schema (children, scrapes, raw_payloads, classes, standards, grades, assignments); keychain-backed credentials; child CRUD with atomic rollback; full scrape persistence with standards tree + deduplicated assignments.
- **Dashboard UX v2 (Q18)** — StatusHero (family-wide) + ChildTabs + RecentActivity (24h diff) + AttentionSection (missing + low scores, grouped by recency) + All Classes with progress bars/instructor/status dots + one-at-a-time accordion drilldown.
- **First-run wizard** — 4 screens with live login validation, inline first scrape + summary, skippable at every step.
- **Scheduler + notifications** — tray icon with Open/Refresh/Quit; 6h internal timer on dashboard mount; OS notifications when attention items detected; autostart enabled by default.
- **Multi-child** — switcher via ChildTabs; Settings → Children CRUD page with trash-to-remove and live-validation add form.
- **Logging + legal** — `tauri-plugin-log` to file + stdout + webview (DEBUG dev / INFO release); "View logs" in Settings → About; single-source legal disclaimer.
- **CI + checks** — 3-OS build matrix (`.github/workflows/ci.yml`); `pnpm check` (Biome + tsc + Vitest) green with 106 tests passing; `cargo fmt` / `cargo clippy -D warnings` / `cargo test` all green.
- **Seed data** — v2-schema time-varying seed script (7 days of evolving assignments) for offline dashboard development.

## What's Next

**Phases 0–8 complete.** Homework feature shipped end-to-end (138 entries parsed against live data). Roadmap to v0.1.0 restructured into five coherent phases:

1. **Phase 9 — Platform refactor (P1–P8)** backend foundation: fetch + notify pipelines, homework due-date ISO polish. No UI change.
2. **Phase 10 — Desktop shell (S1–S7)** sidebar app with Today / Classes / History / Settings / About. Window-state persistence. Recent Activity decision.
3. **Phase 11 — Email reports (E1–E5)** second notify channel, Settings → Email tab, templates, Gmail tutorial.
4. **Phase 12 — Release pipeline (R1–R4)** updater signing, GH Actions, first v0.1.0 release.
5. **Phase 13 — First-launch docs (FL1–FL2)** SmartScreen + Gatekeeper walkthroughs.

**Start with P1** (homework due-date ISO normalization) — lowest-risk warm-up for Phase 9.
