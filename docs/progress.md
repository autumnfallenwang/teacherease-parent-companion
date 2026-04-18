# TeacherEase Parent Companion — Progress

## Phase 0: Scaffolding (all ✅)

Repo + MIT + CLAUDE.md + .claude/ scaffold (T1). pnpm + Biome 2.4 + Vitest 4 + TS 5.9 + Next 15 + Tauri CLI 2 (T2). Next.js static-export with `output: "export"` (T3). Tauri 2 init (bundle id `dev.autumnfallenwang.teacherease-parent-companion`) + `rust-toolchain.toml` (T4). Cross-platform CI with ts+rust jobs and Linux/Windows/macOS build matrix (T5). Lint/typecheck/test wiring across TS + Rust (T6).

## Phase 1: Core scraper (all ✅)

Committed HTML fixtures scrubbed of PII (T7). Login flow — **not classic WebForms**: regular HTML form with CSRF token, credential fields `email`/`password`, POST `/app/Login/Login` (T8, see lessons 2026-04-15). Grade overview via embedded-JSON regex extraction, not cheerio (T9). Class detail via cheerio recursive `ul.root-standard-item` → standards → `table.assignmentTable` (T10). Real-fixture parser tests against unscrubbed `sandbox/captures/` (T11a). Live e2e test gated `TEACHEREASE_LIVE=1` (T11b).

## Phase 2: Local persistence (all ✅)

SQLite v1 schema (6 tables) via `tauri-plugin-sql` migration (T12). Child CRUD with keychain atomicity in TS (T13). `persistScrape()` + read queries (`getLatestScrape`, `getGradesForScrape`, etc.) in `ipc.ts` (T14, T15). Scraper moved to `src/lib/scraper/` (Phase 2b / T15b) — all shipped code under `src/`.

## Phase 3: Dashboard UI — core (all ✅)

Tailwind 4 + shadcn/ui bootstrap with globals.css theme vars, `Header` + `EmptyState` + v1 dashboard (T16). `GradesTable` with Meeting/Attention/Not-Assessed badges (T17). `NeedsAttention` list (T18). Full pipeline: login → scrape → persist → render, wired via `next/dynamic` + `ssr:false` (T19). Linux `WEBKIT_DISABLE_DMABUF_RENDERER=1 GDK_BACKEND=x11` baked into `pnpm tauri:dev`.

## Phase 4: First-run wizard (all ✅)

4 screens (T20-T24): Welcome, Add-child with live `login()` validation, Notifications pre-prompt (UI-only stub), inline first scrape + summary, Skip/resume-later flow. `/setup` route with `ssr:false`.

## Phase 5: Scheduler + notifications + tray

Tray `TrayIconBuilder` with Open/Refresh/Quit menu, `tray-refresh` event to webview (T25). 6h internal timer on dashboard mount — auto-refresh on stale data (T26, MVP; background scrape while closed deferred). `tauri-plugin-notification` wired, `notifyNeedsAttention()` fires after scrape (T27). `tauri-plugin-autostart` wired, default enabled (T28). Battery settings deferred — no OS power API exposed by Tauri (T29).

## Phase 6: Multi-child support (all ✅)

`ChildSwitcher` dropdown in header, hidden ≤1 child, re-fetches on switch (T30). `/settings` page with child list + add form (T31).

## Phase 6b: Logging + Legal (all ✅)

`tauri-plugin-log` with File (2MB rotation) + Stdout dev-only + Webview targets, DEBUG dev / INFO release (L1). TS logging wrappers (`log`/`logWarning`/`logErr`) in ipc.ts (L2). "View logs" in Settings → About opens OS file manager via `open_log_dir` Rust command (L3). Q14 logging rules locked (L4). `src/lib/legal.ts` as single source of truth for the disclaimer, referenced by wizard/about/settings/README/DISCLAIMER.md (L5, Q15).

## Phase 7: Dashboard UI — full (all ✅)

