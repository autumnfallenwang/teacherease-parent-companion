# Backlog

Findings discovered via the walkthrough skill. One row per finding, grouped by type (`B-NN` bugs · `D-NN` design changes). Status cycles: `open` → `in-progress` → `done` (or `rejected` / `deferred`). Phase-sized work doesn't live here — it gets promoted to `docs/progress.md` instead.

---

## B-16 — About page shows hardcoded v0.1.0 instead of real app version
**Where:** `src/components/about-page.tsx:49` — the "Version X" line on the About card.
**Observed:** After updating via the in-app updater from v0.1.2 to v0.1.4, the About page still displayed "Version 0.1.0". Source of truth is `APP_VERSION = "0.1.0"` in `src/lib/legal.ts:5` — a hardcoded constant never updated by `pnpm bump`. The Settings → Advanced tab already uses the dynamic `getAppVersion()` (from `@tauri-apps/api/app`, sourced from `tauri.conf.json` at build time) and shows the correct version. About page just didn't adopt it.
**Proposed:** Use `getAppVersion()` in `about-page.tsx` same as `settings-advanced.tsx` does. Drop `APP_VERSION` from `legal.ts` entirely (no other callers) so there's one source of truth (the build-time version in `tauri.conf.json`).
**Status:** done

## B-17 — Binary name is literally "app" → macOS Login Items shows "app" with generic icon
**Where:** `src-tauri/tauri.conf.json` — the Tauri bundle config.
**Observed:** macOS System Settings → Login Items & Extensions → "App Background Activity" lists this app as "app — Item from unidentified developer" with the generic launchd icon. The installed binary is at `/Applications/TeacherEase Parent Companion.app/Contents/MacOS/app` — literally named `app` (Tauri's default binary name). macOS UIs that read the binary name fall back to that raw string, and the bundle icon doesn't register because the plist references the binary path not a proper bundle.
**Proposed:** Set `mainBinaryName = "teacherease-parent-companion"` in `tauri.conf.json`. Rebuilds will produce `.app/Contents/MacOS/teacherease-parent-companion` and macOS will pick up a friendlier name + the bundle icon (already committed in `src-tauri/icons/`). Doesn't affect the LaunchAgent plist we already wrote (that binds to an absolute path at registration time) — but the next autostart re-registration will use the new path, so users who update will get the friendlier label next time the autostart toggle is flipped. Unsigned status is unrelated and not fixed here.
**Status:** deferred — unblocks with a future commit; B-18 (icon redesign) addressed the more visible half of the complaint for now.

## B-18 — Default Tauri figure-8 icon replaced with custom pennant mark
**Where:** `src-tauri/icons/*` — every platform icon format.
**Observed:** Every Tauri-default app ships with the teal+yellow figure-8 logo, which (a) doesn't look like a real product and (b) is easy to confuse with other Tauri apps in the user's Dock/Login Items. The user asked for a simple, flat, one-concept replacement and specifically rejected cap/book/graduation metaphors as cliched.
**Proposed:** A pennant/flag glyph on an ivory rounded-square background. The pennant is both a clean silhouette at 32px and a subtle nod to the app's actual job (flagging assignments that need attention) without being literal about notifications. Single teal foreground color (matches the app's primary palette), single ivory background — no gradients, no extra accents. Add `scripts/gen-icon.mjs` that renders an inline SVG via `sharp` to `_source.png`, then `pnpm tauri icon` regenerates all 14 desktop variants (icns / ico / png / Square*.png / StoreLogo). SVG committed as the art source, PNG artifact gitignored.
**Status:** done

## B-19 — Notify cycle dispatches digest from stale DB data
**Where:** `src/components/shell/schedulers.tsx:47-52` — `runNotifyCycle()`.
**Observed:** The notify cycle calls `buildDigestFromDb()` directly, with no fetch step in front. The dispatched digest reflects whatever the *last fetch* persisted, which can be hours stale depending on how fetch slots align with notify slots. User-visible: "the email said no homework today, but my kid does have homework today." Affects both the scheduled notify tick (`schedulers.tsx:123`) and the manual `SEND_DIGEST_NOW_EVENT` path (`schedulers.tsx:148`) — same function, both stale. Independent of the cold-start fetch path (`schedulers.tsx:159-166`) and the dashboard Refresh button (`FETCH_NOW_EVENT`); those are unaffected.
**Proposed:** Insert `await runFetchCycle(children)` between `getChildren()` and `buildDigestFromDb()` in `runNotifyCycle`. `runFetchCycle` is already imported and used by the fetch loop — same persistence path. Failed children continue to surface correctly per Q27 (top strip leads with failure, excluded from hero counts) — no special handling needed. Add an INFO log line at the top of the function so the log shows fetch-then-notify ordering. Worst-case overlap (fetch slot = notify slot) costs one extra HTTP roundtrip per child, ~3-5 seconds; acceptable, optimize later if needed.
**Status:** done — superseded Q29 point 5 with new Q35 ("Notify tick fetches before dispatch"). `runNotifyCycle` now fetches before dispatch in both scheduled and "Send digest now" paths. Settings → Notifications → Schedule has an escape-hatch Switch ("Fetch latest data before sending digest", default on) backed by `notify.fetchBeforeDispatch` for parents who explicitly want the legacy DB-only behavior. Comment in `cycle.ts` updated to reflect the new contract.

---

