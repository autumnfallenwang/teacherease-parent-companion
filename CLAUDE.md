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

## Security constraints (non-negotiable)

- **Never put real credentials, real portal URLs, real student names, real teacher names, or any real PII in the codebase.** This includes source, tests, fixtures, config files, comments, commit messages, and docs. Use dummy values for all smoke tests and unit tests: `test@example.com` / `hunter2`, `https://school.example.teacherease.com`, `"Test Student"`, `"Instructor Name"`, etc.
- **HTML fixtures must be scrubbed before committing.** Before any file from `ref/teacherease_parents_helper/logs/` or a live capture lands in `tests/fixtures/`, replace student name, teacher names, school name, subdomain, and any email addresses with dummy values. Class names like "English 7" are fine.
- **Live-credential work belongs in `sandbox/`.** Anything that touches a real TeacherEase account — POC scripts, end-to-end tests, debug captures, throwaway spikes — goes under `sandbox/`, which is gitignored. Never commit, never upload, never include in a PR.
- **`.env` files are never committed.** Only `.env.example` at repo root with dummy values. A real `.env` belongs in `sandbox/.env` (gitignored). The pre-tool hook blocks `.env*` edits and `check-secrets.sh` blocks them at commit time — treat those as safety nets, not primary defenses.
- **The shipped app reads NO env vars for configuration** (design-plan Q13). All runtime config flows through UI → SQLite (`settings` table for user settings, `children` table for per-child data) or OS keychain (for secrets). If you find yourself writing `process.env.WHATEVER` in `src/`, `scraper/`, or `src-tauri/src/`, stop and route it through SQLite/keychain instead.
- **Credentials belong in the OS keychain at runtime** (design-plan Q3), never in SQLite, env files, or JS memory beyond one operation.
- **Never log secrets or PII** (design-plan Q14). Log files ship in release builds and may be shared for bug reports. Never log: passwords, cookies, session tokens, SMTP credentials, raw HTML from TeacherEase, student names, grades, scores, or assignment details. Log only operational metadata: DB path, scrape timing, class counts, error messages.
- **Legal disclaimer is shown in-app, not just the repo** (design-plan Q15). The single source of truth is `src/lib/legal.ts`. Update that file — the wizard, About page, `DISCLAIMER.md`, and README all reference it.

## Docs

- [docs/design-plan.md](docs/design-plan.md) — design plan, locked decisions, data model, build phases
- [docs/progress.md](docs/progress.md) — current task tracker
- [docs/lessons.md](docs/lessons.md) — corrections and patterns to avoid repeating
- [.claude/conventions.md](.claude/conventions.md) — coding conventions (logging levels, import rules, error handling, naming). Follow when writing code.

## Predecessor

Rewrite of [`teacherease_parents_helper`](https://github.com/autumnfallenwang/teacherease_parents_helper) (Python + Playwright + cron). Local reference copy at `ref/teacherease_parents_helper/` (gitignored, not committed) — mine HTML fixtures from `ref/teacherease_parents_helper/logs/` and cross-check parser logic against `ref/teacherease_parents_helper/src/`.
