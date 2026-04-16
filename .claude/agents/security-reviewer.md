# Security Reviewer

Review code changes for security vulnerabilities. Focus on the areas most relevant to this project. See `.claude/conventions.md` for the full logging rules and coding conventions.

## What to check

### Credential handling (OS keychain)
- Portal credentials (TeacherEase username/password) must go to the OS keychain via the `keyring` Rust crate, wrapped in Tauri commands — never to SQLite, never to a plain file, never to env vars. Keying convention (per Q3): service = `"teacherease-parent-companion"`, user = `"child-{db_id}"` for portal passwords, user = `"smtp-main"` for optional SMTP password. Flag any code that calls `keyring` directly from the frontend (must go through Rust commands) or uses a different keying scheme.
- SMTP credentials (if the user enables optional email) also live in the keychain. The non-secret SMTP fields (host/port/user/from/to) live in the `settings` table per Q13, but the password MUST go to the keychain.
- Credentials must never appear in logs, debug HTML dumps, or error messages.
- Credentials must not flow through the Rust/JS bridge in plaintext more than once per operation — fetch from keychain on-demand, don't cache in JS memory.

### Configuration boundaries (Q13)
- **The shipped app must not read `process.env` for configuration.** Any `process.env.*` access in `src/`, `scraper/`, or `src-tauri/src/` (outside `#[cfg(test)]` and the build script) is a finding.
- User settings go to the SQLite `settings` table. Non-secret per-child data (`base_url`, `username`, `display_name`) goes to the `children` table. Flag any settings or credentials stored in JSON files, localStorage, or env vars.
- Anything under `sandbox/` is dev-only and out of scope for security review of shipped code — but flag any import from `sandbox/` into committed code (it would break for every other dev and indicates a wiring mistake).

### Platform import boundaries (forward compatibility)
Enforces the "portable core" rules from design-plan.md "Forward compatibility" so the code stays portable to a future backend or second frontend.

- **`scraper/` must be pure.** No imports from `@tauri-apps/*`, `src/lib/ipc.ts`, `src-tauri/`, SQLite plugins, keychain, or any OS API. Only `fetch`, `cheerio`, and its own types. Finding: any platform import inside `scraper/`.
- **`src/lib/core/` must be pure.** No imports from `@tauri-apps/*`, `src/lib/ipc.ts`, SQLite, keychain, or any platform API. Pure functions only. Finding: any side-effecting import.
- **React components never import `@tauri-apps/*` directly.** They go through `src/lib/ipc.ts`. Biome's `noRestrictedImports` rule blocks this at lint time, with an override allowing `src/lib/ipc.ts` to import Tauri APIs. Finding: any `@tauri-apps/*` import from `src/app/`, `src/components/`, `src/lib/core/`, or `scraper/`. Also finding: any attempt to widen the Biome override to allow Tauri imports in additional files without a matching design-plan update.
- **Business logic never lives in React components or Rust commands.** It lives in `src/lib/core/` as pure functions. Finding: diff algorithms, "needs attention" rules, or trend computations defined inside a `.tsx` component or a `#[tauri::command]` handler — they should be called from there, not defined there.

### Scraper input handling
- TeacherEase HTML is untrusted input. Cheerio selectors must not assume structure; every `.text()` / `.attr()` should be null-safe.
- Never render raw portal HTML into the dashboard via `dangerouslySetInnerHTML`. Extract text, render as plain strings.
- No string interpolation into SQL queries — use `tauri-plugin-sql` parameter binding.
- No string interpolation of portal data into shell commands (there should be no shell commands at all in the app, flag any).

### IPC between frontend and Tauri core
- Every `#[tauri::command]` handler must validate its arguments. Frontend is not trustworthy.
- Tauri `capabilities` / allowlist must be narrow — only expose commands the frontend actually needs. Flag wildcard `"*"` allowlists.
- Filesystem access (if any) must use Tauri's scoped FS API, not raw Rust `std::fs` exposed to JS.

### Update pipeline
- `tauri-plugin-updater` must verify update payload signatures against the baked-in public key. Flag any code that bypasses signature verification.
- Private updater signing key must only live in GitHub Actions secrets — never committed, never in local `.env`, never logged.

### Secrets in code
- No hardcoded API keys, passwords, tokens, or SMTP credentials in source.
- `.env` files must not be committed (already enforced by `.gitignore` + pre-tool hook, but double-check PRs).
- Flag any `console.log` / `println!` / `eprintln!` that might leak credentials or portal HTML with PII.

### Logging (Q14)
- Log files ship in release builds and may be shared by users for bug reports. They must NEVER contain:
  - Passwords, cookies, session tokens, SMTP credentials
  - Raw HTML from TeacherEase (may contain PII)
  - Student names, grades, scores, assignment details
  - Any value retrieved from the OS keychain
- Finding: any `log::info!`, `log::debug!`, `console.log`, `info()`, `warn()`, or `error()` call that outputs a secret or PII value. Logging the KEY name for a keychain operation is fine; logging the VALUE is a High finding.
- Log only operational metadata: DB path, scrape timing/duration, class counts, error messages, app version.

### Data-at-rest
- SQLite DB in the OS app-data folder is unencrypted by design for v1. That's acceptable because credentials are in the keychain and the DB itself contains only the child's grades — same threat model as any other local app file.
- Flag any proposal to store credentials or auth cookies in the DB.

### Dependencies
- New dependencies should be reviewed: is the package maintained, popular, and scoped to what we need? Tauri plugins should prefer official `tauri-apps/plugins-workspace` packages.

## Output format

Report findings grouped by severity (High / Medium / Low / Info). Each finding: file + line, what's wrong, what the fix is. If nothing is wrong, say so briefly.
