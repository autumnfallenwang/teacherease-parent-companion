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
| P1 | Normalize `homework.due_date` to ISO + inferred fallback | ✅ Done | Addresses [homework-followups.md Q2](homework-followups.md). Pure `homework-date.ts` module (28 tests) with `hwDateToIso`, `dueDateToIso`, `inferDueDateIso`, `resolveDueDate`. Migration v4 adds `due_date_inferred INTEGER NOT NULL DEFAULT 0`. `persistHomework` uses `resolveDueDate` — on unparseable raw, falls back to `hw_date + 1 school day` (Sat/Sun → Mon snap). UTC date math internally, `timeZone: "UTC"` on display. `HomeworkCard` renders inferred dates italic + tilde prefix + tooltip. Seed script exercises the inferred path with one null-dueDate entry. |
| P2 | Migration v5: rename `scrapes` → `fetch_runs` | ✅ Done | Migration v5 in `migrations.rs` renames table, adds `source TEXT NOT NULL DEFAULT 'teacherease'`, renames FK columns (`scrape_id` → `fetch_run_id`) in `raw_payloads` / `grades` / `standards` / `assignments`, and recreates indexes with the new names plus `idx_fetch_runs_child_source`. TS types renamed: `ScrapeStatus` → `FetchRunStatus`, `ScrapeRecord` → `FetchRunRecord` (+ `source` field), `GradeRecord.scrapeId` / `AssignmentRecord.scrapeId` → `fetchRunId`. Functions renamed: `getLatestScrape` → `getLatestFetchRun`, `getScrapeBefore` → `getFetchRunBefore`, `getGradesForScrape` → `getGradesForFetchRun`, `getAssignmentsForScrape` → `getAssignmentsForFetchRun`. `persistScrape` / `ScrapeResult` kept as-is (TODO moves into TeacherEase source module in P4). Seed script `SCHEMA_SQL` + inserts + dashboard + wizard-done + unit test helpers all updated. 151 tests green, seed reset clean. |
| P3 | `FetchSource` contract + `FetchRunner` | ✅ Done | `src/lib/fetch/types.ts` defines `FetchSource`, `FetchContext`, `FetchRunnerDeps`, `FetchRunnerSummary`. `src/lib/fetch/runner.ts` — sequential orchestrator, per-source error isolation, injected deps for testability. `startFetchRun(childId, source)` + `completeFetchRun(id, {status, durationMs, errorMessage})` IPC helpers in `ipc.ts`. 9 runner unit tests (170 total now). `persistScrape` still writes its own row for now — P4/P5 will migrate to runner-managed rows. |
| P4 | Extract TeacherEase source | ✅ Done | `src/lib/fetch/teacherease-source.ts` implements `FetchSource`: login + grades-overview + per-class-detail + `persistTeacherEaseData`. `persistScrape` / `ScrapeResult` deleted from `ipc.ts`; replaced by `persistTeacherEaseData(fetchRunId, overview, classDetails)` which writes raw_payloads + grades + classes + standards + assignments but NEVER touches `fetch_runs` (runner owns lifecycle). `FetchRunner.runAll` now returns `runs: FetchRunnerRun[]` with per-source fetchRunId/status/duration, letting callers look up by source. Dashboard `handleRefresh` reduced from 100+ lines to a runner construction + `runAll(child)` call + homework block (P5 pending). Wizard first-scrape (`wizard-done.tsx`) uses the same runner pattern. |
| P5 | Extract Homework source | ✅ Done | `src/lib/fetch/homework-source.ts` implements `FetchSource`: fetches `child.homeworkUrl`, parses, persists, and fires `notifyNewHomework` when `getMaxHomeworkDate` advances. `isApplicable` gates on `homeworkUrl` truthy. Throws on non-200 (runner records as `failed` in `fetch_runs`). Dashboard runner now `[TeacherEaseSource, HomeworkSource]`; inline ~22-line homework block + unused imports (`parseHomework`, `USER_AGENT`, `persistHomework`, `getHomeworkForDate`, `getMaxHomeworkDate`, `notifyNewHomework`) deleted. Wizard first-scrape runner updated to match so first-run homework lands before the 6h timer fires. Homework failures log + persist to `fetch_runs` but don't surface in the UI (matches prior best-effort behavior; History page S4 will read `fetch_runs`). |
| P6 | `NotifyRouter` + `OSChannel` + event types | ✅ Done | `src/lib/notify/types.ts` (closed `NotifyEvent` discriminated union — `gradesAttention` \| `newHomework` — plus `NotifyChannel` contract), `router.ts` (sequential dispatch, per-channel error isolation, DI deps), `os-channel.ts` (Tauri-bound; owns `@tauri-apps/plugin-notification` import; exhaustive `send()` switch; permission gate + formatting ported verbatim), `default.ts` (lazy `getDefaultNotifyRouter()` singleton — temporary glue replaced by `ctx.notify` in P8). `biome.json` override widened to include `src/lib/notify/os-channel.ts`. Dashboard (`dashboard.tsx:198`) + HomeworkSource (`homework-source.ts:38`) swapped to `router.dispatch(...)`. Legacy `notifyNeedsAttention` / `notifyNewHomework` / `ensureNotificationPermission` / `formatShortDate` + plugin-notification imports deleted from `ipc.ts`. 8 new router unit tests (178 total, up from 170). |
| P7 | Per-event notification prefs in `settings` | ✅ Done | `getSettingBool(key, default)` + `setSettingBool(key, value)` in `ipc.ts` — first real use of the v1 `settings` table (booleans stored as `"1"` / `"0"`, `setSettingBool` uses `ON CONFLICT DO UPDATE excluded.value`). `OSChannel.isEnabled` now gates on permission AND `getSettingBool(\`notify.${event.type}.${this.name}\`, defaultEnabledFor(event.type))`. Per-event defaults: `gradesAttention` → true, `newHomework` → true (both via exhaustive switch — P8's `fetchFailed` will compile-error until explicitly added). User-visible behavior unchanged for fresh DBs; users can now opt out per-event by setting `notify.gradesAttention.os = "0"` etc. directly in the `settings` table (Settings → Notifications UI lands in Phase 10 S5). |
| P8 | Wire notify into the runner | ✅ Done | `FetchContext.notify: NotifyRouter` + `FetchRunnerDeps.notify`. Runner passes `ctx.notify` to each `source.run(...)` and emits a new `fetchFailed` event from its catch block. `NotifyEvent` gains `fetchFailed` branch; `OSChannel.sendFetchFailed` renders `"${child}: Fetch failed"` / `"${source}: ${error}"`; `defaultEnabledFor("fetchFailed")` = `false` (opt-in via `notify.fetchFailed.os = "1"`). `TeacherEaseSource.run` now dispatches `gradesAttention` itself after persist (moved from dashboard). `HomeworkSource` / `TeacherEaseSource` use `ctx.notify` (not the singleton). New `src/lib/fetch/default.ts` `buildFetchRunner(sources)` factory replaces inline construction in dashboard + wizard-done (net −15 lines in `handleRefresh`). `src/lib/notify/default.ts` deleted. Runner tests updated with mock notify + 1 new fetchFailed-emission test (179 tests, up from 178). |

**End state of Phase 9:** `handleRefresh` is a thin `await runner.runAll(child)` call. All scrape history lives in `fetch_runs`. All notifications flow through `NotifyRouter`. Dashboard UI visually unchanged.

## Phase 10: Desktop shell (Q22)

UI architecture: sidebar-shell app with 5 route-backed sections. Resolves the "scroll forever" problem and gives every future feature a designated home. Spec: design-plan Q22 (supersedes Q18's layout claim). Source: [ui-architecture-proposal.md](ui-architecture-proposal.md).

| # | Task | Status | Notes |
|---|------|--------|-------|
| S1 | Sidebar shell + route restructure | ✅ Done | `src/app/(shell)/` route group — `layout.tsx` wraps 5 pages (Today / Classes / History / Settings / About) in `<Sidebar />` + `<main>`. `src/components/shell/sidebar.tsx` — `usePathname`-based active-item highlight (soft-fill pill via `bg-secondary`), local `useState` collapse (expanded `w-48`, collapsed `w-14` with icons-only + `title` tooltips), lucide icons (`Home`, `BookOpen`, `History`, `Settings`, `Info`, `PanelLeft`). `/setup` (wizard) stays a sibling of the group — renders without sidebar. Stub pages for `/classes` + `/history` (content lands in S3/S4). `settings-children.tsx` + `about-page.tsx` shed their now-redundant back-arrow headers. `dashboard.tsx` unchanged (S2's job). `biome.json` override added for `src/app/(shell)/**` to allow the parenthesized group name past `useFilenamingConvention`. No new tests (layout-only). `pnpm build` generates 6 routes cleanly. |
| S2 | Reshape Today view | ✅ Done | `dashboard.tsx` loses `GradesTable` + accordion + their state/effects (~70 lines). `loadData` now loads only `missing` + `allAssignments` + `homework` (+ per-child hero status via `loadHeroStatuses`). Added `"View all classes →"` bridge link below `HomeworkCard`, linking to `/classes?child={id}` so selection carries forward. Refresh still lives in the header; title-band relocation is a later polish pass. |
| S3 | Build Classes page | ✅ Done | New `src/components/classes-view.tsx` (~130 lines): own `allChildren` / `childId` / `grades` / `statusHistory` / `instructors` / accordion state, mirrors Dashboard's prior `loadData` + `handleChildSelect` + `handleClassClick`. Reads `?child=N` from `useSearchParams`; falls back to attention-child-first then first-child. Computes `attentionChildIds` at mount so ChildTabs dots match Today. `src/app/(shell)/classes/page.tsx` now dynamically imports `ClassesView` (was an S1 stub). `GradesTable` / `StandardsTree` / `ChildTabs` unchanged. |
| S4 | Build History page | ✅ Done | New `src/components/history-view.tsx` — same `?child=N` + ChildTabs pattern as `/classes`, plus local `activeTab` state with underlined sub-tabs (Homework / Scrapes). Homework tab groups `getRecentHomework(cId, 50)` rows by `hwDate` and renders each day via the shared `HomeworkRow` component (extracted from `homework-card.tsx` along with `formatHomeworkDate` / `formatDueChip` / `isEmptyContent`). Scrapes tab renders `getFetchRunsForChild(cId, 100)` rows with source · time · duration · status pill (green success / red failed / gray parser_error); truncates long errors with tooltip on hover. New `getFetchRunsForChild` IPC helper in `ipc.ts`. `/history/page.tsx` stub replaced with dynamic-import of HistoryView. Closes [homework-followups.md Q1](homework-followups.md) (past homework browsing) and surfaces Phase 9's `fetch_runs` observability. |
| S5 | Expand Settings page | ✅ Done | `/settings` is now `SettingsView` with four sub-tabs (Children / Notifications / Email / Advanced) using the same underlined-tab style as History. **Children** — existing `SettingsChildren` content (stripped of its own page wrapper + h1, which moved up to SettingsView). **Notifications** — three rows × Switch (Grade changes / New homework / Fetch failures) reading and writing `notify.{event}.os` via P7's `getSettingBool` / `setSettingBool`; defaults mirror `defaultEnabledFor`. **Email** — placeholder pointing to Phase 11. **Advanced** — Switch for `autostart.enabled` (toggles the OS autostart state + persists), Switch for `updater.enabled` (persists only; Phase 12 reads it), Clear history button (browser `confirm()` → new `clearHistory()` IPC deleting `fetch_runs` + `homework` + `classes`; children + keychain + settings preserved). New reusable `<Switch>` primitive under `components/ui/`. Dashboard's on-mount `setupAutostart()` now gated on `getSettingBool("autostart.enabled", true)` so the toggle persists across restarts. **Export DB** deferred to a follow-up task (S5b) — requires `@tauri-apps/plugin-dialog` + Rust file-copy handler. |
| S6 | Window state persistence | ✅ Done | `tauri-plugin-window-state = "2"` added to `Cargo.toml` + registered in `lib.rs` via `.plugin(tauri_plugin_window_state::Builder::default().build())` (default `StateFlags` persist size/position/maximized/fullscreen to `~/.config/<app-id>/.window-state.json`). Sidebar's collapse state now reads/writes `ui.sidebarCollapsed` via P7's `getSettingBool` / `setSettingBool` — brief flicker on mount (starts expanded, snaps to stored value ~50ms later) is acceptable. Sidebar is the third consumer of the `settings` table after Notifications + Advanced. No capability change needed — plugin's lifecycle hooks fire Rust-side. |
| S7 | Recent Activity revive-or-delete decision | ✅ Done | **Revived** per homework-followups Q3's lean. `agingMissing` dropped from `core/activity.ts` (type + logic + `parseDueDate` + `AGING_MISSING_DAYS` + `MS_PER_DAY` + `now` param all gone; net ~40-line reduction). `recent-activity.tsx` heading renamed from "Today" to "Since last check"; `Clock` import + aging case removed. Dashboard re-wired: `grades` / `prevGrades` / `prevAssignments` state + `getFetchRunBefore` loader + `useMemo` for `activities` + `<RecentActivity />` rendered between AttentionSection and HomeworkCard. Tests: 3 aging-specific cases deleted, 1 ordering case simplified (179 → 176 total). |

**End state of Phase 10:** Desktop-native feel with sidebar navigation, bounded Today view, and designated homes for every planned future feature.

## Phase 11: Email reports

Second `NotifyChannel` (SMTP) plugs into Phase 9's router. Also fills the Email tab placeholder from S5. BYO SMTP per Q4.

| # | Task | Status | Notes |
|---|------|--------|-------|
| E1 | `EmailChannel` implementation | ✅ Done | SMTP runs in Rust (webviews can't speak TCP — original "nodemailer" note in the plan was wrong). `src-tauri/src/smtp.rs` — new `send_email` Tauri command using `lettre` 0.11 (`rustls-tls`, no-default-features) inside `spawn_blocking`; port 465 → implicit TLS, else STARTTLS. `src/lib/notify/email-channel.ts` — implements `NotifyChannel`; `loadSmtpConfig` reads `smtp.host`/`port`/`username`/`from`/`to` via new `getSettingString` + keychain `smtp-main` via new `getSmtpPassword`. `isEnabled` returns false when SMTP not configured OR toggle off (`notify.{event}.email` defaults to false for all 3 events — email is opt-in per Q4). `send` renders minimal plaintext bodies mirroring OSChannel strings (HTML report body lands in E2). `sendEmail()` + `getSettingString`/`setSettingString` + `getSmtpPassword`/`setSmtpPassword`/`deleteSmtpPassword` added to `ipc.ts`. `buildFetchRunner` now registers `[OSChannel, EmailChannel]` so email is a second pluggable delivery path. 10 new unit tests (186 total, up from 176). `email-channel.ts` imports only from `@/lib/ipc`, so no new biome override needed. |
| E2 | Event → email template system | ✅ Done | New `src/lib/notify/email-templates.ts` with `renderEmail(event): { subject, textBody, htmlBody } \| null` — pure function, template literals only (no engine). Per-event functions cover `gradesAttention` / `newHomework` / `fetchFailed`; each produces a plaintext line (E1 contract preserved) plus inline-CSS HTML using a shared layout helper (Arial stack, 600px centered card, colored accent box per event severity — red/blue/gray). Private `escapeHtml` guards child names + error strings + source names against HTML injection (tested with `<script>` payloads). New `src/lib/notify/format.ts` de-duplicates `formatShortDate` between `os-channel` + email templates. `src-tauri/src/smtp.rs` accepts optional `html_body`; when present it builds `MultiPart::alternative()` with plaintext + HTML parts, else stays single-part. `SendEmailArgs.htmlBody?: string` on TS side. `EmailChannel.send` thinned to config-load → renderEmail → sendEmail pass-through. **Scope note:** chose event-data summary templates (not full assignment drilldown from the Python ref repo) — rich per-assignment email belongs to a future daily-digest feature since `NotifyEvent` is intentionally shallow. 13 new template tests + 3 email-channel tests updated (199 total, up from 186). |
| E3 | Settings → Email tab | ✅ Done | New `src/components/settings-email.tsx` — three stacked sections: SMTP server form (host/port/user/from/to + password, `type="password"`), email notification toggles (3 events × `notify.{event}.email` keys, defaults false, dimmed+disabled until SMTP complete), and Send-test-email card. Form validates host/port/user/from/to before save; inline per-field errors. Password is WRITE-ONLY — never populated from keychain on load; a "Saved password present" badge signals keychain state; "Remove saved password" link deletes via `deleteSmtpPassword`. Save persists all 5 fields via `setSettingString` + conditionally `setSmtpPassword` when the field is non-empty. `sendTestEmail()` helper added to `ipc.ts` — reads saved settings + keychain, invokes `sendEmail` with a canned subject/body (matches E2's HTML layout style); throws `"SMTP not configured"` matching `EmailChannel.send` semantics. `settings-view.tsx` placeholder removed; tab wires to `SettingsEmail`. Static note at bottom defers to E4 for the Gmail App Password tutorial. No new unit tests (project lacks jsdom harness); 189 tests still green. |
| E4 | Gmail App Password tutorial | ✅ Done | New `/gmail-app-password` route (sibling of the other shell pages — deep-linked, no sidebar entry) rendering a text-only walkthrough. Five numbered steps cover 2SV → App Passwords page → create → copy → paste into Email tab → send test. Links out to `myaccount.google.com/signinoptions/two-step-verification`, `myaccount.google.com/apppasswords`, and `support.google.com/accounts/answer/185833` (Google's always-current help page). Troubleshooting section covers Workspace-admin lockout, 2SV-not-enabled redirect, 535 SMTP auth error, and lost-password recovery. `settings-email.tsx` bottom placeholder now shows a "Setup guide →" `<Link>` to the new route. **Deliberately text-only — no screenshots shipped** (Google redesigns this UI frequently, screenshots would rot; Google's own help article carries the current images). Route built: 7 total shell routes now. |
| E5 | Live-send integration test | ✅ Done | Inline `#[cfg(test)] mod tests` block in `src-tauri/src/smtp.rs` — single `live_smtp_send` test exercising the production `send_blocking` path end-to-end against real SMTP. Gate: `EMAIL_LIVE=1`; silent-skip otherwise (matches `TEACHEREASE_LIVE` convention). Reads SMTP creds from `sandbox/.env` via new `[dev-dependencies] dotenvy = "0.15"` (never in release bundle). Run: `(cd src-tauri && EMAIL_LIVE=1 cargo test live_smtp -- --nocapture)`. One test, not per-template — transport is identical across templates; template content already covered by 13 TS unit tests in `email-templates.test.ts`. Default `cargo test` passes (silent skip). **Known hook gotcha:** `.claude/hooks/block-env-edits.sh` pattern `*.env.*` blocks `.env.example` even though the hook message points users there — updating the example file requires either fixing the hook (carve-out for `.env.example`) or manual edit. Flagged to user; E5 test itself works without this doc update since developers set `EMAIL_LIVE=1` in shell or sandbox/.env directly. |

**End state of Phase 11:** Parent with a laptop that closes during the day can still receive a daily email summary. Q4 fully realized. All 5 tasks (E1–E5) landed.

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

**Phases 9 + 10 + 11 complete.** Backend fetch/notify pipelines unified (P1–P8); desktop sidebar shell with 5 routes (S1); Today reshaped (S2); Classes + History pages built (S3/S4); Settings expanded (S5); window + sidebar state persisted (S6); Recent Activity revived (S7). **Phase 11** — `EmailChannel` + Rust `send_email` via `lettre` rustls (E1); per-event HTML + plaintext multipart templates (E2); Settings → Email tab with SMTP form + per-event toggles + Send-test button (E3); `/gmail-app-password` tutorial route (E4); cargo-side live-send smoke test gated on `EMAIL_LIVE=1` (E5). Next: **Phase 12** — release pipeline (updater signing keypair, `tauri-plugin-updater` wiring, GH Actions release workflow, first v0.1.0 public release).
