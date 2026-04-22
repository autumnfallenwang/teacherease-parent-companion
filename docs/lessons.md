# Lessons

Corrections and patterns to avoid repeating. Append entries here whenever a user correction or a failed assumption would otherwise get lost.

## Format

```
## YYYY-MM-DD — Short title
**Context:** what we were doing
**Mistake:** what we assumed or did wrong
**Correction:** what the right thing is
**How to avoid next time:** the rule to apply
```

---

<!-- Entries below, newest first. -->

## 2026-04-21 — `window.confirm` is silently suppressed in Tauri release webviews on macOS

**Context:** Phase 27 shipped a simplified "Reset app" button using `window.confirm` for its destructive confirmation. Local release build on macOS 26 / M4: clicking the button produced *no* dialog, *no* action, *no* log entry — nothing at all. The handler runs, hits `if (!ok) return;` with `ok` falsy, and returns silently. The underlying `resetAllAppData` was wired correctly; the bug was just that the confirmation never happened.

**Mistake:** I treated `window.confirm` as a reasonable lowest-effort confirmation UX. The codebase already had a data point against this pattern — `docs/backlog.md` D-07 explicitly migrated a Settings → Children delete-confirm off `window.confirm` onto an inline panel back in 2026-04-18, calling the browser modal "a dialog that breaks the app's visual language and can't be styled." I read this as a cosmetic complaint and kept `window.confirm` in the Reset handler. It's not cosmetic — at least on macOS release builds, some webview configurations fully **suppress** `window.confirm`, returning a falsy value with no dialog ever drawn. Which means every gate behind `window.confirm` silently does nothing, with no error, no log, and no visible feedback.

**Correction:** Replaced `window.confirm` with the same inline destructive-tinted panel pattern D-07 used for child deletion — a `confirmingReset` state flips the danger-zone content between the normal "Reset app" row and an inline panel with explicit Reset + Cancel buttons. Same visual language as the rest of the app, same state machine, and crucially it actually renders and responds to clicks.

**How to avoid next time:**
1. Don't use `window.confirm`, `window.alert`, `window.prompt`, or `beforeunload` in Tauri webviews. Assume they're a no-op in release. Build confirmation into the app UI with an inline panel or shadcn `Dialog`.
2. Backlog / lessons entries that call out a pattern as "breaks the app's visual language" are worth taking seriously even when they sound cosmetic — they often encode a real bug the author didn't fully articulate. Re-read them before repeating the pattern.
3. When a click produces *no log* at all, the handler didn't reach its logging lines. Don't assume the handler ran and quietly failed — it more likely bailed at the first gate.
4. Smoke test destructive actions on a **release build**, not just dev mode. Webview behavior diverges between them (different CSP, different dialog handling, different error surfacing).

## 2026-04-21 — Unsigned apps + macOS keychain ACL = per-read prompt storm

**Context:** First real-world install of v0.1.2 on an Apple Silicon Mac. Q3 had locked OS keychain as the credential store with the confident claim "On macOS and Windows: zero prompts, ever." Within minutes of adding a child and clicking "Fetch", macOS started throwing the "confidential information in keychain" unlock dialog on every `keychain_get` call. Even after clicking "Always Allow", the prompt returned on the very next fetch. One scheduled fetch logged a 194-second duration because the process was blocked waiting on the dialog while the user was away.

**Mistake:** Q3 assumed keychain would be transparent for users. That's true for **code-signed** apps — macOS's keychain ACL pins the "Always Allow" grant to the caller's code signature, and a stable signature (Apple Developer ID cert) makes future reads silent. For **unsigned** apps, macOS ad-hoc-signs each build with a random hash, so "Always Allow" binds to a signature that changes every rebuild. The shipped binary is ad-hoc-signed by definition (Q9 defers paid signing past v1), so keychain was never going to be silent.

**Correction:** Q34 moves credentials into SQLite (plaintext, protected by home-dir permissions) and leaves the keychain code in place but dormant. If we ever ship a signed build (either $99/yr Apple Developer ID or a Boston Identity LLC team slot), flipping the 8 call sites in `ipc.ts` back restores keychain storage. See design-plan.md Q34 for the full threat-model justification.