## B-20 — Schedulers don't fire when window is unfocused (webview throttling)
**Where:** `src/lib/schedule/loop.ts:37` — `ScheduleLoop` uses `setTimeout` inside the webview. Callers: `src/components/shell/schedulers.tsx:111-139` (fetch + notify loops). Cadence math (`fetch-schedule.ts`, `notify-schedule.ts`) is fine and stays where it is.
**Observed:** Notify scheduled for 15:15 EDT didn't fire until 15:55 — exactly when the user re-focused the window. Log inspection: zero entries between 19:10 and 19:55 UTC, then a full notify cycle at 19:55:42. Confirms macOS / WebKit aggressively throttles or pauses webview JS timers when the Tauri window loses focus. The README note "it can sit in the background, no need to keep it focused" is wrong with the current implementation. The triage sweep ([Explore audit, 2026-05-05](#)) found this is the *only* critical case — other webview `setTimeout` calls in `settings-fetch.tsx` / `settings-notifications.tsx` / `settings-email-section.tsx` are UI-only (toast dismissal, "next run" display refresh) and degrade harmlessly. Cold-start stale-fetch (`schedulers.tsx:172-183`) already handles the >6h-offline case correctly. Update-check (`settings-advanced.tsx`) is event-driven (tab open), not periodic. SMTP send is already in Rust. Conclusion: only `ScheduleLoop` needs to move.
**Proposed:** Move the *timer* from the webview to Rust; keep the *work* (fetch/notify cycles, scraper) in TS. New Rust task in `src-tauri/` uses `tauri::async_runtime::spawn` + `tokio::time::sleep_until` to compute next-fire from settings (`fetch.runsPerDay` / `fetch.firstSlotAt` / `fetch.weekdaysOnly`, same keys for notify) read out of the existing `tauri-plugin-sql` settings table. When a tick fires, emit a Tauri event (`scheduler:fetch-tick` / `scheduler:notify-tick`) the webview listens for; webview handler calls existing `runFetchCycle()` / `runNotifyCycle()`. Webview `ScheduleLoop` is deleted. Settings-changed reactivity: webview emits `scheduler:reload-config` (or invokes a `reload_scheduler` command) when the user saves; Rust task re-reads settings and reschedules. Cold-start stale-fetch logic stays in the webview (it runs once at boot when the webview is foreground anyway). Lifecycle: Rust task starts in `setup()` and runs for the lifetime of the app process; cancellation channel for clean shutdown. New Q-decision (Q36) supersedes Q29's "two-loop architecture" location detail (loops still exist; they just live one layer down). README's "heads up" note loses the wrong claim. Effort ~3-4 hours: ~150 lines of Rust + 20-line webview shim + smoke test (schedule for 2 minutes from now, minimize, confirm log fires on time).
**Status:** done — shipped via Phase 31 on `feat/rust-scheduler-timer`. Two `tokio::time::sleep_until` workers in `src-tauri/src/scheduler.rs` replace the two webview `ScheduleLoop` instances. TS still owns cadence math (`computeFetchNextRun` / `computeNotifyNextRun`); webview computes the next fire and arms via the new `schedule_next_tick` Tauri command, then re-arms after each tick fires. Smoke-tested 2026-05-05: notify scheduled ~2 min ahead, window minimized to dock, Rust fired with **2 ms drift** of the target wall-clock time, full cycle ran, SMTP went out. One bonus dev-only fix surfaced mid-test: React StrictMode + async `listenTauriEvent` racing with the first-mount cleanup left duplicate listeners; patched by re-checking `cancelled` after each `await listenTauriEvent` in `schedulers.tsx`. Production never affected (StrictMode is dev-only).

---

## D-21 — Migrate logging to `tauri-plugin-log` (unified Rust + TS)
**Where:** `src-tauri/src/json_log.rs` (delete), `src-tauri/src/log_commands.rs` (delete), `src-tauri/src/lib.rs::run()` (replace logger init), `src/lib/ipc.ts` `log()` / `logWarning()` / `logErr()` (re-export plugin functions).
**Observed:** Hand-rolled `JsonFileLogger` works but has known limitations: no rotation (`app.log` already 6 MB after a few weeks of use), no panic capture, no runtime level override, no per-module filter, manual `[webview]` prefix hack instead of structured source field. Five next-step features all blocked on hand-extending the logger (~6-7 hours combined). Audit signals at 2/5 — foundation-becomes-ceiling (weak) + knowledge-isolation. Not actively bugging anyone today, but trajectory is "more rough edges land over time," and the dep is already in `Cargo.toml` (paid for, not used).
**Proposed:** Wire `tauri-plugin-log` with a custom JSON formatter preserving the existing line shape (`{"@timestamp", "level", "logger", "message", "app"}`) so old + new log lines coexist without breaking parsers. Delete `json_log.rs` and `log_commands.rs`; remove `log_info` / `log_warn` / `log_error` from the invoke handler. Webview routes through the plugin's built-in IPC; `ipc.ts` wrappers stay as a thin compatibility layer so component code doesn't change. Add `TPC_LOG_LEVEL` env var read at init for power-user debugging (default falls back to current dev=Debug / prod=Info rule). Rotation policy: 5 MB max, 5 retained = 25 MB worst case. Keep the "Open log folder" button in Settings → Advanced — that's the only log affordance any parent needs. **Do NOT expose log settings UI to end users** (per the Slack/1Password pattern, not the VS Code pattern — parents are non-technical, log-level dropdown would confuse without benefit). Effort ~3-4 hours.
**Status:** done — shipped via Phase 28. Single sink at `<appDataDir>/logs/app.log` preserved; JSON line shape (`@timestamp`/`level`/`logger`/`message`/`app`) preserved via custom formatter; `TPC_LOG_LEVEL` env var override + 5 MB / 5-retained rotation + Rust panic capture + dev-mode webview-console output all gained for free; `json_log.rs` deleted; `log_commands.rs` trimmed to just `open_log_dir`. `[webview]` prefix hack replaced by structured `logger: "webview:info"` source field. Two prerequisite fixes surfaced during smoke test: (1) `log:default` capability needed in `default.json` for the plugin's webview IPC; (2) 8 internal call sites inside `ipc.ts` itself were still calling deleted `invoke("log_info"/"log_error", ...)` commands — public wrappers had been migrated but internal sites missed. Both fixed.

---

## D-22 — Theme tokens feel under-tuned (palette quality, not plumbing)
**Where:** `src/app/globals.css` — the `:root`, `.dark`, and `.theme-*` blocks (5 hand-tuned profiles: default / solarized / nord / dracula / contrast).
**Observed:** User feedback: "the theme parameters seem not tuned perfectly — overall not sharp and comfortable." The plumbing (`src/components/theme/theme-provider.tsx` ~100 lines, `src/lib/core/theme.ts` ~89 lines, both with zero `fix:` commits) is fine — the *values* are the issue. Hand-picked hex per profile produces the recurring "this token doesn't compose with that surface" bug class — see B-01 (StatusHero attention row unreadable in dark mode), B-02 (theme profile dropdown ignores theme), and B-05 (low-score amber redundancy). Each is a token-composition failure, the class of problem semantic ramps and curated component-aware presets are designed to eliminate.
**Proposed:** Replace the contents of the `:root` / `.dark` / `.theme-*` blocks with curated **shadcn/ui themes** (already aligned with the shadcn primitives we use in `src/components/ui/*`, drop-in CSS, multiple presets to map onto our 5 slots). Suggested mapping: default ← Zinc or Slate; solarized ← Stone; nord ← Slate; dracula ← Violet; contrast ← keep custom or shadcn's neutral high-contrast. Keep the 5-profile structure and all profile names so existing user preferences resolve correctly. Tune `--attention` last (most backlog scars; needs to compose with `bg-attention/6` overlays). If shadcn presets still feel off after a real review, fall back to **Radix Colors** 12-step ramps (more rigorous, manual ramp→token mapping). Provider + core untouched. CSS-only swap; risk low for the change itself, medium for hitting the user's "sharp and comfortable" bar (subjective — expect 2-3 iteration rounds).
**Status:** rejected — swap shipped in v0.1.6 (Phase 29) using shadcn Stone for default + canonical Solarized/Nord/Dracula hex for the named profiles, then user reviewed in prod and reported "looks bad." Reverted before v0.1.7 via `git revert -m 1` of the merge commit, restoring the pre-Phase-29 hand-tuned values. The "values are the issue" framing turned out to be only half the story — the user genuinely preferred the prior aesthetic. Don't re-attempt the same approach (curated presets verbatim); if token quality is revisited later, start with Radix Colors 12-step ramps or with a tweakcn-based interactive tuning session, not another canonical-hex paste.

---

