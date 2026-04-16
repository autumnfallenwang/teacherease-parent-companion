# TeacherEase Parent Companion

Cross-platform desktop app that monitors a child's TeacherEase portal and notifies parents. Local-only, no accounts, no cloud.

## Stack

Tauri 2 (Rust shell, native OS webview) | Next.js (App Router, static export) + React + TypeScript | `fetch` + `cheerio` scraper bundled into the frontend | SQLite (`tauri-plugin-sql`) | OS keychain via `keyring` Rust crate (wrapped in Tauri commands) | Biome + Vitest | `tauri-plugin-updater`

## Structure

- `src/` — everything that ships: Next.js pages (`app/`), React components (`components/`), hooks (`hooks/`), and all non-React logic (`lib/`)
- `src/lib/ipc.ts` — Tauri bridge: ONLY file with `@tauri-apps/*` imports
- `src/lib/scraper/` — pure TS scraper module (login, parsers, types). No Tauri imports, no platform code.
- `src/lib/core/` — pure TS business logic (diff, attention rules, trends)
- `src-tauri/` — Rust shell (separate program, fixed by Tauri convention)
- `tests/` — non-shipped test infrastructure (fixtures, integration tests)
- `docs/` — design docs and decision log
- `.claude/` — agents, hooks, skills for this project
- `sandbox/` — gitignored scratch space for POCs and live-credential smoke tests (see "Security constraints" below)

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

## Security & coding rules

All detailed rules live in `.claude/rules/` (auto-loaded each session):
- **[rules/security.md](.claude/rules/security.md)** — credentials, keychain, PII, fixtures, never-commit, input handling
- **[rules/conventions.md](.claude/rules/conventions.md)** — logging, imports, naming, errors, Tauri/Next.js, commits, scraper dev
- **[rules/testing.md](.claude/rules/testing.md)** — test layout, fixtures, integration patterns, mocking

## Docs

- [docs/design-plan.md](docs/design-plan.md) — design plan, locked decisions, data model, build phases
- [docs/progress.md](docs/progress.md) — current task tracker
- [docs/lessons.md](docs/lessons.md) — corrections and patterns to avoid repeating
- [.claude/rules/conventions.md](.claude/rules/conventions.md) — coding conventions (logging levels, import rules, error handling, naming). Auto-loaded by Claude Code.

## Predecessor

Rewrite of [`teacherease_parents_helper`](https://github.com/autumnfallenwang/teacherease_parents_helper) (Python + Playwright + cron). Local reference copy at `ref/teacherease_parents_helper/` (gitignored, not committed) — mine HTML fixtures from `ref/teacherease_parents_helper/logs/` and cross-check parser logic against `ref/teacherease_parents_helper/src/`.