Q16 locked (T32). `StatusDots` + `TrendArrow` + `computeTrend()` pure function (10 tests) + `getAllStatusHistory()` IPC via window-function query (N+1-free), clickable class rows with accordion slot (T33). `StandardsTree` recursive renderer + `getClassDetail()` IPC from `raw_payloads` JSON, one-at-a-time accordion with `bg-secondary/40` (T34).

## Phase 7b: Data model v2 — Q17 (mostly ✅, D6 never done)

v2 migration (classes + standards tables, enriched grades + assignments) + indexes (D1). Scraper fetches all 8 detail pages, not just needs_attention (D2). Parser extracts TestNameID from `data-testnameid` attr with href-fallback (D3). `persistScrape` rewritten: `upsertClasses()` + recursive `persistStandards()` + `persistAssignmentsDeduplicated()` by TestNameID (D4). Read queries expanded + compat layer for old `status='missing'` rows (D5). Seed script update skipped (D6) — addressed much later in H-phase work. E2E validation test (D7). Q18 design locked (D8).

## Phase 7c: Dashboard UX v2 — Q18 implementation (all ✅)

`StatusHero` family-wide card (U1). `ChildTabs` tab bar replacing header dropdown (U2, later superseded by Q26 sidebar radio). `ProgressBar` thin 4px teal/amber (U3). `GradesTable` with progress bars + instructor + `sortClassesByUrgency()` (U4). `RecentActivity` core + component — diffs consecutive scrapes into improved/declined/newScores/agingMissing (U5; `agingMissing` later dropped in S7). `AttentionSection` replacing `MissingWork` — missing + low-score combined (U6). Dashboard wiring with auto-select attention-child (U7). StandardsTree empty-state cleanup (U8). Seed script v2 + time-varying 7-day evolution (U9).

## Phase 8: Homework scraping — Google Sites, Q19 (all ✅)

`homework-parser.ts` cheerio-based with end-anchored `Due:` regex and position-based subject scan (H1). Migration v3: `children.homework_url` column + `homework` table with `UNIQUE(child_id, hw_date, subject)` (H2). `persistHomework()` upsert + date normalization + month filter, failures log-only (H3). URL field in wizard + settings with inline Edit/Save (H4). `HomeworkCard` dashboard section with date subtitle + per-subject cards (H5). Notifications fire on max `hw_date` advance, not on same-day edits (H6). Live + real-fixture integration tests (H7).

## Phase 9: Platform refactor — Q20 + Q21 (all ✅)

`homework.due_date` normalized to ISO + inferred fallback via `core/homework-date.ts` (28 tests); migration v4 adds `due_date_inferred` (P1). Migration v5: `scrapes` → `fetch_runs`, adds `source` column, renames FK columns across 4 child tables (P2). `FetchSource` + `FetchRunner` contract — sequential orchestration, per-source error isolation, DI for testability (P3, 9 tests). `TeacherEaseSource` extracts login+scrape+persist, `persistScrape`/`ScrapeResult` deleted; `handleRefresh` shrinks to a `runner.runAll()` call (P4). `HomeworkSource` — `isApplicable` gates on `homeworkUrl`, throws on non-200, failures persisted to `fetch_runs` (P5). `NotifyRouter` + `OSChannel` with closed `NotifyEvent` union (gradesAttention + newHomework), per-channel error isolation (P6, 8 tests). Per-event enablement via settings keys `notify.{event}.{channel}` with `getSettingBool`/`setSettingBool` helpers (P7). Runner passes `ctx.notify` to sources, emits `fetchFailed` event (opt-in), sources use it instead of singleton (P8).

**End state:** `handleRefresh` is a thin `await runner.runAll(child)` call. All fetch history lives in `fetch_runs`. All notifications flow through `NotifyRouter`. UI visually unchanged.

## Phase 10: Desktop shell — Q22 (all ✅)

