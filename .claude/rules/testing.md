# Testing Rules

## File layout

- Scraper unit tests colocated: `src/lib/scraper/teacherease.ts` → `src/lib/scraper/teacherease.test.ts`
- Frontend / cross-cutting unit tests under `tests/` mirroring source: `src/lib/format-grade.ts` → `tests/lib/format-grade.test.ts`
- Integration tests: `.integration.test.ts` under `tests/integration/`
- Rust unit tests: inline `#[cfg(test)] mod tests { }` inside the module
- Rust integration tests: `src-tauri/tests/`

## Fixtures

- Committed fixtures in `tests/fixtures/` — scrubbed of PII per security rules.
- Always work from `tests/fixtures/` during development. Never hit the live portal.
- If no fixture exists, mine from `ref/teacherease_parents_helper/logs/` or ask the user to capture.
- Never guess server protocol shapes — capture a real response and inspect before writing parser code.

## Integration tests

- Real-fixture tests load unscrubbed HTML from `sandbox/captures/`, skip gracefully with `fs.existsSync()` when files are missing. A skip is NOT a failure.
- Live e2e tests read credentials from `sandbox/.env`, gated behind `TEACHEREASE_LIVE=1` env var. Never run in CI.
- Default `pnpm test` and `pnpm test:fast` never hit the live portal.

## Practices

- Mock external dependencies (network, keychain) at the module boundary using `vi.mock()`.
- Keep tests deterministic — no flaky timeouts, no real clocks. Use `vi.useFakeTimers()` for scheduler tests.
- Tauri commands are testable as plain async functions — don't spin up a full Tauri app for unit coverage.
- Use temp directories for any FS interaction (`tempfile` crate in Rust).
- Test behavior, not implementation. Parser tests assert on extracted data, not on which selectors got called.
- Descriptive test names: `"parses a class with no assignments"`, not `"test1"`.
