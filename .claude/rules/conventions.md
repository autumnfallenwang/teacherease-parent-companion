# Coding Conventions

Rules for writing code in this project. Referenced by the `dev-task` skill and `security-reviewer` agent. Follow these when implementing any task.

## Logging (Q14)

### When to log

| Event | Level | Example |
|---|---|---|
| App startup (version, paths, build mode) | `INFO` | `app_version=0.1.0` |
| Child add/remove | `INFO` | `addChild: id=3 name=Alex` |
| Scrape start | `INFO` | `scrape: started childId=1` |
| Scrape complete | `INFO` | `scrape: complete childId=1 duration=3200ms classes=8` |
| Scrape failed | `ERROR` | `scrape failed: Network error` |
| Keychain set/delete | `INFO` | `keychain_set key=child-1` |
| Keychain get | `DEBUG` | `keychain_get key=child-1 found=true` |
| Notification sent | `INFO` | `notification: sent attention=2 missing=1` |
| Notification permission denied | `WARN` | `notification: permission not granted` |
| DB queries (sqlx auto-logs) | `DEBUG` | Automatic via sqlx — no manual logging needed |
| Login validation attempt | `INFO` | `wizard: login validation started` |
| Login validation result | `INFO`/`ERROR` | `wizard: login validation succeeded` or `failed` |
| Child switch in UI | `INFO` | `dashboard: switched to childId=2` |
| Frontend initialized | `INFO` | `frontend logging initialized` |
| Plugin registration failures | `ERROR` | Automatic via Tauri — logged by the framework |

### Log format

**Rust:** `log::info!("operation key=value key2=value2");`
**TypeScript:** `await log("context: operation key=value");` (from `@/lib/ipc`)

Use `key=value` pairs for structured data. Prefix TS logs with the component context (`dashboard:`, `wizard:`, `settings:`, `scrape:`).

### What level to use

| Level | When | Ships in release? |
|---|---|---|
| `ERROR` | Something failed that the user should know about | Yes |
| `WARN` | Something unexpected but recoverable (permission denied, retry) | Yes |
| `INFO` | Key lifecycle events (scrape start/end, child add/remove, app start) | Yes |
| `DEBUG` | Internal details useful for development (DB queries, keychain lookups, parser internals) | No (dev only) |

Rule of thumb: if you'd want to see it in a bug report from a parent, it's INFO. If you'd only want it while developing, it's DEBUG.

### Where to call the logger

| Layer | How to log | Import |
|---|---|---|
| **Rust** (`src-tauri/src/`) | `log::info!()`, `log::warn!()`, etc. | `use log;` (implicit via Cargo) |
| **TS components** (`src/components/`, `src/app/`) | `await log()`, `await logWarning()`, `await logErr()` | `import { log, logWarning, logErr } from "@/lib/ipc"` |
| **TS IPC layer** (`src/lib/ipc.ts`) | `await pluginInfo(message)` (and `pluginWarn` / `pluginError`) | Direct call into `@tauri-apps/plugin-log` (ipc.ts IS the wrapper). |
| **Scraper** (`src/lib/scraper/`) | **Do NOT log from here.** Scraper is a pure module with no Tauri imports. Log at the CALL SITE (dashboard, wizard) instead. |

### What to NEVER log

- Passwords, cookies, session tokens, SMTP credentials
- Raw HTML from TeacherEase (may contain PII)
- Student names, grades, scores, assignment details
- Any value retrieved from the OS keychain
- Email addresses (log "login validation started" not "login for user@email.com")

Logging the keychain KEY name (`child-1`) is fine. Logging the VALUE (the password) is a security finding.

## Import conventions

- `@tauri-apps/*` imports only allowed in `src/lib/ipc.ts` (enforced by biome `noRestrictedImports`)
- Scraper modules (`src/lib/scraper/`) must be pure — no Tauri, no IPC, no platform imports
- Business logic (`src/lib/core/`) must be pure — same rules as scraper
- React components import from `@/lib/ipc` for data, from `@/components/` for UI, from `@/lib/scraper/types` for types
- Use `@/` path alias for all imports from `src/`

## Error handling

- User-facing errors: plain language, no codes ("Couldn't log in. Double-check your email and password.")
- Log-facing errors: include the technical message (`scrape failed: Network timeout after 30s`)
- Always catch + log in async operations before re-throwing or displaying
- Use `LoginError` class for scraper errors, plain `Error` for everything else

## Naming

- Files: kebab-case (`cookie-jar.ts`, not `cookieJar.ts`) — enforced by biome
- Functions: camelCase
- Types/interfaces: PascalCase
- Constants: UPPER_SNAKE_CASE
- CSS classes: Tailwind utilities, no custom class names (use inline styles for one-offs)
- DB columns: snake_case (SQL convention)
- TS properties: camelCase (mapped from snake_case via row-mapping functions in ipc.ts)

## Tauri + Next.js integration

- Components that import from `src/lib/ipc.ts` (which imports `@tauri-apps/*`) must be loaded with `next/dynamic` + `ssr: false`. Direct top-level ipc imports from page.tsx break SSR.
- Pattern: page.tsx uses `dynamic(() => import("@/components/dashboard"), { ssr: false })`, the component itself is `"use client"`.
- Linux dev: always run with `WEBKIT_DISABLE_DMABUF_RENDERER=1 GDK_BACKEND=x11` (baked into `pnpm tauri:dev`).

## Scraper development

- Always work from saved HTML fixtures in `tests/fixtures/`, never hit the live portal during development.
- If no fixture exists, mine from `ref/teacherease_parents_helper/logs/` or ask the user to capture a fresh sample.
- Never guess server protocol shapes — capture a real response and inspect it before writing code. A 5-minute POC saves hours of wrong-path coding.
- Playwright-based reference code shows intent (what to scrape), not mechanism (how to send over the wire).

## Commits

- Stage specific files with `git add`, never `-A` — prevents accidentally committing secrets or debug HTML.
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Append to commit body: `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Never commit: `.env` (except `.env.example`), `*.db`, `*.sqlite`, debug HTML dumps, updater private keys.
