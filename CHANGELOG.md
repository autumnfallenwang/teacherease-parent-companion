# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Fetch and notifications now run on independent schedules (Phase 19 / Q29).** Fetch pulls fresh data N times a day at evenly-spaced local slots (default 4: 00:00 / 06:00 / 12:00 / 18:00, tunable 1–8 in Settings → Fetch). Notifications fire exactly once a day at a user-picked local time (default 07:00, editable in Settings → Notifications). The old coupling — "every fetch fires a notification" — is gone. A scheduled notification reads whatever's already in the database; no implicit fetch is triggered. When the app opens after being closed for 6+ hours, a silent catch-up fetch runs in the background (no notification).
- **Refresh button moved from Today to Settings.** The Today header is now just the title + a "Checked Xm ago" timestamp. Manual triggers live where the schedules live: Settings → Fetch → "Fetch now" (pulls data, no notification); Settings → Notifications → "Send digest now" (builds a digest from current DB state and sends through your enabled channels). The tray menu's "Refresh Now" item is now properly wired (was a no-op before) and maps to "Fetch now."
- **Settings reorganized around input vs. output.** New Fetch sub-tab replaces Email (Email merged into Notifications). Tab order: Children / Appearance / Attention / Fetch / Notifications / Advanced. Each schedule's manual-trigger button sits next to its schedule controls — fewer places to hunt for things.
- **Date chips always at the end of each row.** On both the email digest and the Today tab, the 🕐 due-date is now the rightmost element on attention + homework rows — grade (for low-score) and content (for homework) come first, date last. Keeps the eye on a consistent column across rows.
- **Email homework items render on one line.** Subject · due-date · content now flow inline with ` · ` separators so each homework row is a single logical line, matching the new single-line attention rows.
- **Email icon mapping now mirrors the Today tab 1:1.** Attention heading gains ⚠ (matches `AlertTriangle`); "Homework for today" heading gains 📖 (matches `BookOpen`); "Homework due today" heading gains 🎯 (matches `Target`). Per-item 📖 / ⏰ on homework rows are gone — they belong on the section heading, not on every row, same as the Today tab. Attention rows keep their 📕 / 📉 per-item icons (Today tab does too). Due-date chip stays 🕐 on both surfaces.
- **Digest display tweaks.** (a) Multi-child notification title reads "12 classes need attention across 3 children" instead of the ambiguous "12 classes across 3 children". (b) Email attention rows are one line each now (`📕 Name · Class · 🕐 4/5`) instead of a 3-line stack. (c) Low-score attention items show both the grade *and* the due date. (d) Homework items now surface their due date next to the subject (`📖 Math · 🕐 4/19`); content stays on the following line when present. Dates use the compact `M/D` format matching the Today tab.
- **Digest fully mirrors the Today tab — no fetch-failure info anywhere.** The email and OS notification now behave like `StatusHero`: every child gets a hero row populated from the latest DB data (zeros when never scraped), with no mention of whether this cycle's scrape succeeded. The failure top strip, per-child "couldn't refresh" row, and OS "fetch failed" title branches are all gone. Layout is two stacked blocks — all hero rows first, then per-child detail sections (attention list + homework). Parents hunting for scrape failures use the error banner on the Today tab, not the email.
- **Email body mirrors the Today tab — per-child hero rows, every child included.** The aggregated family hero block at the top is gone; each child now gets its own rounded hero card in the email (green when caught up, amber when attention needed, red when TE couldn't refresh), matching `StatusHero`'s look. TE-failed children get a `{name}: couldn't refresh` title instead of being omitted — same parity with the Today tab. Meeting line is dropped for TE-failed children (stale data), but homework counts still render when the child has a homework URL configured.
- **Email per-child sections: tighter, icon-forward layout.** Failed-to-refresh children are now omitted from the body entirely (the failure top strip already names them — no redundant "Couldn't refresh — see top of email" block). Successfully-refreshed children skip the hero-summary repeat (class counts already live in the family hero at the top). Homework subsections only appear when the child has a homework URL configured — a child without one gets no homework heading, matching the Today tab. Attention rows and homework rows now render in a 3-line stack with emoji icons (`📕` missing, `📉` low-score, `🕐` due date, `📖` homework for today, `⏰` homework due today) matching the Today tab's visual style.
- **Hero block is now a fixed 4-line numeric summary.** The Today tab hero, the email family-hero block, and the OS notification body all render the same four lines per family / per child: `{child}: N classes need attention` · `N meeting` · `X homework for today` · `Y homework due today`. No more attention-class names cluttering the hero, no more "not assessed" aggregated in. Attention class names still live on the Classes tab + per-child email sections; this is just the hero.
- **Today tab — Homework split into two today-only sections (Phase 18 / Q28).** "Homework for today" (entries the teacher posted for today) and "Homework due today" (what's coming due right now) now render as two sibling sections, both strictly matched against today's local date. No more MAX(hw_date) carry-over, no today+tomorrow window. Weekend / no match shows a soft "No homework for today." / "Nothing due today." when you've configured a homework URL. If no URL is configured, the entire Homework area is hidden (absent ≠ empty). The detailed refresh email mirrors the same layout. "Tonight" phrasing retired across the board.

### Fixed
- **Family hero names the child when only one child was refreshed successfully.** On cycles where some children's scrapes fail (e.g., missing credentials) and only one child has fresh data, the email's family hero now prefixes that child's name — so "Ivy: 3 classes need attention · 5 meeting" instead of an anonymous "3 classes need attention." OS notification title gets the same treatment. Also fixes a double-count where TE-failed children's stale homework rows were still included in the family "N homework items today" tally — now only successfully-refreshed children contribute to any family count.
- **Hero "meeting" count no longer double-counts attention classes.** A class that TeacherEase labels "meeting" *and* our engine flags for attention (e.g., has a missing assignment) now counts only once — as attention — so the hero's attention + meeting numbers add up to the total class count, matching what the Classes tab shows.

### Changed
- **Unified refresh-digest notification (Phase 17 / Q27).** Notifications are no longer a per-child, per-event fan-out. After every refresh cycle — manual or auto — the app now dispatches exactly one `refreshDigest` event covering the whole family. The OS channel renders a hero-level summary (`TeacherEase Parent Companion: N classes across M children`, or leading with failures when present); the email channel renders a detailed per-child body (hero line · attention list filtered by the configured window · tonight's homework = today + tomorrow in local time) with a top strip listing any scrape failures. Failed-TE children are excluded from hero totals so "0 need attention" can't be confused with "we don't know." Settings → Notifications + Settings → Email collapse their three per-event toggles into one "Refresh digest" switch per channel; the "Send test" buttons now fire a synthetic digest through the real channel so the preview matches what a real refresh would produce.

### Added
- **Appearance — theme picker (Light / Dark / System).** Settings → Appearance tab with a three-option toggle. System mode follows the OS's color-scheme preference live.
- **Appearance — theme profile library.** Choose from 5 curated palettes (Default / Solarized / Nord / Dracula / High contrast), each with light + dark variants. Orthogonal to the mode toggle — pick a profile, then pick light/dark/system.
- **Appearance — font size.** Small / Medium / Large presets (100% / 115% / 130%) plus a custom % input (50–200%) that scales the entire UI — text, icons, spacing, borders — proportionally. Small matches the existing baseline.
- **Attention — unified engine.** A single app-owned attention layer (missing + low-score, with a 2-week forgiveness window and configurable threshold) replaces the portal's ad-hoc "Needs Attention" column across the dashboard hero, child tabs, Classes list, Today's Attention section, and the standards drilldown. TeacherEase's M / P / B / PS rollup still drives the "Meeting" display separately.
- **Attention — Settings sub-tab.** New Settings → Attention panel with two Enter-or-blur numeric inputs: forgiveness window (weeks, 1–12, default 2) and low-score threshold (0.0–4.0, default 3.0). Includes a read-only icon reference legend.
- **Classes drilldown — one icon per assignment state.** Every assignment row in the standards tree now shows a leftmost icon reflecting its state (missing / low-score / meeting / not-graded, each with within-window vs aged-out variants). Matches the Today tab's missing icon for visual consistency.
- **Unified page chrome (Phase 16).** Every top-level route (Today / Classes / History / Settings / About) now renders a sticky `PageHeader` at the top of its scroll column with the route title plus optional actions and sub-tabs, all in one cohesive block that stays visible while the body scrolls. Settings sub-tab nav pins beneath its title; dashboard's Refresh button and "Checked Xm ago" timestamp pin too.
- **Sidebar child selector.** When 2+ children exist, the sidebar shows a "Viewing" list between primary nav (Today / Classes / History) and utility nav (Settings / About). Selected child gets a filled dot + bold name; unselected children fade to 60%. Selection persists across app launches via a new `ui.selectedChildId` setting.
- **Settings → Children — full edit form.** Click Edit on any child row to modify name, TeacherEase email, password, and homework URL. Login validation + Google Sites shape-check run on Save, same as Add. Password field is blank by default and only overwrites the keychain entry when you type a new one; otherwise the stored password is used for login validation silently.
- **Add/Edit child — homework URL pre-validation.** Before saving, the URL must parse + match `https://sites.google.com/` + return a page with the Google Sites content structure. Catches pasted-wrong-URL at the moment of entry instead of silently ignoring it later.
- **Settings → Notifications — Send test notification button.** Fires an OS-level desktop notification directly through `tauri-plugin-notification`, bypassing the scrape pipeline and the per-event toggles. Useful for confirming the OS is actually delivering notifications to this app without having to trigger a real refresh cycle.

### Changed
- **Softened default palette.** Light mode reads as warm off-white instead of pure white; dark mode reads as warm slate instead of pure black. Typography and layout unchanged.
- **Sidebar stays visible when scrolling.** Navigating through long pages (Classes drilldown, Settings panels) no longer scrolls the sidebar off the top. The content column scrolls internally while the sidebar + page header stay pinned.
- **Uniform low-score styling.** The score badge in Today's Attention section no longer switches to amber for very-low scores — all below-threshold items now use the same muted color. The amber attention signal comes from the row styling + icon, not the badge color.
- **Aged-out items visually quiet down.** Missing and low-score items past the forgiveness window render in muted colors across both Today's Attention section and the Classes drilldown — instead of screaming amber at work that's no longer actionable.
- **Child selection moved out of the page body (Q26).** The in-body ChildTabs pill is gone; who-you're-viewing is now a sidebar context selector. A filled dot marks the selected child; attention signals live on the Today hero + Classes tab, not on the selector.
- **History drops the Scrapes sub-tab.** History is now a single Homework view. The underlying `fetch_runs` table stays populated for the "last refreshed" timestamp and the 6h auto-refresh logic — it just isn't exposed as a sub-tab anymore.
- **Homework empty state on History** now points parents at Settings → Children to configure a Google Sites URL when none is set, instead of a generic "No homework yet."
- **Settings → Children — delete flow.** Clicking the trash icon swaps the row into an inline confirmation panel with explicit Remove + Cancel buttons, instead of a browser `confirm()` dialog. The trash icon is always visible (previously only appeared on hover).
- **Login error messages** now name TeacherEase explicitly: "Couldn't log in to TeacherEase. Double-check your email and password." Transport failures (offline, DNS) say "Couldn't reach TeacherEase. Check your internet connection." instead of WebKit's raw `TypeError: Load failed`.

### Fixed
- **Keychain now actually persists passwords.** The `keyring` Rust crate was silently falling back to an in-memory stub (MockCredential) because no platform backend feature was enabled — `keychain_set` appeared to succeed while `keychain_get` always returned empty. Every scrape after add-child failed with "No stored password." Fixed by explicitly turning on `sync-secret-service` / `apple-native` / `windows-native` features so the crate routes to the real OS keychain on each platform. This was a would-have-shipped production bug.
- **Refresh scrapes every child, not just the currently-selected one.** Parents with multiple children were only getting data for whichever row they last tapped in the sidebar; the other children stayed stale forever unless you remembered to select each one and click Refresh. Refresh now iterates the full children list sequentially, isolating per-child failures (one child's bad credentials doesn't block the others' scrapes).
- **Today tab no longer shows empty grades when a child's latest scrape was homework-only.** The "latest fetch_run" lookup used to return any run regardless of source or status — so a successful homework scrape made grades / attention / class details appear empty (they're keyed to teacherease runs). The lookup now filters by source + success status for data queries; the "Checked Xm ago" timestamp still reflects the most recent attempt of any kind.
- **Attention list deduplicates.** TeacherEase's data model lets a single assignment hang under multiple standards. The attention engine previously pushed one item per occurrence, producing duplicate rows in the Today attention section (with a React key-collision warning). Now deduped by `(class, testNameId)` — one row per unique assignment.
- Dark-mode readability: the per-child "N classes need attention" banner now uses the regular foreground color over its translucent amber tint, instead of a hardcoded dark text color that disappeared in dark mode.
- Theme profile picker no longer uses the native `<select>`, which rendered its dropdown in system colors and hid options in dark mode. Replaced with an inline stack of profile rows that honor the current theme.
- **"Load failed" on Linux.** WebKitGTK blocks cross-origin fetches from the webview, which silently broke TeacherEase login + homework URL validation in the shipped app on Linux. All scraper HTTP now routes through `tauri-plugin-http` (Rust `reqwest`) with a narrow allowlist for `*.teacherease.com` and `sites.google.com`. Unit tests unchanged; they run in Node and already bypass webview CORS.
- **Today tab stale data on child switch.** When switching to a child with no scrape yet, grades/assignments/class details from the previously-selected child used to leak through. Now the tab clears to a clean empty state until the first scrape runs.
- **New child auto-selected after add.** The sidebar highlights the newly-added child immediately and Today scopes to them, instead of staying on the previously-viewed child.

## [0.1.0] — YYYY-MM-DD

First public release.

### Added
- **TeacherEase portal scraping** — login + grade overview + per-class detail pages via plain `fetch` + `cheerio`. No headless browser.
- **Local-only storage** — SQLite for grades/assignments/homework, OS keychain (Windows Credential Manager / macOS Keychain / Linux Secret Service) for portal passwords and SMTP credentials.
- **Desktop sidebar shell** — Today / Classes / History / Settings / About routes, with window + sidebar state persistence across launches.
- **Today view** — Status Hero (family-wide verdicts across all children), ChildTabs, Attention section (missing work + low scores grouped by urgency), Recent Activity diffs ("Since last check"), Homework card.
- **Classes view** — per-class grade progress bars, instructor, status-history dots, and one-at-a-time accordion drilldown with the full standards tree.
- **History view** — sub-tabs for Homework (past days) and Scrapes (fetch_runs with duration and status).
- **Homework scraping** — parses Google Sites teacher pages; stores the current month's entries keyed by `(child_id, hw_date, subject)`.
- **Multi-child support** — switch children via ChildTabs; Settings → Children lets you add/remove with live login validation.
- **First-run wizard** — 4 screens, all skippable, with live portal-login validation before advancing.
- **Unified fetch pipeline** — every scrape writes a `fetch_runs` row; `FetchRunner` orchestrates multiple `FetchSource`s (TeacherEase + Homework) with per-source error isolation.
- **NotifyRouter** — pluggable notification channels. Events: `gradesAttention`, `newHomework`, `fetchFailed`.
- **OS notifications** — per-event toggles in Settings → Notifications (defaults: grade changes + new homework on; fetch failures off).
- **Email reports** — optional BYO SMTP channel with per-event HTML + plaintext multipart templates and a Send-test-email button in Settings → Email. Gmail App Password tutorial at `/gmail-app-password`.
- **Auto-start** — enabled by default; user-toggleable in Settings → Advanced.
- **Tray icon** — Open / Refresh / Quit menu; left-click reopens the window.
- **Internal scheduler** — auto-refresh on window open if last scrape > 6h old.
- **Settings → Advanced** — Start-on-login toggle, Check-for-updates toggle, Clear history button.
- **Auto-update via `tauri-plugin-updater`** — non-intrusive "update available" banner in the sidebar shell. Checks the GitHub latest-release JSON feed once per 24h. "Install" downloads and relaunches; dismissing remembers the version so the banner stays hidden until a newer release lands.
- **Signed update payloads** — minisign keypair; public key baked into the app, private key in GitHub Actions secrets.
- **GitHub Actions release workflow** — on `v*` tag push, builds + signs bundles for Linux, Windows, macOS-arm64, and macOS-x64 and publishes a draft GitHub Release with `latest.json`.
- **Structured logging** — `tauri-plugin-log` with file + stdout + webview targets; DEBUG in dev, INFO in release. View-logs button in Settings → About.

### Security
- Credentials never stored in plaintext files or the SQLite database. The OS keychain is the only persistent home.
- Scraper module is pure TypeScript with no Tauri imports — portable, sandboxed, unit-testable against committed HTML fixtures scrubbed of PII.
- Every Tauri command validates its inputs.
- Updater payloads must be signed by the project's private key; corrupted or unsigned downloads are rejected before install.

### Known issues
- First launch on Windows triggers SmartScreen and on macOS triggers Gatekeeper — OS code signing is deferred. Walkthroughs are planned for a subsequent release (`docs/first-launch-*.md`).
- Homework fetch failures persist to `fetch_runs` without a UI toast — check Settings → History → Scrapes to see them.
- Classes view sub-tab state and Settings sub-tab state reset to default when navigating away; URL-backed tab state is a planned polish task.

### Privacy & responsible use
- 100% local. No telemetry, no accounts, no cloud services. The only outbound traffic is (1) your login to TeacherEase, (2) your child's grade pages, (3) optional SMTP to your own server if email reports are configured, (4) GitHub for update checks.
- Full disclaimer + responsible-use policy: [DISCLAIMER.md](DISCLAIMER.md).

[Unreleased]: https://github.com/autumnfallenwang/teacherease-parent-companion/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/autumnfallenwang/teacherease-parent-companion/releases/tag/v0.1.0