## D-23 — Settings shell rework: replace main sidebar with settings sidebar + Back row
**Where:** `src/app/(shell)/layout.tsx` (sidebar swap), new `src/components/shell/settings-sidebar.tsx`, `src/components/settings-view.tsx` (drop the `<PageHeader subTabs>`), routing under `app/(shell)/settings/` (dynamic `[tab]/page.tsx`).
**Observed:** Settings currently lives under the main sidebar with the 6 sub-tabs (Children / Appearance / Attention / Fetch / Notifications / Advanced) crammed into the top `PageHeader` as horizontal pill tabs. Visually noisy at 6 tabs; doesn't match the desktop-app convention parents recognize from System Settings / VS Code. Reference shape: Keystream's `settings-sidebar.tsx` — when in settings, the sidebar swaps to a settings-specific list with a "← Back" row at the top.
**Proposed:** When `pathname.startsWith("/settings")`, render a new `<SettingsSidebar>` instead of `<Sidebar>`. Settings sidebar = "← Back" row + "Settings" eyebrow + 6 tab rows. Each row navigates to `/settings/<tab>`. Settings tab state moves from component-local `useState` to the URL via dynamic `[tab]` route + redirect from bare `/settings` → `/settings/children`. Back row uses `router.back()` with `/` fallback. Drop `<PageHeader subTabs>` from `SettingsView`. Settings sidebar shares `ui.sidebarCollapsed` with the main sidebar (one toggle, both modes). Pure shell refactor — no Q-decision affected, no library, no domain code touched. Effort ~half day. **Ship order:** after D-21 (logger in place to catch regressions) and D-22 (theme tokens locked, so layout tuning happens against final colors).
**Status:** done — shipped via Phase 30. New `SettingsSidebar` component swaps in when pathname starts with `/settings`. Dynamic `[tab]` route splits server (`page.tsx` with `generateStaticParams`) + client (`client.tsx` with `useParams` + `notFound`). `SettingsView` accepts `tab` prop, dropped `<PageHeader>`. Bare `/settings/page.tsx` is now a redirect to `/settings/children`. Back button always exits to `/` (Today) — `router.back()` was tried but rewinds tab-by-tab through settings history and felt like a bug. Settings sidebar shares `ui.sidebarCollapsed` with the main sidebar.

---

## D-01 — Appearance settings (theme + font size)
**Where:** Settings → new "Appearance" sub-tab (sibling of Children / Notifications / Email / Advanced)
**Observed:** No way for the user to change theme (light/dark/system) or text size from within the app. Dark CSS variables already defined under `.dark` in `src/app/globals.css:101+` but no toggle wiring, no persistence, no system-detection. Font scaling has zero infrastructure.
**Proposed:** Add an Appearance tab with (a) theme picker — Light / Dark / System with `prefers-color-scheme` fallback, persisted to `settings` table and applied at the shell-layout level; (b) font size — Small / Medium / Large tied to `:root { font-size: ... }`, persisted similarly; (c) Reduced motion — explicit toggle, also respects `prefers-reduced-motion`. Deferred extras: density (compact / comfortable), accent color, font family — the latter two would need superseding Qs for Q16.
**Status:** promoted — Phase 14 (A1 / A2 / A4) in `docs/progress.md`. A3 (reduced motion) dropped during A3 review — app's motion budget (hover fades + a couple accordion slides + spinners) is too small to warrant a dedicated setting.

---

## B-01 — StatusHero attention row unreadable in dark mode
**Where:** `src/components/status-hero.tsx:39,48` — the "N classes need attention" title + class-names subtitle on the per-child row.
**Observed:** Text uses `text-attention-foreground`. That token is always a dark warm-brown (designed for opaque `bg-attention` surfaces); but the row uses `bg-attention/6` — mostly transparent over the page background. In dark mode the dark text lands on a dark surface → invisible.
**Proposed:** Swap to `text-foreground` for the title + the appropriate muted foreground for the subtitle. The colored `CircleAlert` icon already carries the attention hue; the text only needs to be readable body text.
**Status:** done

## B-03 — Low-score labels render with foreground-token color on neutral card surface
**Where:** `src/components/attention-section.tsx:42-49` — the score pill on attention rows (e.g. "1=B", "1=PS").
**Observed:** Scores with `scoreNumeric < 2.0` use `text-attention-foreground`, while scores ≥ 2.0 use `text-muted-foreground`. The attention-foreground token is designed for TEXT ON an opaque attention-colored background — so on the card's regular surface it renders as a near-black warm-brown in light mode and invisible/wrong-looking in dark mode. The inconsistent color pair makes the low-score labels look like a different "theme" from the higher-score labels.
**Proposed:** Swap `text-attention-foreground` → `text-attention` (the amber accent color itself). Keeps the "this needs attention" semantic — colored text is still visually louder than muted — while rendering correctly on the card surface in every theme × mode combo.
**Status:** done — superseded by B-05, which removed the entire `<2.0` ternary in the same file. Both cases now use a single neutral `text-muted-foreground` class.

## B-04 — Seed script drops nested assignment fields in raw_payloads JSON
**Where:** `scripts/seed-dev-db.ts:1066` — the `classDetails` builder inside the fetch-runs loop.
**Observed:** Only *top-level* standards had their assignments transformed from the internal `StandardDef` shape (`score`, `dueOffset`) into the `Assignment` shape (`grade`, `gradeLetter`, `gradeNumeric`, `dueDate`). Nested children were passed through verbatim via `children: std.children ?? []`, so every assignment under a child standard (e.g. Social Studies → Geography → "Identifies and locates features" → Map Activity) landed in `raw_payloads.json` with the raw internal fields. The app then read `assignment.grade` → `undefined` → rendered nothing. Same for `assignment.dueDate`. Masqueraded as a UI bug (D-03) because the symptom — "nothing shows behind the assignment name" — looked like an ungraded-assignment rendering gap.
**Proposed:** Make the standard mapper recursive — extract a `mapStandard(std)` helper that both maps `std.assignments` to the `Assignment` shape AND recurses into `std.children`. Post-fix, reseed with `pnpm tsx scripts/seed-dev-db.ts --reset` to repopulate `raw_payloads` with corrected JSON.
**Status:** done

## B-05 — Low-score rows in Today's Attention section still use the pre-engine `<2.0` amber override
**Where:** `src/components/attention-section.tsx:43-51` — the score badge rendering in `AttentionRow`.
**Observed:** The score text uses `gradeNumeric < 2.0 ? "text-attention" : "text-muted-foreground"`. This dates from before Phase 15: the idea was to visually escalate "very low" scores. Now that the engine already decides what's attention-worthy uniformly (everything below the threshold is flagged), doubling down with a second color tier on the same row is redundant noise. User wants the logic removed: all attention-section low-score badges render the same way.
**Proposed:** Drop the ternary. Score badge always uses `text-muted-foreground` (or similar neutral). The surrounding row styling (bg, TrendingDown icon at standards-tree level, "Recent"/"Older" grouping) already communicates the attention semantic.
**Status:** done

