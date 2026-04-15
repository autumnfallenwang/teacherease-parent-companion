# TeacherEase Parent Companion

Cross-platform desktop app that monitors a child's TeacherEase portal and notifies parents. Local-only, no accounts, no cloud.

## Stack

Tauri 2 (Rust shell, native OS webview) | Next.js (App Router, static export) + React + TypeScript | Node scraper via `fetch` + `cheerio` | SQLite (`tauri-plugin-sql`) | OS keychain (`tauri-plugin-stronghold` / `keytar`) | Biome + Vitest | `tauri-plugin-updater`

## Structure (planned)

- `src/` — Next.js frontend (pages/components/hooks)
- `src-tauri/` — Rust shell, `tauri.conf.json`, `Cargo.toml`, plugin wiring
- `src-tauri/sidecar/` or `scraper/` — TypeScript scraper module (TeacherEase HTTP client + HTML parser)
- `docs/` — design docs and decision log
- `.claude/` — agents, hooks, skills for this project

## Commands (planned, once scaffolded)

- `pnpm dev` — `tauri dev` (Next.js + Tauri window with hot reload)
- `pnpm build` — `tauri build` (produces per-OS installers in `src-tauri/target/release/bundle/`)
- `pnpm lint` / `pnpm lint:fix` — Biome check / auto-fix
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` — Vitest full suite
- `pnpm test:fast` — Vitest unit tests only
- `cd src-tauri && cargo fmt` / `cargo clippy` / `cargo test` — Rust side

## Key constraints

- **No Playwright / headless browser.** Scraper uses plain HTTP only.
- **No server, no cloud, no accounts.** Everything local.
- **No OS-level code branches** — per-OS behavior lives inside Tauri plugins.
- **Unsigned binaries in v1.** First-launch Gatekeeper/SmartScreen warnings are documented, not avoided.

## Docs

- [docs/design-plan.md](docs/design-plan.md) — design plan, locked decisions, data model, build phases
- [docs/progress.md](docs/progress.md) — current task tracker
- [docs/lessons.md](docs/lessons.md) — corrections and patterns to avoid repeating

## Predecessor

Rewrite of [`teacherease_parents_helper`](https://github.com/autumnfallenwang/teacherease_parents_helper) (Python + Playwright + cron). Reference copy at `../ref/teacherease_parents_helper/` during development.
