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

## 2026-05-05 — Async `listenTauriEvent` inside `useEffect` needs a `cancelled` re-check after the await (StrictMode safety)
**Context:** Phase 31 / B-20 — `Schedulers` component registers Tauri event listeners (`scheduler:fetch-tick`, `scheduler:notify-tick`, `tray-refresh`) inside its top-level `useEffect`. Initial impl awaited `listenTauriEvent(...)` and stored the unlisten function in a closure variable, returning that variable's call from the cleanup function. Looked correct, type-checks fine.
**Mistake:** In dev (Next.js defaults to React StrictMode), `useEffect` runs twice: mount → cleanup → re-mount. Because `listenTauriEvent` is async, the first mount's `await` resolves *after* its cleanup function has already run. The `unlisten` variable assignment happens too late — cleanup saw `null` and did nothing. Result: two live listeners after StrictMode settles. Smoke test caught it: scheduled notify fired once on the Rust side but the cycle ran twice (two emails). Production wasn't affected (StrictMode is dev-only) but the dev experience was broken.
**Correction:** Pattern for async listeners inside `useEffect`:
```ts
useEffect(() => {
  let unlisten: (() => void) | null = null;
  let cancelled = false;
  void (async () => {
    const fn = await listenTauriEvent(event, handler);
    if (cancelled) fn();      // cleanup already ran — unlisten immediately
    else unlisten = fn;       // safe to store
  })();
  return () => {
    cancelled = true;
    if (unlisten) unlisten();
  };
}, []);
```
The `if (cancelled) fn()` after each `await` is the load-bearing line.
**How to avoid next time:**
1. Any async resource registration inside `useEffect` (not just Tauri events — also `addEventListener`, observers, sockets, anything that returns an unsubscribe handle from a Promise) needs the `cancelled` re-check pattern.
2. If smoke testing reveals a "fires twice" bug in dev that isn't reproducible in production, suspect StrictMode + async first.
3. Don't disable StrictMode to "fix" the symptom — the real bug would still exist in any environment that mounts→unmounts→re-mounts (which can also happen with route changes, hot reload, suspense, etc.).

---

## 2026-05-05 — `tauri-plugin-sql` (v2.4.0) doesn't expose its sqlx pool to native Rust code
**Context:** Phase 31 planning — wanted the Rust scheduler worker to read cadence settings (`fetch.runsPerDay`, `notify.firstSlotAt`, etc.) directly from the SQLite DB so it could compute next-fire times without involving the webview.
**Mistake:** Assumed `tauri-plugin-sql`'s `DbInstances` (which is `pub`) exposed a usable handle to the underlying `Pool<Sqlite>`.
**Correction:** It doesn't. The accessor methods on `DbPool` (`sqlite()`, `mysql()`, `postgres()`) are commented-out in v2.4.0 source — only the JS-side `select` / `execute` commands can speak to the pool. From Rust, the pool is opaque.
**How to avoid next time:**
1. When deciding "should this Rust code read from the DB directly?", first check whether the plugin's pool accessor is actually public. Comment-blocks at the source level look like real API in `cargo doc` but won't compile.
2. Architectural workaround when it's not exposed: keep the data flow webview → invoke command → Rust (don't reverse it). For Phase 31, this meant TS computes next-fire via existing cadence math and passes Rust just a wall-clock timestamp — much simpler than a DB read on the Rust side.
3. Alternative if Rust really needs DB access: open a second `sqlx`/`rusqlite` connection to the same SQLite file (works fine with WAL mode, which `tauri-plugin-sql` uses). Costs duplicate connection management and you'd need to coordinate with the plugin's migrations runner, but it's a valid escape hatch when the architecture demands native DB access.

---

## 2026-05-04 — "Curated" tokens aren't automatically better than hand-tuned ones — taste is the variable
**Context:** D-22 / Phase 29 swapped 5 theme profiles' hand-tuned OKLCH values for "curated" sources: shadcn/ui Stone (default), canonical Solarized/Nord/Dracula hex (named profiles), WCAG-AAA neutral (contrast). Pitch was "stop hand-tuning, adopt presets verbatim — they're tuned by people who do this for a living, less work, more coherent." Shipped in v0.1.6, user reviewed in prod, reported "looks bad" → reverted in full before v0.1.7.
**Mistake:** Treated "curated by an established palette author" as a proxy for "the user will like it." The user's complaint that motivated D-22 ("not sharp and comfortable") was assumed to mean "your hex values are off, fix them with better hex values." It actually meant "I don't currently know what I want, but I'd like to try alternatives." Those are different requests. Curated presets answer the first; the second needs a tuning loop with the user in front of the running app.
**Correction:** Reverted Phase 29 via `git revert -m 1` of the merge commit. Backlog entry flipped to `rejected`, not `open` — re-attempting the same "swap to canonical hex" approach without a tuning loop will produce the same result. Future token work should start with Radix Colors ramps (rigorous and composable, less aesthetically opinionated) or tweakcn (interactive, lets the user dial in directly), not another verbatim canonical-hex paste.
**How to avoid next time:**
1. When the user says "looks not right" about something subjective (color, type, spacing, motion), do not assume they have a specific better target in mind. Ask first: "Do you want me to try a specific alternative, or iterate with you in front of the app?"
2. "X is curated by reputable maintainers Y" is not evidence the user will prefer X. It's evidence X is internally consistent. The user's preference is independent.
3. Aesthetic decisions need a real-time loop. CSS-only swaps are cheap to ship but expensive to revert if the user only sees them after release. For subjective work, ship to a feature flag or a side-by-side preview before main, not directly to production.
4. Mark a swap as `rejected` (not `open` again) when it's been tried and the user explicitly didn't like the result — the open/rejected distinction matters for future-you deciding whether to retry.