## B-02 — Theme profile dropdown ignores theme
**Where:** `src/components/settings-appearance.tsx` — the native `<select>` used for the profile picker.
**Observed:** Native `<option>` popup is rendered by the OS/webview with system colors. In dark mode the popup stays white and its text becomes unreadable. CSS can't style the dropdown's open-state.
**Proposed:** Replace the `<select>` with a vertical stack of profile buttons (radio-group pattern) matching the Mode picker's look — each row shows the profile name + 1-line description, active state highlighted. No native dropdown, styles fully under our CSS variables, and the descriptions are visible without having to open anything.
**Status:** done

---

## D-03 — Ungraded assignments render with nothing next to the name
**Where:** `src/components/standards-tree.tsx:27-47` — `AssignmentRow` non-missing branch.
**Observed:** When the teacher has posted an assignment to the gradebook but hasn't entered a score yet (confirmed from live captures: 6 such rows in Computer Science 7 due 5/22–6/17, plus English and French rows due in the recent past), the row renders with just the name + clock-icon date and nothing else. Parent can't tell whether it's an upcoming assignment, something waiting on the teacher, or a bug. Two real causes exist — future assignments pre-posted to the gradebook, and past-due work not yet graded — but they shouldn't need distinct UI (predictability > cleverness).
**Proposed:** Single consistent rule in `AssignmentRow`: always show `dueDate` if present (already does); always show the grade if present (already does); otherwise render a "Not graded" tag so there's always *something* on the right side of the row. Only truly-empty-on-both-sides (no date AND no grade AND not missing) rows render without a tag — and per the live data scan those don't appear to exist.
**Status:** done — "Not graded" italic tag landed in `standards-tree.tsx`.

---

## B-06 — Sidebar scrolls off-screen when main content overflows
**Where:** `src/app/(shell)/layout.tsx` — the shell layout that stacks `Sidebar` + main content area.
**Observed:** The outer flex container uses `min-h-screen`, and the whole page scrolls as a unit. When the user scrolls down a long page (Classes tree, Settings panels), the sidebar scrolls off the top — the user loses access to the nav until they scroll back up. Expected behavior for a nav sidebar is to stay pinned while the content area scrolls independently.
**Proposed:** Change the shell to use a fixed-height viewport. Outer `h-screen` (no overflow), right-hand content column becomes `overflow-y-auto` so its internal scroll stays local. Sidebar stays where it is — the fact that it doesn't grow past the viewport now means it stays visible regardless of content length.
**Status:** done — shipped as part of the layout groundwork for Phase 16 (Q26). Dashboard Header also got `sticky top-0` inline; full `PageHeader` refactor lives in Phase 16 L1/L2.

---

## D-06 — Remove Scrapes sub-tab + helpful empty state on History
**Where:** `src/components/history-view.tsx` — the History page's sub-tab control, `FetchRunsSection`, and `HomeworkSection` empty state.
**Observed:** The Scrapes sub-tab lists raw fetch_runs — every successful and failed scrape attempt. Parents don't use this; they use the header's "last fetched" time + the dashboard error banner for the two questions it could answer ("is data fresh?" / "did the last refresh fail?"). Plus: asymmetric with Homework (latest-per-day content) vs Scrapes (append-only audit log) — they're different data shapes dressed up as symmetric siblings. And if a user hasn't configured `homework_url`, the History page is effectively empty except for this developer-log view.
**Proposed:** (1) Delete the Scrapes sub-tab + its loader (`FetchRunsSection`, `getFetchRunsForChild` call). The underlying `fetch_runs` table stays populated for the header's last-fetch time + the 6h auto-refresh logic. (2) Upgrade the Homework empty state: when no child has `homework_url` configured, show a pointer to Settings → Children with a short explanation; when a URL exists but no homework has been scraped yet, say so. (3) History becomes a single-purpose Homework-history page with no sub-tab chrome.
**Status:** deferred — folded into Phase 16 L2 (Q26). Will land naturally when HistoryView gets rewired to use `PageHeader` and drops its sub-tab state.

---

## D-05 — ChildTabs active-tab indicator too subtle, especially in dark mode
**Where:** `src/components/child-tabs.tsx:23-27` — the segmented pill control at the top of the dashboard.
**Observed:** Selected tab uses `bg-card` inside a `bg-secondary/50` container. In light mode the contrast between `card` and `secondary/50` is small but present. In dark mode both read as near-same gray with only a tiny `shadow-sm` separating them, so parents with multiple children can't tell which child's data they're looking at without squinting.
**Proposed:** Solid primary-filled selected tab — `bg-primary text-primary-foreground font-semibold shadow-sm` — unambiguous in every theme × mode combo. Unselected tabs stay muted with a hover lift. Follows the same "primary = active focus" convention the Settings tab underline already uses.
**Status:** done — iterated from solid-primary → ring-only → final floating-pill treatment. Container `bg-secondary/50 shadow-inner` (groove), selected tab `bg-card font-semibold` with a custom two-layer drop shadow (lifted), unselected tabs faded to 60% muted-foreground with a full-opacity on hover. Attention dot on unselected tabs also fades to 60%. Phase 16 L3 will later move the whole component to the sidebar as a radio group — current in-page treatment is the interim best-in-class.

---

## D-04 — Complete icon system for every assignment state + read-only legend
**Where:** `src/components/standards-tree.tsx` `AssignmentRow` — the leaf rows under each standard in the Classes tab drilldown. Also a new legend placement.
**Observed:** Currently three of the four assignment states render without a dedicated icon:
- **Missing** — no icon, just amber rectangle bg + "Missing" text (inconsistent with Today tab's `BookX` icon for the same semantic).
- **Low-score within window** — has a `TrendingDown` icon next to the name (from AT3). ✓
- **Low-score aged-out** — no icon.
- **Clean graded** — no icon.
- **Ungraded (no score yet)** — no icon, just "Not graded" text.
- **Aged-out missing** — muted row + muted "Missing" text, no icon.
User wants *every* state to carry a distinct icon so the row is scannable at a glance, and wants a read-only legend somewhere (Settings or similar) that documents the mapping.

**Proposed:** Comprehensive icon system per row — one icon per state, leftmost in the row:

| State | Icon | Hue |
|---|---|---|
| Missing (within window) | `BookX` | `text-attention` (matches Today tab) |
| Missing (aged out) | `BookX` | `text-muted-foreground` |
| Low-score (within window) | `TrendingDown` | `text-attention/70` (current) |
| Low-score (aged out) | `TrendingDown` | `text-muted-foreground` |
| Meeting (graded ≥ threshold) | `CheckCircle2` | `text-meeting` |
| Ungraded / not yet scored | `CircleDashed` | `text-muted-foreground` |

Within-window uses the attention hue; aged-out mutes it. Missing always shows the `BookX` (shared Today-tab icon) — fixes the #1 inconsistency.

**Legend placement:** Settings → Attention sub-tab gains a read-only "Icon reference" section below the two numeric inputs. Static table, no interactive controls, just icons + labels + one-line descriptions. Parents can find it once and don't need to remember where.

**Status:** done

---

## D-02 — Palette softening + theme profile library
**Where:** App-wide theming — Settings → Appearance. Surfaced during A1 review.
**Observed:** Current light palette is too white (clinical), current dark palette is too black (harsh). User wants a library of pre-built profiles (VS Code-style: Default / Solarized / Nord / Dracula / High contrast) with a selector, instead of a single palette toggled between light and dark.
**Proposed:** Supersede Q16's palette lock with a new Q23. Add profile picker above the existing mode toggle. Fonts stay locked to Newsreader + DM Sans (Q23 preserves Q16's typography + layout + semantic-color decisions). Generate palettes via the frontend-design skill.
**Status:** done — Q23 committed, A4 shipped (5-profile library + softened default + Mode/Profile UI). Pending user confirmation during walkthrough review.

