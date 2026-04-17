# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