## 2026-05-04 — When migrating an IPC API, grep the file you're "migrating" before declaring it done
**Context:** Phase 28 / D-21 — replaced hand-rolled `JsonFileLogger` with `tauri-plugin-log`. Plan said "update `src/lib/ipc.ts` log wrappers to re-export plugin functions" and I did exactly that — the four public exports (`log` / `logWarning` / `logErr` / `initLogging`) at lines 1169-1187 now route through `pluginInfo` / `pluginWarn` / `pluginError`. All checks green: typecheck clean, 303 tests passed, `cargo clippy -D warnings` clean. Dev build started fine. Then user clicked "Fetch now" and **every** fetch failed with `Command log_info not found`.
**Mistake:** I assumed `ipc.ts` only used the logging API through its own public wrappers. It didn't. Eight other functions inside the same file (`addChild`, `removeChild`, `updateChildIdentity`, `setHomeworkUrl`, `persistTeacherEaseData`, `homework persist`, `resetAllAppData`) called `await invoke("log_info", { message: ... })` *directly* — bypassing the public wrapper, talking straight to the now-deleted Tauri command. The grep would have caught it: `grep '"log_info"' src/lib/ipc.ts` showed 8 hits I never ran.
**Correction:** Replaced all 8 internal sites with `pluginInfo(...)` / `pluginError(...)` (matching the public wrappers' new shape). Confirmed via `grep -nE '"log_info"|"log_warn"|"log_error"' src/` returning zero matches before re-testing. Fetch + notify pipeline then ran clean.
**How to avoid next time:**
1. When migrating any IPC command (`invoke("X", ...)` → something else), run `grep -rn '"X"' src/` BEFORE writing the plan, and again BEFORE running checks. The list of call sites is the plan's scope.
2. "ipc.ts is the wrapper" is a convention, not a guarantee. Files with helper wrappers can still have direct `invoke()` calls scattered through individual command exports — they accumulate when someone writes "I need a log line right here" and reaches for `invoke()` instead of the public `log()`.
3. `pnpm check` won't catch this class of bug. The deleted Tauri command is a *runtime* error, not a typecheck error — TS doesn't know the Rust side dropped it. Manual smoke test is the only catch. Always exercise the migrated path end-to-end in dev before marking the task done.
4. If your migration plan says "delete the `X` command", the grep for the *string* `"X"` (with quotes) across the whole repo is non-negotiable. Not just imports — every literal-string call site.

## 2026-05-04 — "Decoupled" Q-decisions can mean code-level OR action-level — they're different
**Context:** Planning B-19 (notify cycle reads stale DB). Q29 says "fetch and notify are decoupled" with point 5 explicitly stating "notify reads DB, may be silently stale, this is intentional." I read this as a hard contradiction with B-19's fix (fetch-then-notify) and surfaced it as a Q-decision conflict needing supersedence.
**Mistake:** Treated "decoupled" as one indivisible claim. Assumed fixing B-19 required fully overturning Q29's decoupling.
**Correction:** User clarified the framing — schedulers stay decoupled at the **code level** (two independent `ScheduleLoop` instances, separate persistence keys, separate Q31 N×/day knobs), but the notify *action* can still coordinate fetch-then-dispatch. These are different layers; only point 5 (the action-level "silently stale OK" claim) needed superseding. Q35 was written to make this distinction explicit.
**How to avoid next time:** When a Q-decision uses words like "decoupled," "independent," "separate," "isolated" — break the claim apart by layer (code structure / data flow / runtime ordering / user-facing model) before treating it as a single unit. A Q can be locked at one layer and revisable at another. Ask the user which layer they meant before proposing a full supersedence.

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

## 2026-05-22 — Scraper fetch had no timeout; scheduled digests stalled for hours

**Context:** B-22 wall-clock scheduler. The 3:15 PM digest on 2026-05-22 sent at 4:36 PM instead. Log review found `fetch: complete source=teacherease durationMs=4871727` (81 min) — and scanning all retained logs found 25 scrapes that ran 2 min – 18 hours.

**Mistake:** `tauriFetch` in `ipc.ts` was `(url, init) => pluginFetch(url, init)` — no timeout. When TeacherEase accepts the TCP connection but never sends a response (intermittent, ~1-2 days in 10 by the user's account, but the logs show it far more often), the scraper `fetch()` hangs indefinitely. The native Rust scheduler fires on time, but the scrape+diff+send pipeline runs in the webview, so a stalled fetch silently delays the whole digest. App Nap / minimized-window suspension inflates the wall-clock `durationMs` further on the worst cases (>60 min).

**Correction:** Added `src/lib/fetch/with-timeout.ts` — a pure `withTimeout(fetchImpl, ms)` decorator using `AbortController` (60s default). `plugin-http` honors `RequestInit.signal` end-to-end (`fetch_cancel` on the Rust side), so the stalled request is genuinely cancelled. `tauriFetch` is now `withTimeout((url, init) => pluginFetch(url, { connectTimeout, ...init }))`. `connectTimeout` only caps the TCP-connect phase — it does NOT cover the response-wait, which was the actual failure mode, so the AbortController guard is the real fix.

**How to avoid next time:**
1. Every network call needs an explicit timeout. `connectTimeout` ≠ a request timeout — it only covers connect, not the response body wait.
2. Wrap injected `FetchImpl`s at the single chokepoint (`tauriFetch`) so login + grades + homework are all covered at once.
3. When a scheduled job "doesn't fire," check `durationMs` on the preceding fetch before assuming the scheduler failed — the scheduler firing on time tells you nothing about whether the webview-side work completed.