---

## B-07 — `Load failed` on Linux breaks TeacherEase login + homework URL validation
**Where:** `src/lib/scraper/teacherease.ts` `login()` + `src/lib/scraper/homework-validator.ts` — the two scraper-level HTTP flows that the add-child form triggers synchronously. Log evidence: `[webview] settings: add child failed Load failed` (app.log, 2026-04-18).
**Observed:** Every add-child attempt throws WebKit's generic `TypeError: Load failed` ~200ms into the first fetch. The error is a webview-level CORS block — TeacherEase (and Google Sites) don't send `Access-Control-Allow-Origin: tauri://localhost`, so WebKitGTK rejects the response before login() can classify it. Unit tests pass because Vitest runs in Node (no CORS); the live e2e test passes for the same reason. Q11 anticipated this exact failure: "Tauri's http plugin has a fetch allowlist that bypasses webview CORS for whitelisted hosts. This is the intended pattern." The plugin was never wired up.
**Proposed:** (1) Add `tauri-plugin-http` (Rust) + `@tauri-apps/plugin-http` (TS) with a narrow scope — `https://*.teacherease.com/*` + `https://sites.google.com/*`. (2) Export `tauriFetch` from `src/lib/ipc.ts` matching the existing `FetchImpl` type; wire into 6 production call sites (login, grades, class detail, homework fetch, homework validation, wizard). (3) Swap login's 200-response body-regex detection for final-URL detection (reqwest auto-follows 302s, so "bounced back to login page" is the signal for bad creds). (4) Wrap login's fetch calls in try/catch so transport errors surface as parent-friendly text ("Couldn't reach TeacherEase. Check your internet connection.").
**Status:** done — commit 4937a73

---

## D-07 — Settings → Children — inline delete confirmation + full-field edit
**Where:** `src/components/settings-children.tsx` — the ChildRow + AddChildForm + a new EditChildForm.
**Observed:** (a) Delete path used `window.confirm()`, a browser modal dialog that breaks the app's visual language and can't be styled. Trash icon also hidden until hover — discoverable by accident. (b) Edit path supported only the homework URL; the name, email, and password fields had no in-app edit surface. User wanted parity with the Add flow (same four fields + same validation).
**Proposed:** (a) Trash icon always visible; click swaps the row into a destructive-tinted inline confirmation panel with explicit Remove + Cancel buttons. (b) Rebuild edit as a full form mirroring AddChildForm: name / email / password / homework URL. Password field blank by default — "Leave blank to keep current" placeholder; only writes keychain if user types a new one. Save validates login (if email or password changed) + Google Sites shape (if homework URL changed + non-empty) before persisting anything. Only changed fields are written. (c) Homework URL validator gets an upfront `https://sites.google.com/` host check so wrong-URL gets a specific error ("Homework URL must be a Google Sites page") instead of the generic "Couldn't reach that page."
**Status:** done — commit aeaa51d

---

