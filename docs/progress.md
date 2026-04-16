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
| 30 | Child switcher in header | Not started | Hidden when only one child |
| 31 | Settings → Children CRUD page | Not started | Add / edit / remove, reuses wizard add-child form |

## Phase 7: Dashboard UI (full)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 32 | Dashboard UX design (separate question) | Not started | Parked — pick up when implementing Phase 7 |
| 33 | Grade trend charts | Not started | Per-class over time |
| 34 | Assignment drilldown | Not started | Per-class detail view with history |

## Phase 8: Optional email (advanced)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 35 | Settings → Advanced → Email form | Not started | SMTP host/port/user/pass, BYO only |
| 36 | Email sender + templates | Not started | Port HTML template from ref repo |
| 37 | Gmail App Password tutorial | Not started | Static page with screenshots |

## Phase 9: Updater + release pipeline

| # | Task | Status | Notes |
|---|------|--------|-------|
| 38 | Updater signing keypair + GH secrets | Not started | One-time setup |
| 39 | `tauri-plugin-updater` wiring | Not started | Update banner in dashboard header |
| 40 | GitHub Actions release workflow | Not started | Tag → build 3 OSes → publish release + latest.json feed |
| 41 | First public release | Not started | v0.1.0 |

## Phase 10: First-launch warning docs

| # | Task | Status | Notes |
|---|------|--------|-------|
| 42 | `docs/first-launch.md` | Not started | Windows SmartScreen and macOS Gatekeeper bypass walkthroughs with screenshots |

---

## What's Working

- Phase 0 scaffolding complete. Repo builds end-to-end on Linux.
- Planning docs committed (design-plan.md with Q1–Q12 locked decisions, progress.md).
- `pnpm check` (lint + typecheck + test) green — 10 files Biome-clean, tsc clean, 1/1 Vitest smoke test passing.
- `next build` produces static export to `out/`.
- `src-tauri/` scaffolded and compiles — `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` all green.
- GitHub Actions CI with ts + rust jobs and 3-OS build matrix at `.github/workflows/ci.yml`.
- Dev env verified: node 25.9, pnpm 10.29, rustup + rustc 1.94.1 (rust-analyzer component), webkit2gtk-4.1, typescript-language-server.
- Reference Python predecessor checked out at `ref/teacherease_parents_helper/` (gitignored) for HTML fixture mining and parser cross-checks.

## What's Next

**Phase 5 complete.** Tray icon, notifications, autostart wired. Battery setting deferred (no Tauri API for power status). Next: **Phase 6, Task 30** — Child switcher in header.
