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

## Privacy

- Portal credentials are stored in your operating system's keychain (Windows Credential Manager, macOS Keychain, Linux libsecret).
- All grade and homework data stays in a local SQLite database on your computer.
- The only network calls the app makes are: (1) logging into TeacherEase, (2) optional SMTP sending if you enable email, (3) checking GitHub for updates.
- No telemetry, no analytics, no third-party services.

## Download

Pre-built installers are published on the [Releases page](https://github.com/autumnfallenwang/teacherease-parent-companion/releases) once v1 is available.

Because the v1 builds are unsigned, Windows SmartScreen and macOS Gatekeeper will show a warning on first launch. Step-by-step instructions for bypassing these warnings are in `docs/first-launch.md` (coming soon).

## Tech stack

- **Desktop shell:** [Tauri 2](https://tauri.app/) (Rust core + native OS webview)
- **Frontend:** Next.js (static export) + React + TypeScript
- **Scraper:** Node `fetch` + `cheerio` (plain HTTP, no headless browser)
- **Storage:** SQLite via `tauri-plugin-sql`
- **Credentials:** OS keychain via the `keyring` Rust crate (Keychain / Credential Manager / Secret Service)
- **Updater:** `tauri-plugin-updater` with signed update payloads

## Predecessor

This project is a rewrite of [`teacherease_parents_helper`](https://github.com/autumnfallenwang/teacherease_parents_helper), a Python + Playwright + cron script the author built as a personal tool. That project remains functional for server-side use; this one targets non-technical parents on desktop.

## License

MIT — see [LICENSE](LICENSE).