## D-08 — Sidebar child selector semantics + attention engine decoupling
**Where:** `src/components/shell/sidebar-child-selector.tsx`.
**Observed:** Initial L3 design treated the dot as an attention indicator (amber when any of the child's classes need attention). Two problems: (1) a freshly-added child has no fetch_run yet, so no attention data, so no dot — user read that as "the sidebar isn't working." (2) Attention was already surfaced on the Today hero + Classes tab, so the sidebar dot was a redundant third place. (3) The attention computation forced the sidebar to loop through every child, call `getLatestFetchRun` + `getAllClassDetails` + run the engine — a non-trivial cost on every mount and refresh.
**Proposed:** Redefine the dot as the selection indicator: selected child gets a filled dot + bold foreground text; unselected children get no dot + 60% muted text. Drop all attention-engine plumbing from the sidebar (children list + settings reconcile only). Selector becomes both faster and more honest about what it's telling the user.
**Status:** done — commit 6fc3b70

---

## D-09 — Newly-added child isn't auto-selected + Today tab leaks stale data
**Where:** `src/components/settings-children.tsx` AddChildForm + `src/components/dashboard.tsx` loadData.
**Observed:** After adding a new child via Settings, the sidebar still highlighted the previously-selected child — new child appeared in the list but was unhighlighted. Clicking the new child in the sidebar switched the selection, but Today's body still showed the old child's grades / assignments / attention rows because `loadData()`'s "no run yet" branch skipped clearing state.
**Proposed:** (a) After `addChild` returns the new id, call `writeSelectedChildId(newId)` so the sidebar highlights the new child immediately. (b) In `loadData`, when `getLatestFetchRun` returns null, explicitly reset grades/assignments/classDetails/prev state so the tab renders a clean "click Refresh to populate" empty state instead of leaking the previous child's data.
**Status:** done — commit 6fc3b70

---

## B-08 — Keychain silently uses in-memory stub; every scrape fails with "No stored password"
**Where:** `src-tauri/Cargo.toml` — the `keyring` crate dependency.
**Observed:** Every add-child flow succeeded (login validated, DB row inserted, keychain_set log INFO'd), but every subsequent refresh failed with `"No stored password — re-add this child"`. Same session, seconds apart. Debug log revealed the keyring crate was creating `MockCredential { MockData { secret: None } }` instances — the in-memory no-op backend. Each `Entry::new()` made a fresh empty Mutex; writes went to that instance and were invisible to any subsequent read. Confirmed separately that ksecretd / kwalletd / gnome-keyring were irrelevant — the app wasn't actually talking to D-Bus at all.
**Proposed:** The `keyring = "3"` spec defaults to zero backend features, which collapses all platforms to MockCredential. Switch to `keyring = { version = "3", default-features = false, features = ["apple-native", "windows-native", "sync-secret-service", "crypto-rust"] }` so each OS gets its real backend. Linux now pulls in `dbus-secret-service`, which talks to whatever secret-service daemon is bound to `org.freedesktop.secrets` (gnome-keyring in our dev env, would be kwallet or ksecretd on other systems, KeyChain on macOS, Credential Manager on Windows).
**Status:** done — commit 4211ccd

---

## D-10 — Refresh button only scrapes the currently-selected child
**Where:** `src/components/dashboard.tsx` — `handleRefresh`.
**Observed:** Parents with multiple children clicking Refresh only got data for the child whose row they most recently tapped in the sidebar. Easy to miss — the log showed `refresh: started childId=1` when the user thought they were refreshing child 3 (Ivy). Mental model is "I pressed Refresh to update the whole family," not "I pressed Refresh to update whoever is selected."
**Proposed:** Rewrite `handleRefresh` to iterate `await getChildren()` and run the `FetchRunner` against each in sequence. Per-child failures are collected and summarized rather than halting the loop — one child with bad credentials shouldn't prevent a successful scrape of the other two. Error banner: `"Alex: No stored password"` for single failures, `"3 children failed. First: Alex — ..."` when multiple. After the loop, re-run `loadData(childId)` + `loadHeroStatuses` + dispatch `child-data-refreshed` so the sidebar + hero reflect fresh state.
**Status:** done — commit e67ccce

---

## D-11 — Successful refresh of one child makes another child's data "disappear"
**Where:** `src/components/dashboard.tsx` loadData + `src/components/classes-view.tsx` loadData.
**Observed:** Post-refresh on a child with a working homework URL + bad TeacherEase credentials (e.g., seeded Alex), Today showed grades: empty, classes: empty, even though days of prior successful TeacherEase scrapes sat in the DB. The bug was in the lookup: `getLatestFetchRun(cId)` returned the most recent fetch_run row regardless of source or status — and a successful-but-data-empty homework run OR a failed TeacherEase run was newer than the last good grades scrape. Calling `getGradesForFetchRun(run.id)` on a homework run returns 0 rows by design.
**Proposed:** Add `getLatestSuccessfulFetchRun(childId, source)` filtering by both source AND `status='success'`. Dashboard + Classes use it with `"teacherease"` for the grades/assignments/classDetails queries. Keep the unfiltered `getLatestFetchRun` for the "Checked Xm ago" timestamp display (that should reflect the last attempt of any kind, not the last success).
**Status:** done — commit e67ccce

---

## D-13 — Unified refresh-digest notification (per Q27)
**Where:** `src/lib/notify/` — event types, router, channels; `src/components/dashboard.tsx` — post-refresh dispatch; `src/components/settings-notifications.tsx` + Email settings — per-channel toggles.
**Observed:** Current model fans `gradesAttention` / `newHomework` / `fetchFailed` out per child per source during the fetch loop. A family with 3 children can get up to 9 notifications per refresh cycle on each channel. After Phase 11 email shipped, a test cycle produced three emails (two for test children, one for Ivy) — confirming the unified engine works but also that the event granularity is wrong. Parents want "here's the state of the family after this check," not "one-at-a-time per-signal pings."
**Proposed:** Per Q27 — collapse to a single `refreshDigest` event dispatched once per cycle. Same engine, two fidelities: `OSChannel` renders hero-summary title+body, `EmailChannel` renders a detailed HTML body (hero header + per-child attention + tonight's homework = today+tomorrow). Failures fold into the same digest (top strip + excluded from hero counts + title leads with failure). Always fire (manual or auto). One toggle per channel (drop per-event toggles). Aggregation lives in a pure `buildRefreshDigest` function; orchestrator (dashboard post-loop) dispatches.
**Status:** done — Phase 17 (N1-N6) landed; see `docs/progress.md`.

---

## B-09 — Hero's "meeting" count double-counts engine-flagged attention classes
**Where:** `src/components/dashboard.tsx` `loadHeroStatuses` (feeds StatusHero + the refresh-digest hero counts).
**Observed:** For Ivy, hero shows "3 classes need attention + 7 meeting" (= 10), but Classes tab shows 3 attention + 5 meeting (= 8 classes total). The mismatch is because `meetingCount` counts every `GradeRecord.status === "meeting"`, including classes that the engine ALSO flags for attention (e.g., a TE-"meeting" class that has a missing assignment). Classes tab's `StatusIndicator` correctly preempts "Meeting" with "Needs Attention" — but the hero never applied that same preemption. Same bug surfaces in the email digest's family hero block + per-child hero, since they share `perChildHeroCounts`.
**Proposed:** In `loadHeroStatuses`, after computing `attnClasses`, exclude classes in that set from both `meetingCount` and `notAssessedCount` tallies: `g.filter(gr => gr.status === "meeting" && !attnSet.has(gr.className)).length`. Preserves the Classes-tab partitioning rule (each class belongs to exactly one hero bucket; attention wins). Fix is a 3-line change in one function.
**Status:** done

---

## D-14 — Today-only homework windowing + dual hw/due sections (per Q28)
**Where:** `src/components/homework-card.tsx`, `src/components/dashboard.tsx` (loadData), `src/lib/ipc.ts` (query), `src/lib/notify/digest.ts` (digest shape), `src/lib/notify/email-templates.ts` (render).
**Observed:** Today tab's "Tonight's Homework" card currently shows whatever `MAX(hw_date)` is stored — could be days old or several days in the future. Parents wanted a strict today-match with zero carry-over; history browsing belongs on the History tab. Also, we never surface `dueDate` as a separate view even though the scraper already parses it. After the Q27 digest ship, "today+tomorrow" inherited the same mismatch in both the Today tab and the detailed email.
**Proposed:** Replace "tonight" windowing with strict `hwDate === todayLocal` AND add a parallel "due today" section keyed by `dueDate === todayLocal`. Both on the Today tab and mirrored in the detailed email. Weekend = naturally empty. Hide entire section when `child.homeworkUrl == null` (absent ≠ empty). Show "No homework for today" / "Nothing due today" when configured but no match. New IPC helper `getHomeworkForDay(childId, iso)` to replace `getLatestHomework`/`getHomeworkBetween`. Supersedes Q27's today+tomorrow rule; Q28 drafted in `design-plan.md`.
**Status:** done — Phase 18 (H1-H8) landed.

---

---

## D-15 — Hero block is a fixed 4-line numeric summary (Today tab + email + OS)
**Where:** `src/components/status-hero.tsx`, `src/lib/notify/email-templates.ts` (`renderFamilyHeroHtml` / `renderFamilyText`), `src/lib/notify/os-channel.ts` (`buildBody`), `src/components/dashboard.tsx` (`loadHeroStatuses`), `src/lib/notify/types.ts` (`FamilyHero` + `ChildStatus`).
**Observed:** Hero block previously mixed attention class-name lists, "not assessed" counts, and a single aggregated "N homework items today" line — inconsistent across surfaces and easy to misread. User wants the hero to be four fixed lines: `{name}: N classes need attention`, `N meeting`, `X homework for today`, `Y homework due today`. Nothing else.
**Proposed:** Split `FamilyHero.homeworkCount` into `homeworkForTodayCount` + `homeworkDueTodayCount` (per-section, no cross-section dedup). Add same two fields to `ChildStatus` for the Today tab. Rewrite `StatusHero`, `renderFamilyHeroHtml`/`renderFamilyText`, and `buildBody` to emit the exact 4-line (attention + meeting + hw-for-today + hw-due-today) structure — drop attention class-names display and "not assessed" from the hero specifically (still live in per-child email sections + Classes tab). Bump OS `MAX_BODY_LINES` to 4 so failures still fit too.
**Status:** done

---

## D-16 — Email per-child section polish: skip empties, drop hero repeats, match Today-tab attention layout
**Where:** `src/lib/notify/types.ts` + `digest.ts` + `email-templates.ts`, consumed by `synthetic.ts` + tests.
**Observed:** 1) Sam has no homework URL configured but the email still renders "No homework for today." / "Nothing due today." subsections under his name — absent ≠ empty (Q28), so those subsections shouldn't appear at all. 2) Sam has a TE failure too — the digest renders a per-child block that says "Couldn't refresh — see top of email." + the empty homework subsections. The failure is already in the top strip; the per-child block adds nothing. 3) For Ivy (the succeeded child), her per-child section repeats the hero-level "3 classes need attention: ..." + "5 meeting" lines that are already in the family hero above. 4) Attention rows render as single lines with inline separators (`name · class [badge] · 4d ago`), not matching the Today-tab's multi-line format (icon + name, class name below, due/grade badge on the right).
**Proposed:** (a) When `hero === null` → skip the entire per-child section (the top strip already named the failing child/source). (b) When `homeworkUrl` is not configured → skip both homework subsections (consistent with Q28's Today-tab rule). (c) Drop the "3 classes need attention: ..." / "N meeting" repeat from per-child sections — family hero owns those counts now that D-15 made it the single numeric summary. (d) Rewrite attention-row HTML to a 3-line stack matching the Today-tab layout: `📕 name` / `class name` / `🕐 due-date` (or grade for low-score). Use Unicode/emoji icons since email strips CSS backgrounds/masks — Gmail mobile renders them fine. Requires adding `homeworkConfigured: boolean` to `ChildDigest` so the renderer can gate the subsections.
**Status:** done

---

## D-17 — Email body should mimic the Today tab exactly — per-child hero rows + always include every child
**Where:** `src/lib/notify/email-templates.ts` (per-child section layout + family hero), backed by `ChildDigest` (already has the data).
**Observed:** After D-15/D-16, the email still diverges from the Today tab in two ways: (1) the top "family hero" block is a single aggregated summary (prefixed with the single child's name when `childCount === 1`), but the Today tab has per-child hero rows even when one child is shown. (2) D-16 skipped per-child sections entirely when `hero === null`, but Alex and Sam should still appear — same as the Today tab shows a row for every child. Sam's row just shouldn't render homework subsections (no URL configured), and TE-failed children shouldn't render the attention list (no fresh data), but they should still have a hero row so the parent sees them in the email.
**Proposed:** Replace the aggregated `renderFamilyHeroHtml` + `renderFamilyText` blocks with per-child hero rows, one per child in `d.children`, mirroring `StatusHero`'s look: rounded container, ✓ (meeting) or ⚠ (attention / couldn't refresh) icon, `{name}: <summary>` title line, then stacked count lines (meeting · hw for today · hw due today). For TE-failed children the title becomes `{name}: couldn't refresh` and the meeting line is dropped (stale data is not shown), but homework counts still render if `homeworkConfigured`. Render per-child attention list under the hero row only when `hero !== null` AND `attention.length > 0` (or keep the soft "Nothing needs attention for X" line; decide during implementation). Render homework subsections only when `homeworkConfigured`. Keep the failure top strip unchanged. Text body mirrors the same structure.
**Status:** done

---

## D-18 — Email + OS should mirror Today tab literally: no failure output, stale data surfaces, all heroes first then detail
**Where:** `src/lib/notify/digest.ts`, `types.ts`, `email-templates.ts`, `os-channel.ts`.
**Observed:** D-17 kept a failure top strip + "couldn't refresh" language on per-child hero rows. User wants the digest to behave identically to the Today tab: the tab NEVER shows failure info in its hero block — it just shows whatever `getLatestSuccessfulFetchRun` data exists (zeros when none), and homework is whatever's in DB today. The email digest should do the same. Failure-hunting belongs in the error banner on the Today tab, not in the email body. Also, layout should match: all children's hero rows stacked at the top (mirroring `StatusHero`), then per-child detail sections (attention + homework) below — not hero+detail interleaved per child.
**Proposed:** (a) Drop the `| null` from `ChildDigest.hero` — always populate from `perChildHeroCounts` (zeros when never scraped). Digest builder stops special-casing TE-failed children. (b) Delete `renderFailureStripHtml` and `renderFailuresText` from the email. (c) Rewrite the HTML layout to two stacked blocks: top = all child hero rows (green/amber, no red/failure variant), bottom = per-child detail sections (attention list + homework). Text body mirrors. (d) Simplify OS `buildHeroLine` + `buildBody`: drop the failure branches entirely; always render the data-driven hero. `digest.failures` stays on the type (still populated by the dashboard for logging / future use) but is rendered nowhere.
**Status:** done

---

## B-12 — Digest display polish: hero title wording + one-line attention rows + missing due dates
**Where:** `src/lib/notify/os-channel.ts` (`buildHeroLine`), `src/lib/notify/email-templates.ts` (`renderAttentionRowHtml`, `renderHomeworkItemsHtml`, text equivalents).
**Observed:** (1) OS title "12 classes across 3 children" is ambiguous — reads like "12 classes exist" not "12 classes need attention". (2) Attention rows render as a 3-line stack (name / class / due) — user wants a single line per item. (3) Low-score attention items show only the grade, not the due date — both are useful. (4) Homework items show `📖 Math` + content, no due date visible.
**Proposed:** (1) Insert "need attention" into the multi-child title: "12 classes need attention across 3 children". (2) Rewrite attention row HTML + text as one line: `{icon} {name} · {class} · {trail}` with trail = due-date (when present) + grade (when present for low-score). (3) For low-score items, include both grade and due date in the trail. (4) Homework items: add a due-date chip on the first line: `{icon} {subject} · 🕐 {dueDate}`. Content stays on the following line when present.
**Status:** done

---

## B-13 — Digest icon mapping: align every emoji with its Today-tab Lucide counterpart
**Where:** `src/lib/notify/email-templates.ts`.
**Observed:** Several email icons don't match their Today-tab equivalents: "Attention" heading has no icon (Today tab uses `AlertTriangle`); "Homework for today" / "Homework due today" items carry individual book / clock emojis that belong on the section heading (Today tab puts `BookOpen` / `Target` on the heading and nothing on each row). User also asked for a systematic review of the mapping.
**Proposed:** Apply a 1:1 icon audit — `AlertTriangle` → ⚠ on attention heading; `BookOpen` → 📖 on "Homework for today" heading; `Target` → 🎯 on "Homework due today" heading; drop per-item 📖 / ⏰ from homework rows (Today tab doesn't have per-row icons there); keep per-item 📕 / 📉 on attention rows (Today tab does have per-row icons there for missing / low-score). Due-date chip stays 🕐 on both surfaces. Hero icons (✓ / ⚠) unchanged.
**Status:** done

---

## B-14 — Email homework items should render on one line (match attention rows)
**Where:** `src/lib/notify/email-templates.ts` `renderHomeworkItemsHtml` + plaintext equivalent.
**Observed:** After B-13, homework items render as `subject · due` on line 1 and content on line 2. Attention items are one line per item after B-12 — homework should match for visual consistency.
**Proposed:** Inline content with ` · ` separator: `<strong>{subject}</strong> · 🕐 {dueDate} · {content}` — gmail wraps naturally at column width. Plaintext mirrors.
**Status:** done

---

## B-15 — Date chips always at the end (email + Today tab)
**Where:** `src/lib/notify/email-templates.ts` (attention row + homework row), `src/components/attention-section.tsx` (Today tab AttentionRow).
**Observed:** Due-date appears in the middle of rows on several surfaces. Email attention rows put the date before the grade (`🕐 4/16 · 2.5=P`); email homework rows put the date before the content (`Math · 🕐 4/19 · Review...`); Today tab AttentionRow renders the Clock chip before the grade. User wants the date info consistently at the *end* of the row on both surfaces.
**Proposed:** Flip the order — attention rows: `{icon} {name} · {class} · {grade} · 🕐 {due}` (grade first, due last); homework rows: `{subject} · {content} · 🕐 {due}` (content first, due last). Today tab AttentionRow: swap the order of the two right-side chips so grade comes before the Clock chip.
**Status:** done

---

## B-11 — SEED: Alex's homework data had nonsensical weekday/date combos
**Where:** `scripts/seed-dev-db.ts` — the `ALEX_HOMEWORK` fixtures.
**Observed:** Seeded homework used hardcoded raw strings like `"Friday 4/17"` regardless of the current date, so after today drifted to Sun 4/19 the UI showed combinations like "posted Sat 4/18, due Fri 4/17" (impossible). Also pre-dated the Phase 18 `hw_date === today` rule, so on a weekend the Today tab had no data to test against.
**Proposed:** Rewrite the seed fixtures to generate ISO dates dynamically from today's local date, compute `due_date` via a school-day-aware helper (`nextSchoolDayIso` + optional `dueIn` offsets), skip weekend offsets for historical entries, but always include `offset=0` so the Today tab has fresh data even on weekends. Bypass `resolveDueDate` in the seed — we already have both ISOs, no need to round-trip through the parser.
**Status:** done

---

## B-10 — Digest family hero is ambiguous + double-counts TE-failed children's homework
**Where:** `src/lib/notify/digest.ts` (`rollUpFamily`) + `src/lib/notify/email-templates.ts` (`renderFamilyHeroHtml`) + `src/lib/notify/os-channel.ts` (`buildHeroLine`).
**Observed:** With Alex + Sam TE-failing and Ivy succeeding, the email's family hero reads "3 classes need attention · 5 meeting · 3 homework items today" — attribution missing (user can't tell these are Ivy's), and the "3 homework items today" come from Alex's seeded homework rows even though Alex's own section says "Couldn't refresh." Two problems in one block: (1) single-child hero doesn't name the child, (2) `family.homeworkCount` includes children whose `hero` is null, violating Q27's "TE-failed children excluded from hero counts" rule (which was about attention/meeting but should extend to homework for coherence).
**Proposed:** (a) In `rollUpFamily`, only add a child's homework to `family.homeworkCount` when `c.hero !== null` — same gate attention/meeting already use. (b) In both renderers, when `family.childCount === 1`, prefix the hero line with the child's name ("Ivy: 3 classes need attention · 5 meeting · 2 homework items today") so single-child cycles self-identify. For the OS title prefix stays within reasonable length. Per-child homework sections are unchanged — Alex still sees his own homework in his section; only the family aggregation tightens.
**Status:** done

---

## D-20 — Notify gets full Fetch model parity (times/day + first-slot anchor) + weekday-only toggle for both
**Where:** `src/lib/schedule/notify-schedule.ts` (model), `src/components/settings-notifications.tsx` (UI), `src/components/settings-fetch.tsx` (weekday toggle), `src/components/shell/schedulers.tsx` (wiring), setting keys.
**Observed:** D-19 gave the Notify tab visual chip parity with Fetch but left the underlying model at "1×/day at HH:MM." User wants full model parity: N runs/day (default 1) + first-slot-at anchor + the same "Time slots" chip display. Also: parents want to skip weekends for both schedules entirely (~99% of school-work days are Mon–Fri; weekend ticks are noise).
**Proposed:** (a) Notify-schedule module gains `notifyRunsPerDay` (1–8, default 1) + `notify.firstSlotAt` (HH:MM, default 07:00) — model becomes a straight copy of fetch-schedule with the same next-run math. UI swaps the single HH:MM picker for the two-input + chip-list pattern. (b) Both tabs get a `[✓] Skip weekends (Sat + Sun)` checkbox bound to `fetch.weekdaysOnly` and `notify.weekdaysOnly` (default off). Scheduler advances next-run past Sat/Sun local when the flag is set. Both model changes contradict locked Q29 + Q30 decisions → require a new superseding Q (drafted).
**Status:** done — shipped via Phase 21 (Q31). Notify-schedule module rewritten to mirror fetch-schedule; both tabs got the `[ ] Skip weekends (Sat + Sun)` Switch; new `nextWeekday` helper used by both compute functions; 302 tests green.
**Where:** `src/components/settings-notifications.tsx` (Schedule section) + `src/components/settings-fetch.tsx` (existing chip label).
**Observed:** Settings → Notifications → Schedule shows a time picker and a "Next run:" line, but nothing visual to match the Fetch tab's chip. Parents testing the notify cron want the same "chip + relative offset" pattern so they can verify at a glance. Also: Settings → Fetch labels the chip list "Today's slots" — confusing when a slot has wrapped past midnight and is actually tomorrow's (the `(tomorrow)` tag on the chip already handles that, but the heading still says "today").
**Proposed:** (a) Rename the chip-list heading to "Time slots" across both tabs (doesn't imply today-only). (b) In Settings → Notifications, add a single-chip display under the time picker showing the configured notify time with the same "next-run highlight + relative offset `(in 2h 14m)`" treatment as the fetch chips. Single chip = single schedule (1×/day). Dispatch event flow unchanged.
**Status:** done — user later clarified they wanted full model parity (1×/day → N×/day + anchor) + weekday toggle, tracked under D-20 + Q31. The visual chip + "Time slots" rename shipped as-is.
**Where:** `src/lib/core/attention-engine.ts` `computeStandardAttention` + `attention-section.tsx` rendering.
**Observed:** React console warning `Encountered two children with the same key, Social Studies 7-27004135-missing` after first real scrape of Ivy. Same assignment appeared multiple times in the Today attention list because TeacherEase allows a single assignment to hang under multiple standards ("Geography Quiz" might be linked to 3 different learning standards in Social Studies 7), and the recursive tree walk in `computeStandardAttention` pushed an `AttentionItem` each time. Identical items except for their path through the standards tree.
**Proposed:** Dedup items by `(className, testNameId)` in `computeClassAttention` before returning — keep first occurrence. The attention state is identical across duplicates, so "first" is arbitrary-but-consistent. Test helper `asn()` updated to auto-increment `testNameId` so unrelated fixtures don't falsely collide with the dedup.
**Status:** done — commit e67ccce