`src/app/(shell)/` route group with Sidebar + 5 pages (Today/Classes/History/Settings/About), `usePathname`-based active pill, collapsible sidebar (S1). Dashboard reshaped — drops GradesTable+accordion, adds "View all classes →" link to `/classes?child={id}` (S2). `ClassesView` with own data loading mirroring dashboard's prior pattern (S3). `HistoryView` with Homework + Scrapes sub-tabs using shared `HomeworkRow` component (S4; Scrapes sub-tab to be removed per D-06/Phase 16). `SettingsView` with Children/Notifications/Email/Advanced sub-tabs + `<Switch>` primitive; Clear-history IPC deletes `fetch_runs`+`homework`+`classes` but keeps children+keychain+settings (S5). `tauri-plugin-window-state` persists window geometry; sidebar-collapse persisted via `ui.sidebarCollapsed` (S6). RecentActivity revived — `agingMissing` dimension removed from `core/activity.ts` (S7).

**End state:** Desktop-native feel with sidebar nav, bounded Today view, designated homes for every planned feature.

## Phase 11: Email reports (all ✅)

`EmailChannel` via SMTP in Rust (webviews can't TCP): `src-tauri/src/smtp.rs` with `lettre` 0.11 rustls-tls in `spawn_blocking`; port 465 implicit-TLS else STARTTLS. `isEnabled` gates on SMTP config + per-event toggle (default off per Q4) (E1). `renderEmail()` templates pure function with plaintext + HTML multipart, `escapeHtml` for injection protection (E2). Settings → Email tab with WRITE-ONLY password field + "Saved password present" badge + Send-test-email (E3). `/gmail-app-password` text-only walkthrough for 2SV → App Passwords (E4). `#[cfg(test)]` live SMTP test gated `EMAIL_LIVE=1`, reads from `sandbox/.env` via `dotenvy` dev-dependency (E5).

**End state:** Parent with a closed laptop can still receive daily email summaries.

## Phase 12: Release pipeline (R1–R3 ✅, R4 prep ✅ / maintainer executes)

Passwordless minisign keypair in `~/.tauri/` + pubkey committed at repo root, runbook in `docs/updater-signing.md` (R1). `tauri-plugin-updater` + `tauri-plugin-process` wired in `tauri.conf.json`, frontend bindings via `ipc.ts` (`checkForUpdate`, `installUpdate`, dismissed-version + last-check settings), `core/update-banner.ts` pure decision fns (10 tests), `<UpdateBanner />` sticky in `(shell)/layout.tsx`, respects Settings → Advanced `updater.enabled` toggle (R2). `.github/workflows/release.yml` on `v*` tag — 4-entry matrix builds + signs + creates draft Release with `latest.json` via `tauri-apps/tauri-action@v0` (R3). **R4 prep done** (CHANGELOG, `docs/releasing.md` runbook, README polish); **maintainer executes** the v0.1.0 tag, secret upload (`gh secret set TAURI_SIGNING_PRIVATE_KEY`), draft publish, smoke test, then v0.1.1 to verify updater round-trip.

## Phase 13: First-launch docs (all ✅)

`docs/first-launch-windows.md` — SmartScreen walkthrough, SHA-256 verification (`Get-FileHash`), uninstall incl. Credential Manager cleanup (FL1). `docs/first-launch-macos.md` — Gatekeeper walkthrough for macOS 14 and Sequoia-15 flows, Apple Silicon vs Intel picker, SHA-256 verification (`shasum`), uninstall incl. Keychain Access cleanup; Linux GNOME keyring-prompt bonus section (FL2). Both linked from README.

## Phase 14: Appearance (theme + font size + profiles)

User-facing appearance controls. Promoted from walkthrough finding D-01; expanded during A1 review with D-02 (theme profiles, palette softening). Settings → new "Appearance" sub-tab alongside Children / Notifications / Email / Advanced. A1 shipped a simple Light/Dark/System toggle over the existing Q16 palette; A4 supersedes A1's UI with a profile library per Q23. A3 (reduced-motion toggle) was dropped — this app's motion budget is already tiny (hover color fades + a couple of accordion slides + spinners), so a dedicated setting wouldn't carry its weight.

| # | Task | Status | Notes |
|---|------|--------|-------|
| A1 | Theme picker — Light / Dark / System | ✅ Done | New `src/lib/core/theme.ts` — pure `resolveTheme(preference, systemPrefersDark) → "light" \| "dark"` + `isThemePreference` guard (7 new unit tests). New `src/components/theme/theme-provider.tsx` — side-effect-only client component mounted via `next/dynamic` in `(shell)/layout.tsx`; reads `appearance.theme` from settings (default `"system"`), subscribes to `matchMedia("(prefers-color-scheme: dark)")` so OS flips propagate live, toggles `.dark` on `document.documentElement`, and listens for a `theme-preference-change` custom event for same-tab updates without reload. New `src/components/settings-appearance.tsx` — segmented 3-button control (Sun / Moon / Monitor icons) using existing Tailwind classes. Settings tab order now Children / **Appearance** / Notifications / Email / Advanced. No CSS changes needed — `globals.css:5` already had `@custom-variant dark` and line 101+ had full dark palette. 206 tests (up from 199). Flash of light on boot acknowledged as a follow-up polish task (would need localStorage mirror + inline head script). |
| A2 | Font size — Small / Medium / Large + custom % | ✅ Done | `html { zoom: var(--font-scale, 1); }` in `globals.css` — uses CSS `zoom` (not `font-size`) because ~83% of codebase text classes are hardcoded `text-[Npx]` arbitrary values that don't scale with root font-size. `zoom` scales text, spacing, borders, icons proportionally. ThemeProvider reads `appearance.fontSize` (stringified zoom factor; default `"1"`) and sets `--font-scale` alongside existing theme + profile logic. Storage model: numeric-string zoom factor (not a named enum) so custom values persist alongside presets. `src/lib/core/theme.ts` exposes `FONT_SIZE_MIN`/`MAX`/`DEFAULT`, `FONT_SIZE_PRESETS` (`[Small=1.0, Medium=1.15, Large=1.3]` per walkthrough iteration — original 0.875/1.0/1.125 felt too subtle), `parseFontSize(raw)` clamp+fallback, `isScaleNear` epsilon comparator. Settings → Appearance Size section has three preset buttons PLUS a custom % number input (50–200%, step 5) that commits on Enter or blur per Q24. When the scale matches a preset the preset highlights; otherwise none do ("custom"). 11 new unit tests (225 total, up from 219). `zoom` is well-supported across Chromium/WebKit (Tauri's webviews on all 3 OSes). |
| A4 | Theme profile library (per Q23) | ✅ Done | `:root` + `.dark` in `src/app/globals.css` overwritten with the softened Default (soft) palette (fixes "too white / too black" — warm off-white `oklch(0.965 0.006 75)` + warm slate `oklch(0.22 0.012 60)`). Four additional profile classes appended: `.theme-solarized`, `.theme-nord`, `.theme-dracula`, `.theme-contrast` (each with its own `.dark` variant) for a total of 10 palette blocks. `src/lib/core/theme.ts` gains `ThemeProfile`, `isThemeProfile`, `PROFILE_CLASSES`, `PROFILE_LABELS`. ThemeProvider now resolves + applies both `.dark` and the appropriate `.theme-<name>` class orthogonally. Settings → Appearance UI restructured into a **Profile** section (native select dropdown, 5 options with live description line below) above the existing **Mode** segmented control. `appearance.profile` persisted to the `settings` table; default `"default"` maps to no class (the base `:root` values ARE the default). All palettes hit WCAG AA; High contrast targets AAA. 14 new tests for profile validation (213 total, up from 199). |