**How to avoid next time:**
1. "Zero prompts" claims for OS-mediated permission systems (keychain, notifications, Full Disk Access, Accessibility, Screen Recording) only hold for **signed** apps on Apple platforms. Always check whether the permission is signature-pinned before committing to it as a UX-transparent store.
2. Before relying on any macOS permission claim, do a full install-and-use session on a fresh user on real hardware — not just `pnpm tauri:dev`. Dev-mode behavior diverges in signing, code caching, and TCC prompts.
3. When evaluating "encrypt it locally with a key we derive from X" proposals, remember: if the app can access X unattended for scheduled work, any process running as the user can access X the same way. There's no middle-tier between "plaintext + home-dir perms" and "real code signing + OS-mediated vault."
4. Document threat models explicitly in the design decision (who can read this, under what conditions) so the tradeoff is auditable later.

## 2026-04-17 — Seed script must populate `_sqlx_migrations` or runtime migrations collide

**Context:** Dev workflow — `pnpm seed` creates the DB with the final schema directly via `SCHEMA_SQL`. User ran `pnpm tauri:dev` and saw `while executing migration 3: error returned from database: (code: 1) duplicate column name: homework_url`, which killed the app at launch.

**Mistake:** The seed script was producing a DB with the correct *schema* but without telling the Tauri runtime's migrator that any migrations had run. At launch, sqlx saw `_sqlx_migrations` either missing or partial (only versions 1–2 were tracked on an older DB), looked at `migrations.rs`, and tried to apply the next migration. Migration 3's `ALTER TABLE children ADD COLUMN homework_url TEXT` failed because the column already existed (seed had put it there). SQLite doesn't support `ADD COLUMN IF NOT EXISTS`, so this is fatal.

