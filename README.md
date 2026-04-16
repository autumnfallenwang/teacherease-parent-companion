# TeacherEase Parent Companion

A cross-platform desktop app that keeps track of your child's grades and homework from TeacherEase. Everything stays on your computer — no accounts, no servers, no cloud.

> **Status:** early development. See `docs/design-plan.md` for architecture and locked decisions.

## What it does

- Checks your child's TeacherEase portal in the background every few hours.
- Sends a desktop notification when there's a new missing assignment or a low score.
- Shows a dashboard with grades, homework, and trends over time.
- Supports multiple children in one install.
- Optional email reports via your own SMTP account (advanced setting).

## Platforms

- Windows 10/11 (x64)
- macOS 12+ (Apple Silicon; Intel builds available but less tested)
- Linux x64 (AppImage and .deb)

## Privacy & data handling

- **100% local.** All data stays on your computer. No cloud, no servers, no accounts with us.
- Portal credentials are stored in your operating system's keychain (Windows Credential Manager, macOS Keychain, Linux libsecret) — never in plain files.
- Grade and homework data is stored in a local SQLite database in your OS app-data folder.
- The only network calls the app makes are: (1) logging into TeacherEase with **your** credentials, (2) reading **your child's** grade pages, (3) optional SMTP sending if you enable email reports, and (4) checking GitHub for app updates.
- No telemetry, no analytics, no tracking, no third-party services.
- Your child's data is never sent anywhere except TeacherEase itself (where it already lives) and optionally your own SMTP server.
- This app exercises the same access a parent has when logging into TeacherEase in a web browser — no additional data is accessed, no security boundaries are crossed.

## Responsible use

This app is designed to be a respectful, lightweight client for TeacherEase:

- **Lightweight.** Each check consists of a small number of page requests (1 login + 1 grades overview + detail pages only for classes that need attention). Equivalent to a parent opening the portal in a browser.
- **No bulk scraping.** The app only accesses data for children whose credentials the parent has explicitly provided. It does not enumerate other students, classes, or schools.
- **Identifiable.** The app sends a descriptive User-Agent header so the TeacherEase team can identify it and contact the developer if needed.
- **Open source.** The complete source code is available for inspection. There is no hidden behavior.

## Download

Pre-built installers are published on the [Releases page](https://github.com/autumnfallenwang/teacherease-parent-companion/releases) once v1 is available.

Because the v1 builds are unsigned, Windows SmartScreen and macOS Gatekeeper will show a warning on first launch. Step-by-step instructions for bypassing these warnings are in `docs/first-launch.md` (coming soon).

## Tech stack

- **Desktop shell:** [Tauri 2](https://tauri.app/) (Rust core + native OS webview)
- **Frontend:** Next.js (static export) + React + TypeScript
- **Scraper:** `fetch` + `cheerio` (plain HTTP, no headless browser)
- **Storage:** SQLite via `tauri-plugin-sql`
- **Credentials:** OS keychain via the `keyring` Rust crate (Keychain / Credential Manager / Secret Service)
- **Updater:** `tauri-plugin-updater` with signed update payloads

## Predecessor

This project is a rewrite of [`teacherease_parents_helper`](https://github.com/autumnfallenwang/teacherease_parents_helper), a Python + Playwright + cron script the author built as a personal tool. That project remains functional for server-side use; this one targets non-technical parents on desktop.

## Disclaimer

This is an unofficial tool — **not** affiliated with TeacherEase or Common Goal Systems Inc. Full disclaimer, privacy notice, and responsible-use policy: **[DISCLAIMER.md](DISCLAIMER.md)**.

The same text is shown inside the app (wizard welcome screen + Settings → About). The single source of truth for all legal text is [`src/lib/legal.ts`](src/lib/legal.ts).

## License

MIT — see [LICENSE](LICENSE).
