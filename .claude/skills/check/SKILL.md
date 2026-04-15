---
name: check
description: Run lint + test + type-check in sequence. Use when the user wants to validate code, run all checks, verify everything passes, or says "check", "run checks", "does it pass", or "validate". Covers both TypeScript and Rust.
---

Run all checks and report results. Stop on first failure.

## Determine scope

- If $ARGUMENTS specifies a platform (e.g. "rust", "tauri", "ts"), run checks for only that platform.
- If $ARGUMENTS is "fast" or "all", it controls test depth (passed to `/test`).
- If no arguments, default to fast tests across all platforms.

## TypeScript checks

1. Run `/lint`
2. `pnpm exec tsc --noEmit`
3. Run `/test` — pass $ARGUMENTS through (e.g. `/check fast` → `/test fast`, `/check all` → `/test all`)

## Rust checks

Skip if `src-tauri/` doesn't exist or `which cargo` fails. Note what's missing and continue with TS checks only.

1. Run `/lint rust` (clippy handles type-check + lint in one pass; no separate `cargo check` needed)
2. Run `/test rust`

If no arguments provided, default to fast tests.
