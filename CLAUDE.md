# TeacherEase Parent Companion

Cross-platform desktop app that monitors a child's TeacherEase portal and notifies parents. Local-only, no accounts, no cloud.

## Stack

Tauri 2 (Rust shell, native OS webview) | Next.js (App Router, static export) + React + TypeScript | `fetch` + `cheerio` scraper bundled into the frontend | SQLite (`tauri-plugin-sql`) — credentials + settings live here per Q34 (keychain code retained but dormant for rollback) | Biome + Vitest | `tauri-plugin-updater`

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
- `pnpm bump <semver>` — edit the three version files in sync (`package.json` / `Cargo.toml` / `tauri.conf.json`). See [docs/releasing.md](docs/releasing.md).
- `cd src-tauri && cargo fmt` / `cargo clippy` / `cargo test` — Rust side

## CI + release (one-line summary)

- `.github/workflows/ci.yml` — runs on every push to `main` and every PR: `pnpm lint` + `pnpm typecheck` + `pnpm test` + Rust `fmt`/`clippy`/`test`. No bundler. Feature-branch pushes (no PR) skip CI entirely.
- `.github/workflows/auto-release.yml` — runs on every push to `main`: detects whether the version was bumped in that push; if not, auto-bumps patch + commits the bump back; then tags `v<version>` and invokes `release.yml`.
- `.github/workflows/release.yml` — reusable build workflow called by auto-release (or triggered directly by a `v*` tag push). Builds + minisign-signs all 4 platforms, creates a **draft** GitHub Release.

Full runbook: [docs/releasing.md](docs/releasing.md).

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
- [docs/releasing.md](docs/releasing.md) — release runbook (auto-release workflow, Path A auto patch bump / Path B explicit bump, signing, smoke-test checklist)
- [docs/updater-signing.md](docs/updater-signing.md) — minisign keypair + GH secret setup for the updater
- [docs/first-launch-windows.md](docs/first-launch-windows.md) + [docs/first-launch-macos.md](docs/first-launch-macos.md) — user-facing install walkthroughs (SmartScreen / Gatekeeper)
- [.claude/rules/conventions.md](.claude/rules/conventions.md) — coding conventions (logging levels, import rules, error handling, naming). Auto-loaded by Claude Code.

## Predecessor

Rewrite of [`teacherease_parents_helper`](https://github.com/autumnfallenwang/teacherease_parents_helper) (Python + Playwright + cron). Local reference copy at `ref/teacherease_parents_helper/` (gitignored, not committed) — mine HTML fixtures from `ref/teacherease_parents_helper/logs/` and cross-check parser logic against `ref/teacherease_parents_helper/src/`.
