# Security Rules

## Credentials & keychain

- Credentials ONLY in OS keychain, never in SQLite, env files, plaintext, or JS memory beyond one operation.
- Keychain keying convention: service = `"teacherease-parent-companion"`, user = `"child-{id}"` for portal passwords, `"smtp-main"` for SMTP password.
- SMTP credentials in keychain. Non-secret SMTP fields (host/port/user/from/to) in SQLite `settings` table.
- Fetch credentials on-demand from keychain, never cache in JS memory across operations.

## PII in codebase

- Never put real credentials, real portal URLs, real student/teacher names, or any real PII in source, tests, fixtures, config, comments, commit messages, or docs.
- Dummy values for all non-sandbox code: `test@example.com` / `hunter2` / `https://school.example.teacherease.com` / `"Test Student"` / `"Instructor Name"`.
- HTML fixtures must be scrubbed before committing — replace student name, teacher names, school name, subdomain, email addresses with dummy values.
- Live-credential work ONLY in `sandbox/` (gitignored). Never committed, never uploaded, never in a PR.
- `.env` files never committed. Only `.env.example` at repo root with dummy values.

## Shipped app constraints

- The shipped app reads NO `process.env` for configuration. All runtime config flows through UI → SQLite / OS keychain.
- Configuration splits into 5 categories: baked-in constants (`scraper/constants.ts`), per-child data (`children` table), secrets (keychain), user settings (`settings` table), dev-only env (`sandbox/.env`).

## Input handling

- Cheerio selectors must be null-safe — every `.text()` / `.attr()` should handle null/undefined.
- Never render raw portal HTML via `dangerouslySetInnerHTML`. Extract text, render as plain strings.
- No string interpolation into SQL queries — use `tauri-plugin-sql` parameter binding (`$1`, `$2`).

## Tauri security

- Every `#[tauri::command]` handler must validate its arguments. Frontend is not trustworthy.
- Tauri capabilities/allowlist must be narrow. No wildcard `"*"` permissions.
- Filesystem access (if any) must use Tauri's scoped FS API, not raw Rust `std::fs` exposed to JS.

## Legal

- Legal disclaimer single source of truth: `src/lib/legal.ts`. Update that file — wizard, About page, DISCLAIMER.md, and README all reference it.