**Correction:** The seed script now includes a `recordMigrations(db)` step that parses `src-tauri/src/migrations.rs` with a regex, extracts each `Migration { version, description, sql: r#"…"# }` block, computes SHA-384 of the raw SQL bytes (matching sqlx's own checksum algorithm), and inserts one `_sqlx_migrations` row per version marked as successfully applied. `--reset` now also drops `_sqlx_migrations` so stale rows don't collide when `migrations.rs` is edited.

**How to avoid next time:**
1. Any script that materializes schema outside the Tauri runtime must also manage `_sqlx_migrations`. That table is the runtime's source of truth for "what migrations ran"; skipping it means the runtime will try to re-apply everything.
2. The sqlx checksum is SHA-384 of the raw migration SQL string (UTF-8 bytes, no framing). Match it exactly, byte-for-byte, or the runtime fails the checksum verification.
3. When editing `migrations.rs`, remember that `pnpm seed --reset` now reads that file at seed time — keep the file's regex-extractable shape (`version: N, description: "…", sql: r#"…"#, kind: …`).
4. If a migration absolutely has to be idempotent against partially-applied state (e.g., for users with manually-edited DBs), prefer `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`. SQLite does NOT support `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, so column additions can only be safe the first time they run.

## 2026-04-15 — TeacherEase login is NOT classic ASP.NET WebForms

**Context:** T8 — writing the login flow. Design-plan Q1 warned about the ASP.NET `__VIEWSTATE` / `__EVENTVALIDATION` two-step dance as the "known caveat" of the fetch+cheerio approach.

**Mistake:** I assumed the login form would be classic WebForms postback with `ctl00$MainContent$txtEmail`-style field names, a `__VIEWSTATE` blob, and a `__EVENTVALIDATION` token. I also guessed the login URL was `/common/LoginParent.aspx`.

**Correction:** Captured the real login page via `sandbox/capture-login-page.ts`. The form is a **regular HTML form with CSRF protection**, not WebForms postback:
- GET URL is `/common/login.aspx` (lowercase, not `LoginParent.aspx`).
- POST action is `/app/Login/Login` (completely different path from the GET).
- Credential field names are the obvious `email` and `password` — not `ctl00$...`.
- Hidden fields are `ctlTE$TEContentPlaceHolder$__AntiCsrfToken` (CSRF, per-request), `fromResetPassword`, `LoginRequestID` (per-request GUID), `requestedServerApiVersion`, `targetPage`.
- No `__VIEWSTATE` or `__EVENTVALIDATION` anywhere on the login page.

The **grade pages may still be ASP.NET WebForms** — to verify in T9 when we actually fetch `grades-page.html` from the live portal. Q1's caveat might still apply there. Login is definitively NOT WebForms.

**How to avoid next time:**
1. Never guess server protocol shapes. Capture a real response and inspect it before writing the code — a 5-minute POC saves hours of wrong-path coding.
2. Don't conflate "the site is ASP.NET" with "every form is WebForms postback." Modern ASP.NET apps mix WebForms, MVC, and plain HTML forms on different pages of the same site.
3. When porting from a Playwright-based reference, the reference tells you almost nothing about the HTTP shape — Playwright abstracts away the form mechanics entirely. Treat the Python code as documentation of *intent* (what to scrape, what to parse), not *mechanism* (how to send it over the wire).

## 2026-04-16 — tauri-plugin-sql uses appConfigDir, not appDataDir

**Context:** Seed script writes dummy data to SQLite, but the dashboard shows empty state — no children found.

**Mistake:** Assumed `sqlite:app.db` in tauri-plugin-sql resolves to `appDataDir` (`~/.local/share/<id>/`). Wrote the seed script to that path.

**Correction:** `tauri-plugin-sql` stores the DB in `appConfigDir` (`~/.config/<id>/` on Linux). Two `app.db` files existed — one seeded (wrong path), one used by the app (empty). The logging system (Q14) revealed this: startup log showed `data dir: ~/.local/share/...` but the sqlx queries showed DB operations in `~/.config/...`.

**How to avoid next time:** Always check the actual path by reading the startup log or using `find ~ -name "app.db" -path "*teacherease*"`. Don't assume which Tauri directory a plugin uses — different plugins use different base directories.

## 2026-04-15 — WebKitGTK on Linux needs GPU workarounds for Tauri dev

**Context:** First `pnpm tauri dev` run — window opens but renders completely white.

**Mistake:** Assumed `pnpm tauri dev` would just work after installing `webkit2gtk-4.1` system deps.

**Correction:** Two issues:
1. **Wayland protocol error** — WebKitGTK crashes on native Wayland. Fix: `GDK_BACKEND=x11` forces XWayland.
2. **GBM buffer allocation failure** — WebKitGTK can't create GPU rendering buffers, so the webview paints nothing. Fix: `WEBKIT_DISABLE_DMABUF_RENDERER=1` disables DMA-BUF rendering and falls back to a compatible path.

Both env vars are baked into `pnpm tauri:dev` so they don't need to be typed manually. These are Linux-specific — macOS and Windows don't need them.

**How to avoid next time:** On Linux with Wayland + WebKitGTK, always set `GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1` for Tauri dev. Check the window renders content before writing any UI code.

## 2026-04-15 — Next.js dynamic import with ssr:false needed for Tauri APIs

**Context:** Dashboard page imports `@tauri-apps/api/core` and `@tauri-apps/plugin-sql` via `src/lib/ipc.ts`. Page renders white.

**Mistake:** Imported Tauri APIs at the top level of a page component. Next.js dev server does SSR even for `"use client"` components — the server-side render tries to execute `@tauri-apps/api` which fails because there's no Tauri runtime on the server.

**Correction:** Move all Tauri-dependent code into a separate component (`src/components/dashboard.tsx`), then load it in `page.tsx` with `next/dynamic` + `ssr: false`. This ensures Tauri APIs only execute in the webview, never during SSR.

**How to avoid next time:** Any component that imports from `@/lib/ipc` (which imports `@tauri-apps/*`) must be loaded with `ssr: false` in a Next.js App Router page. Direct top-level imports of ipc.ts from page.tsx will always break SSR.

## 2026-04-15 — Fixtures from ref/logs are NOT from the same scrape session

**Context:** T9/T10 — writing grade overview and class detail parsers. Tests compared parser output against `full-data.json` expecting them to match.

**Mistake:** Assumed that `grades-page.html`, the 6 `*_details.html` files, and `full-data.json` in `ref/teacherease_parents_helper/logs/` were all from the same scrape run and would therefore agree on class lists, statuses, and missing-assignment counts.

**Correction:** The Python scraper overwrites its `logs/` files on every run. `grades-page.html` is from a LATER session than `full-data.json` — different classes (Computer Science 7 + Music 7 instead of Art 7 + Health Education 7), different instructor list (Zides, Lee not in the original scrub mapping), different status codes. The class detail fixtures are also from a different session — French 7 has 6 standards / 2 missing (fixture) vs 5 standards / 1 missing (full-data.json).

**How to avoid next time:**
1. Never assume files captured independently are from the same scrape. Verify by comparing class names, counts, and timestamps across all fixtures before asserting against "expected" output.
2. Build the PII scrub mapping from ALL fixtures, not just one JSON summary — different scrapes may have different instructors.
3. When writing parser tests, assert against values you've VERIFIED from the actual fixture HTML, not against a separate "expected" file that might be from a different session. `full-data.json` is a structural reference (what the output SHAPE should look like), not a ground-truth oracle for specific values.
