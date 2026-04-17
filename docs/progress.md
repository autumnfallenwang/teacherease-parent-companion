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
| H1 | Homework parser | Not started | `homework-parser.ts` — cheerio `.text()` on `div.hJDwNd-AhqUyc-uQSCkd`, split by "Homework for", parse subjects by name + "Due:" markers. Pure function, unit tests. |
| H2 | Homework DB schema | Not started | `homework` table (child_id, hw_date, subject, content, due_date). `homework_url` column on `children` table. Migration v3. |
| H3 | Homework fetch + persist | Not started | Plain `fetch` (no auth), parse, upsert homework entries. Called from dashboard on refresh. |
| H4 | Homework URL in settings | Not started | Add homework URL field to child setup wizard + settings page. Optional — if not set, homework feature hidden. |
| H5 | Homework dashboard section | Not started | "Tonight's Homework" card showing today's assignments by subject. |
| H6 | Homework notifications | Not started | OS notification when new homework detected. |
| H7 | POC + e2e test | Not started | Sandbox POC against live Google Sites page. Integration test. |

## Phase 9: Optional email (advanced)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 35 | Settings → Advanced → Email form | Not started | SMTP host/port/user/pass, BYO only |
| 36 | Email sender + templates | Not started | Port HTML template from ref repo (grades + homework) |
| 37 | Gmail App Password tutorial | Not started | Static page with screenshots |

## Phase 10: Updater + release pipeline

| # | Task | Status | Notes |
|---|------|--------|-------|
| 38 | Updater signing keypair + GH secrets | Not started | One-time setup |
| 39 | `tauri-plugin-updater` wiring | Not started | Update banner in dashboard header |
| 40 | GitHub Actions release workflow | Not started | Tag → build 3 OSes → publish release + latest.json feed |
| 41 | First public release | Not started | v0.1.0 |

## Phase 11: First-launch warning docs

| # | Task | Status | Notes |
|---|------|--------|-------|
| 42 | `docs/first-launch.md` | Not started | Windows SmartScreen and macOS Gatekeeper bypass walkthroughs with screenshots |

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

**Phase 7c complete (U1–U9).** Dashboard redesigned with v2 data model + time-based Recent Activity. Next: H1 (homework parser) — start of Phase 8.
