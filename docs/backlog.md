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
**Status:** open

## B-04 — Seed script drops nested assignment fields in raw_payloads JSON
**Where:** `scripts/seed-dev-db.ts:1066` — the `classDetails` builder inside the fetch-runs loop.
**Observed:** Only *top-level* standards had their assignments transformed from the internal `StandardDef` shape (`score`, `dueOffset`) into the `Assignment` shape (`grade`, `gradeLetter`, `gradeNumeric`, `dueDate`). Nested children were passed through verbatim via `children: std.children ?? []`, so every assignment under a child standard (e.g. Social Studies → Geography → "Identifies and locates features" → Map Activity) landed in `raw_payloads.json` with the raw internal fields. The app then read `assignment.grade` → `undefined` → rendered nothing. Same for `assignment.dueDate`. Masqueraded as a UI bug (D-03) because the symptom — "nothing shows behind the assignment name" — looked like an ungraded-assignment rendering gap.
**Proposed:** Make the standard mapper recursive — extract a `mapStandard(std)` helper that both maps `std.assignments` to the `Assignment` shape AND recurses into `std.children`. Post-fix, reseed with `pnpm tsx scripts/seed-dev-db.ts --reset` to repopulate `raw_payloads` with corrected JSON.
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
**Status:** in-progress

---

## D-02 — Palette softening + theme profile library
**Where:** App-wide theming — Settings → Appearance. Surfaced during A1 review.
**Observed:** Current light palette is too white (clinical), current dark palette is too black (harsh). User wants a library of pre-built profiles (VS Code-style: Default / Solarized / Nord / Dracula / High contrast) with a selector, instead of a single palette toggled between light and dark.
**Proposed:** Supersede Q16's palette lock with a new Q23. Add profile picker above the existing mode toggle. Fonts stay locked to Newsreader + DM Sans (Q23 preserves Q16's typography + layout + semantic-color decisions). Generate palettes via the frontend-design skill.
**Status:** done — Q23 committed, A4 shipped (5-profile library + softened default + Mode/Profile UI). Pending user confirmation during walkthrough review.
