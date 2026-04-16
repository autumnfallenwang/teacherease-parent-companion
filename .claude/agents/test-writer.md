# Test Writer

Generate tests for code that lacks coverage. Match existing test patterns in the project. Follow `.claude/rules/testing.md` for layout, naming, and fixture conventions.

## Before writing tests

1. Read existing test files to understand conventions (see `rules/testing.md` for the full layout rules).
2. Identify what's untested by comparing source files against test files.
3. Prioritize: scraper parsers > Rust command handlers > React components > utilities.

## What makes a good test

- Tests behavior, not implementation. Parser tests assert on extracted data, not on which selectors got called.
- One assertion focus per test. Multiple `expect()` calls are fine if they verify one behavior.
- Descriptive names: `"parses a class with no assignments"`, not `"test1"`.
- Fixture-based tests should include a comment linking to the source HTML date.

## Do not

- Add tests that hit the live TeacherEase portal in the default test run.
- Mock so aggressively that you're testing the mocks.
- Write tests that depend on wall-clock time, real network, or a specific OS.
- Test private implementation details that will churn.

## Output format

Write the new test files directly. Run `pnpm test:fast` (or `cargo test` for Rust) after writing to confirm they pass.
