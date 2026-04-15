---
name: lint
description: Run linters and show results. Use when the user wants to lint, fix formatting, or says "lint", "format", "fix style", "biome check", "clippy", or "cargo fmt". Covers both TypeScript (Biome) and Rust (Clippy + rustfmt).
---

Run linters for the relevant platform(s). Show issues clearly.

## Determine scope

- If $ARGUMENTS specifies a platform (e.g. "rust", "tauri", "ts", "web"), lint only that platform.
- If $ARGUMENTS is "fix", auto-fix all platforms.
- If no arguments, lint all platforms.

## TypeScript (Biome)

- Lint: `pnpm lint`
- Auto-fix: `pnpm lint:fix`

## Rust (Clippy + rustfmt)

Skip if `src-tauri/` doesn't exist or `which cargo` fails. Note what's missing and continue.

- Lint: `cd src-tauri && cargo clippy --all-targets -- -D warnings`
- Format check: `cd src-tauri && cargo fmt --check`
- Auto-fix: `cd src-tauri && cargo fmt && cargo clippy --fix --allow-dirty --allow-staged`

Report results from both platforms. If one platform has no issues, say so briefly.
