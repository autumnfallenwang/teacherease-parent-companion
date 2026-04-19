# Backlog

Findings discovered via the walkthrough skill. One row per finding, grouped by type (`B-NN` bugs · `D-NN` design changes). Status cycles: `open` → `in-progress` → `done` (or `rejected` / `deferred`). Phase-sized work doesn't live here — it gets promoted to `docs/progress.md` instead.

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

## D-12 — Attention list shows the same missing assignment two or three times
**Where:** `src/lib/core/attention-engine.ts` `computeStandardAttention` + `attention-section.tsx` rendering.
**Observed:** React console warning `Encountered two children with the same key, Social Studies 7-27004135-missing` after first real scrape of Ivy. Same assignment appeared multiple times in the Today attention list because TeacherEase allows a single assignment to hang under multiple standards ("Geography Quiz" might be linked to 3 different learning standards in Social Studies 7), and the recursive tree walk in `computeStandardAttention` pushed an `AttentionItem` each time. Identical items except for their path through the standards tree.
**Proposed:** Dedup items by `(className, testNameId)` in `computeClassAttention` before returning — keep first occurrence. The attention state is identical across duplicates, so "first" is arbitrary-but-consistent. Test helper `asn()` updated to auto-increment `testNameId` so unrelated fixtures don't falsely collide with the dedup.
**Status:** done — commit e67ccce
