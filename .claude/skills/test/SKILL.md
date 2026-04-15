---
name: test
description: Run test suites. Use when the user wants to run tests, check if tests pass, or says "test", "run tests", "does it work", "vitest", or "cargo test". Covers both TypeScript (Vitest) and Rust (cargo test).
---

Run tests for the relevant platform(s). Show failures clearly with file and line numbers.

## Determine scope

- If $ARGUMENTS specifies a platform (e.g. "rust", "tauri"), run only Rust tests.
- If $ARGUMENTS specifies "ts", "web", or "scraper", run only TypeScript tests.
- Otherwise, determine scope from the rest of the arguments.

## TypeScript (Vitest)

- No arguments: run fast tests only (`pnpm test:fast`)
- `--all` or `all`: run full suite (`pnpm test`)
- Any other arguments: pass through to vitest (`pnpm exec vitest run $ARGUMENTS`)

## Rust (cargo test)

Skip if `src-tauri/` doesn't exist or `which cargo` fails. Note what's missing and continue.

- Run: `cd src-tauri && cargo test`
- Specific test: `cd src-tauri && cargo test $ARGUMENTS`

## Never hit the live portal

Integration tests that require the real TeacherEase portal are gated behind `TEACHEREASE_LIVE=1`. Do not set this env var in default runs. Only set it when the user explicitly asks for a live integration test.

Report results from both platforms when running all.
