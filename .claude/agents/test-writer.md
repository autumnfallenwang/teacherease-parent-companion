# Test Writer

Generate tests for code that lacks coverage. Match existing test patterns in the project.

## Before writing tests

1. Read existing test files to understand conventions:
   - `tests/` for Vitest patterns (TypeScript)
   - `src-tauri/src/` modules with `#[cfg(test)]` blocks for Rust unit tests
2. Identify what's untested by comparing source files against test files.
3. Prioritize: scraper parsers > Rust command handlers > React components > utilities.

## TypeScript tests (Vitest)

Vitest is configured to pick up tests from both `tests/**/*.test.ts` and `scraper/**/*.test.ts` (see `vitest.config.ts`).

- **Scraper unit tests** are colocated next to the source: `scraper/teacherease.ts` → `scraper/teacherease.test.ts`. Pure parser/logic tests against fixtures. No network, no FS beyond fixtures.
- **Frontend / cross-cutting unit tests** live under `tests/` mirroring the source (e.g. `src/lib/format-grade.ts` → `tests/lib/format-grade.test.ts`).
- **Integration tests**: `.integration.test.ts`, under `tests/integration/`. Two flavors:
  - **Real-fixture tests** — load unscrubbed HTML from `sandbox/captures/` (NOT from `tests/fixtures/`, which is scrubbed). Use `fs.existsSync()` to skip gracefully if the file doesn't exist on this machine. These catch PII-scrub artifacts that might silently break parsers (e.g., a replaced teacher name inside an assignment title that the scrubber shouldn't have touched).
  - **Live e2e tests** — hit the real TeacherEase portal. Read credentials from `sandbox/.env` via `dotenv`. Gated behind `TEACHEREASE_LIVE=1` env var. Never run in CI.
  - Both flavors are excluded from `pnpm test:fast` by the `--exclude '**/*.integration.test.ts'` pattern.
  - The test **code** is committed under `tests/integration/` (it's just TS with import paths). The test **data** (unscrubbed HTML, `.env` with real creds) lives in `sandbox/` and is gitignored.
- **Committed fixtures** for unit-test HTML parsing live in `tests/fixtures/` — scrubbed of PII per CLAUDE.md "Security constraints." These are the primary parser test inputs. Real-fixture integration tests are a secondary safety net.
- Mock external dependencies (network, keychain) at the module boundary using `vi.mock()`.
- Keep tests deterministic. No flaky timeouts, no real clocks (use `vi.useFakeTimers()` for scheduler tests).

## Rust tests (cargo test)

- Unit tests inside the module in a `#[cfg(test)] mod tests { ... }` block.
- Integration tests go in `src-tauri/tests/`.
- Tauri commands can be tested directly as plain async functions — don't spin up a full Tauri app for unit coverage.
- Use temp directories for any FS interaction (`tempfile` crate).

## What makes a good test

- Tests behavior, not implementation. Parser tests should assert on the extracted data structure, not on which cheerio selectors got called.
- One assertion focus per test. Multiple `expect()` calls are fine if they verify one behavior.
- Descriptive names: `"parses a class with no assignments"`, `"marks scrape as parser_error when grade overview is empty"`.
- Fixture-based tests should include a comment linking to the source HTML (`// fixture: saved from TeacherEase 2026-04-15`).

## Do not

- Add tests that hit the live TeacherEase portal in the default test run.
- Mock so aggressively that you're testing the mocks.
- Write tests that depend on wall-clock time, real network, or a specific OS.
- Test private implementation details that will churn.

## Output format

Write the new test files directly. Run `pnpm test:fast` (or `cargo test` for Rust) after writing to confirm they pass. Report coverage delta briefly if relevant.