**End state:** Settings → Appearance offers profile + mode + font size, all persisted and applied at shell-layout scope. Dark mode becomes a first-class option with multiple curated palettes. Deferred for future walkthrough findings: density (compact/comfortable), custom user profiles, per-profile font stacks, reduced-motion toggle (dropped for now — motion budget too small to warrant a setting).

## Phase 15: Unified attention engine (per Q25)

Replace the two parallel definitions of "needs attention" (TeacherEase's `status` column on the Classes tab vs. the Today-tab Attention section's ad-hoc missing + low-score union) with a single engine owned by this app. TeacherEase keeps its M / P / B / PS rollup as the "meeting" rubric; we own the `!` / `✓` attention layer. Two user-tunable knobs (forgiveness window + low-score threshold) live under a new Settings → Attention sub-tab. Promoted from walkthrough dialog; Q25 locked in `design-plan.md`.

| # | Task | Status | Notes |
|---|------|--------|-------|
| AT1 | Core attention engine (pure TS) | ✅ Done | `src/lib/core/attention-engine.ts` — pure module, imports only `Assignment`/`Standard`/`ClassDetails` type shapes. Exposes `classifyAssignment(a, now, cfg) → AssignmentAttention` (per-item reason + age + within-window), `computeClassAttention(detail, now, cfg) → ClassAttentionResult` (walks standards tree, rolls per-standard and per-class flags, emits flat items list), `computeChildAttention(details[], now, cfg) → ChildAttentionResult` (aggregates across classes, splits items into `withinWindow` / `agedOut`). `AttentionFlag` carries `{ status: "clean" \| "attention", agedOutOnly }` so the UI can tell "truly clean" from "only aged-out items below" without treating the latter as needing attention. Config defaults in constants: `DEFAULT_FORGIVENESS_WEEKS=2`, `DEFAULT_LOW_SCORE_THRESHOLD=3.0`. Aging rule: `ageDays > forgivenessWeeks*7` is strict (day-14 still within at 2w window, day-15 aged). Low-score threshold is strict `<` (3.0 = Meeting is NOT attention). Missing beats low-score when both apply. Dormant until AT2 consumes it — existing `core/attention.ts` + `core/missing.ts` still drive the UI. 33 new unit tests (210 → 243) covering classification, tree propagation, child aggregation, window/threshold tunability, edge cases. |
| AT2 | Today-tab Attention section wiring | ✅ Done | Today tab now renders via the engine. Dashboard fetches `ClassDetails[]` with new `getAllClassDetails(fetchRunId)` + reads `attention.*` keys from settings via new `getAttentionConfig()` (falls back to defaults — Settings UI in AT5). `useMemo → computeChildAttention(details, new Date(), cfg)` feeds `AttentionSection` with `{ withinWindow, agedOut }`. Section props swapped from `{ missingAssignments, allAssignments }` (flat `AssignmentRecord[]`) to `AttentionItem[]` pair. Heading "This week" → "Recent" (no longer fixed at 7d). Within-group sort via new engine helper `sortItemsMissingFirst`. New engine helpers `parseAttentionConfig` (string→config with defaults + clamp) and `sortItemsMissingFirst` added with 8 new unit tests. **Deleted** pre-engine modules once consumers migrated: `src/lib/core/attention.ts`, `src/lib/core/missing.ts`, and two dead-since-Q18 components (`src/components/missing-work.tsx`, `src/components/needs-attention.tsx`) plus their tests. Net test delta: 243 → 238. |
| AT3 | Standards tree markers | ✅ Done | `StandardNode` icon now reflects the engine's attention verdict (not `isMeeting`): amber `!` when any within-window item lives below, green `✓` for fully clean, muted `✓` for clean-with-aged-out-below. TeacherEase's `M / P / B / PS` letter continues to display alongside — two independent glyphs per row per Q25. `AssignmentRow` picks up matching treatment: within-window missings keep the amber tint; aged-out missings drop to muted (still labelled "Missing" for honesty, no longer demanding action); within-window low-score rows gain a small `TrendingDown` icon. `StandardsTree` now takes an `attentionCfg` prop; classes-view loads it once via `getAttentionConfig()` in `loadData`. Icons carry `<title>` tooltips ("Needs attention" / "All clear" / "Older items (resolved)") for disambiguation. No new tests — all logic lives in the already-tested engine. |
| AT4 | Classes list + Status Hero rewire | ✅ Done | `StatusHero` + `ChildTabs` + `GradesTable` now read from the engine instead of `GradeRecord.needsAttention`. `dashboard.loadHeroStatuses` fetches `ClassDetails[]` per child, runs `computeChildAttention`, derives `attentionCount` + `attentionClassNames` from `perClass.filter(c => c.classFlag.status === "attention")`; `meetingCount`/`notAssessedCount` still come from TeacherEase's `status` (meeting dimension unchanged). `classes-view` mirrors the pattern for its own `attentionChildIds` (per-child tab dots) and passes a per-current-child `attentionClassNames` Set to `GradesTable`. `GradesTable` props gain `attentionClassNames: ReadonlySet<string>`; `StatusIndicator` renders `Needs Attention` badge based on that set, not `grade.needsAttention`. `sortClassesByUrgency` extended with optional `attentionClassNames` Set as the primary sort key (engine attention first, then TE status); default empty Set keeps back-compat. `getNeedsAttentionGrades` stays in ipc.ts for notifications (`teacherease-source.ts`) and historical display (`history-view.tsx`) — non-Q25 consumers intentionally untouched. 3 new sort tests (238 → 241). |
| AT5 | Settings → Attention sub-tab | ✅ Done | New `src/components/settings-attention.tsx` with two Q24 Enter-or-blur numeric inputs: forgiveness window (weeks, 1–12, default 2) and low-score threshold (0.0–4.0, step 0.5, default 3.0). Writes to `settings` keys `attention.forgivenessWeeks` + `attention.lowScoreThreshold` that the engine (AT1/AT2) already reads via `parseAttentionConfig`. Hydrates on mount from the same keys (with defaults fallback). Invalid input reverts display rather than persisting garbage; out-of-range values clamp to defaults. Dispatches `attention-config-change` on save for future live-refresh wiring; current-session propagation relies on App Router remount (navigate → fresh `loadData`). Settings tab order: Children / Appearance / **Attention** / Notifications / Email / Advanced. Test count unchanged (`parseAttentionConfig` already fully covered in AT2's suite). |
| AT6 | Unit tests for the engine | Not started | `tests/lib/core/attention-engine.test.ts` — leaf propagation, parent propagation up a 2+ deep tree, class rollup, forgiveness boundary (day N-1 vs N+1), low-score threshold edge (score == threshold is NOT attention-worthy, strictly less than is), all-clean subtree, empty class. Also cover: a class with M rollup from TeacherEase but `!` from engine (orthogonal-signals case). |

**End state — AT1/AT2/AT3/AT4/AT5 all ✅ Done:** One attention definition across the whole app, driven by a pure-TS engine with user-tunable knobs. TeacherEase's rubric stays intact as the "official" grade story; our engine is the "parent's inbox" story. AT6 (unit tests for the engine) landed together with AT1 — the engine was tested as it was built.

## Phase 16: Unified page chrome (per Q26)

Every top-level route gets a unified sticky header (title + optional actions + optional sub-tab nav). ChildTabs leaves the page body and becomes a radio-group context selector in the sidebar middle, between the per-child routes (Today / Classes / History) and the app-level routes (Settings / About). The right-hand content column is the single scroll container; sidebar + page header stay pinned. Promoted from walkthrough dialog; Q26 locked in `design-plan.md`.

| # | Task | Status | Notes |
|---|------|--------|-------|
| L1 | `PageHeader` component | Not started | New `src/components/shell/page-header.tsx`. Props: `title: string`, `actions?: ReactNode`, `subTabs?: ReactNode`. Renders the sticky (`sticky top-0 z-20`) block with the title row on top and the optional sub-tab nav row below, styled as one cohesive chunk. Uses the same `bg-card/80 backdrop-blur-sm border-b` treatment the current dashboard Header already uses (keeps visual continuity). |
| L2 | Rewire all five top-level routes | Not started | Dashboard / Classes / History / Settings / About each import `PageHeader` and stop rendering their own title chrome. Dashboard swaps its bespoke `<Header>` for `<PageHeader title="Today" actions={...refresh/settings buttons}>`. Classes / History / About render plain `<PageHeader title="…">` (no actions). Settings renders `<PageHeader title="Settings" subTabs={...}>` with the six sub-tab buttons moved into the `subTabs` slot. This task folds D-06 for History: delete the Scrapes sub-tab + `FetchRunsSection`, upgrade the Homework empty state to a pointer toward Settings → Children. |
| L3 | Move ChildTabs to the sidebar | Not started | Delete `ChildTabs` from `dashboard.tsx` and `classes-view.tsx` render trees. Add a new `SidebarChildSelector` component rendered inside `Sidebar` between the primary-nav group (Today / Classes / History) and the utility-nav group (Settings / About), with a separator line above and below. Radio-group list, one line per child, amber attention dot still inline, active child highlighted. Hides entirely (renders nothing — including its separators) when `children.length === 1`. The selected child propagates through a shared hook / settings key so dashboard + classes-view read the same `selectedChildId`. |
| L4 | Scroll + theme polish | Not started | Smoke-test every route × theme profile × light/dark: sticky header stays visible during long-content scroll, sidebar stays visible, ChildSelector doesn't clip, Settings sub-tab nav pins to the bottom of the sticky chunk. Confirm the wizard flow (pre-shell) still works — it doesn't use `PageHeader`. |

**End state:** Every route has the same chrome. Parents always see which page they're on, which child they're viewing, and the page-specific actions — regardless of scroll position. Each page's body becomes a cleaner, leaner area focused on content.

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
6. **Phase 14 — Appearance (A1/A2/A4)** theme profile library + Light/Dark/System + font size (per Q23).
7. **Phase 15 — Unified attention engine (AT1–AT5)** per Q25. Pure-TS engine owns the attention dimension app-wide; TeacherEase owns the meeting dimension (M/P/B/PS rollup). User-tunable forgiveness window + low-score threshold in Settings → Attention.

**Phases 0–15 code-complete.** Backend fetch/notify pipelines (P1–P8); desktop shell (S1–S7); email reports (E1–E5); Phase 12 release pipeline wired (R1 keypair, R2 updater plugin + banner, R3 release.yml); R4 prep (CHANGELOG, releasing.md, README polish — maintainer executes); Phase 13 FL1 + FL2 first-launch walkthroughs; Phase 14 Appearance (A1 theme picker Light/Dark/System, A4 theme-profile library per new Q23 — supersedes Q16's palette lock only — A2 font size preset + custom %; A3 reduced-motion dropped as motion budget too small to warrant a setting); Phase 15 Unified attention engine per Q25 (AT1 pure engine + 33 tests, AT2 AttentionSection wiring + dead-module deletion, AT3 standards tree markers, AT4 StatusHero + ChildTabs + Classes list rewire, AT5 Settings → Attention sub-tab with parseAttentionConfig-backed Enter-or-blur inputs). **Phase 16 (Unified page chrome) planned** per new Q26 (supersedes Q18's ChildTabs-in-body claim, extends Q22's sidebar-shell architecture). Tasks L1–L4 laid out; next session runs `/dev-task` to start L1. Also pending: maintainer-side execution of R4 (tag → workflow → publish → smoke test → v0.1.1 updater-round-trip). Pending: maintainer-side execution of R4 (tag → workflow → publish → smoke test → v0.1.1 updater-round-trip).
