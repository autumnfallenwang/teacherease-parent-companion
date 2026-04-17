# UI / information-architecture proposal (2026-04-17)

A new navigation model + page structure for the Tauri desktop app. Replaces the "one infinite scroll" dashboard with a **bounded Today view** plus sidebar-accessed secondary sections. Menu bars and keyboard shortcuts are explicitly out of scope for v1 — the sidebar alone carries the navigation.

Status: **proposal, not yet scheduled.**

## Important: this reopens Q18

Q18 in `design-plan.md` is the locked decision "**peace-of-mind monitor, one vertical scroll, no separate pages, no mode toggles.**" That rationale is still partly right — the top-of-page story **should** stay scannable top-to-bottom. But the project already violates the letter of it (`/settings`, `/about`) and will violate it harder as Phase 9 (email), Phase 10 (updater), and any fetch-history / notifications-log feature lands. Continuing to cram everything into one scroll doesn't scale.

This doc proposes a **Q20** to supersede Q18's layout claim while preserving Q18's aesthetic and priority principles (calm, glance-first, editorial tone, attention-first ordering). **Q18's per-child/hero/attention/homework hierarchy for the primary view remains unchanged**; this doc only reshapes the container around it and carves out secondary content.

## What we're solving

1. **"Scroll forever" fatigue.** Today the dashboard stacks Status Hero → Attention → Homework → All Classes → per-class accordion, all on one scroll. Adding history, notification log, email reports, or a 3rd fetch source makes this unwieldy.
2. **Desktop affordance gap.** The app feels like a resized webpage. No sidebar navigation, no native shell structure. Parents on macOS/Windows expect a more app-like layout — its absence reads as "unpolished tooling," not "calm."
3. **Upgradability.** A web-page pattern makes every new feature a new section-at-the-bottom-of-the-scroll. We need a container with designated slots for future work.

## What we're NOT solving

- **Visual style change.** Q16's warm-editorial direction (Newsreader + DM Sans, binder tabs, paper texture, subject-color accents, status-dot primitives) is not up for revision. This doc is information architecture, not a visual redesign.
- **Mobile / web port.** Desktop-first. If we eventually ship a web version, the sidebar pattern translates; mobile would need its own adaptation.
- **Feature additions.** No new domain features — just a better home for what exists and what's planned.
- **Q7 wizard.** The 4-screen first-run wizard remains untouched.

## Proposed design

### Two-pane desktop shell (sidebar + content)

```
┌──────────┬─────────────────────────────────────────────────────────┐
│          │                                                         │
│ Sidebar  │                                                         │
│          │              Main content area                          │
│  ● Today │                (active section)                         │
│  ○ Class │                                                         │
│  ○ Hist. │                                                         │
│  ○ Set.  │                                                         │
│  ─────── │                                                         │
│  About   │                                                         │
│          │                                                         │
└──────────┴─────────────────────────────────────────────────────────┘
```

**No OS menu bar.** Skipped intentionally — Tauri's menu API has cross-platform quirks (GTK menu rendering on Linux, macOS role attribution for Quit/About, Windows menu positioning edge cases) that aren't worth debugging for a 5-section app. The tray menu already covers Quit. Everything else is reachable via the sidebar.

- **Sidebar**: narrow vertical rail on the left (56–72px collapsed / 200px expanded). Icon + label per section. Active section marked by a soft fill pill (matches existing binder-tab aesthetic — same color language, not another visual metaphor).
- **Main content**: the section. Scrolls independently. Each section has a short title band at the top and content below.
- **No top-bar clutter**: the existing header (app title / Refresh / Settings icon) moves — "Refresh" becomes a button in the Today section's title band; "Settings" moves into the sidebar. App title lives in the sidebar header (or not — Tauri window title bar already shows it).

### Sidebar sections

| Section | Content | Status |
|---|---|---|
| **Today** | Status Hero + Child Tabs + Attention + Tonight's Homework. Bounded — everything that fits in one viewport at comfortable density. | reshapes existing dashboard |
| **Classes** | All-classes list + per-class accordion drilldown + class history (trend dots, past grades). Moved out of Today so Today stays calm. | moved from dashboard |
| **History** | Past homework entries (across days), past scrape runs (from the new `fetch_runs` table — see fetch-pipeline-proposal.md), trend charts. | new — addresses "viewing previous homework" from `homework-followups.md` Q1 |
| **Settings** | Children CRUD (current `/settings`) + future: Notifications (the `settings` table keys from `notify-pipeline-proposal.md`) + Email setup (Phase 9) + Advanced. | moves `/settings` in |
| **About** | Current `/about` page. Version, links, disclaimer. | moves `/about` in |

Default landing: **Today**. Auto-select the child who needs attention on load (existing behavior preserved).

### The "Today" section reshaped

```
┌───── Today ──────────────────────────────── [Refresh]  Checked 2h ago ─┐
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  Status Hero (family-wide)                                     │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                        │
│  Child Tabs                                                            │
│                                                                        │
│  ┌─── Attention (if any) ─────────────────────────────────────────┐    │
│  │  ⚠ 2 missing · 1 low score    · "View all in Classes →"       │    │
│  │  ├ Mount Everest · Social Studies · 3 wks                      │    │
│  │  ├ Gandhi Article · Social Studies · 2 wks                     │    │
│  │  └ Show 1 more                                                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                        │
│  ┌─── Tonight's Homework (if configured + data) ──────────────────┐    │
│  │  Fri · Apr 17                                                  │    │
│  │  ├ Science · Unnatural selection video...                      │    │
│  │  ├ Math · MCAS Packet #3                                       │    │
│  │  └ ...                                                         │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                        │
│  ── (bottom of Today; full class list is in Classes section) ─         │
└────────────────────────────────────────────────────────────────────────┘
```

Key changes:
- **All Classes + accordion moves out** — that's the Classes section. Today shows attention items only, not the full class roster.
- **"View all in Classes →"** link bridges Today to the deeper view.
- **Bounded scroll.** In the common case (attention + 3–5 missing + one homework day), Today fits in one viewport or gets one short scroll. It doesn't grow as features land — those go in other sections.
- **Attention cap.** Show the top 3 attention items with "Show N more" → expands in-place (keeps Today compact) or jumps to Classes.

### Desktop-native affordances

**Keyboard shortcuts: not in v1.** Deferred until a real user asks. The sidebar is always visible, click targets are large, and parents aren't the power-user profile that builds muscle memory for keybindings. Skipping them keeps the app free of undiscoverable behavior and removes one thing that could confuse users on different OSes (⌘ vs Ctrl, modifier conflicts with webview, etc.). Revisit only when someone concretely asks for one.

**Tray menu (existing):** unchanged — Open / Refresh / Quit. The tray is for when the main window is closed; the sidebar covers the in-app navigation when it's open.

**Window polish:**
- Remember window size + position between launches (Tauri window-state plugin).
- Sidebar collapsed/expanded state remembered.
- No global drag-to-reorder or other desktop-heavy patterns — this is a monitor, not a tool.

### Classes section (new home for current drilldown)

- All classes list (sorted by urgency — existing `sortClassesByUrgency`).
- Click a class → expand in place with the standards tree + assignment detail (existing `StandardsTree` component, unchanged).
- Add a "History" chip per class → shows past status dots beyond the 5 currently rendered.
- Instructor name, progress bar, status badge — all existing, just in a new section.

### History section (addresses homework-followups.md Q1 + scales forward)

- **Tabs within** (this is an acceptable use of tabs — it's sub-navigation inside one section, not top-level): "Homework" · "Scrapes" · future "Trends."
- **Homework tab**: date-grouped list of past homework (newest first, paged). Superset of today's HomeworkCard.
- **Scrapes tab**: reads from the new `fetch_runs` table (fetch-pipeline-proposal.md). Columns: source · started_at · status · duration · error. Gives observability.

### Settings section (expanded scope)

**Tabs within** (sub-nav, same justification):

- **Children** — current `SettingsChildren` content.
- **Notifications** — per-channel per-event toggles (writes to the `notify.*` keys in `settings` table per notify-pipeline-proposal.md).
- **Email** (Phase 9) — SMTP host/port/user/from/to + keychain password + Gmail App Password tutorial link.
- **Advanced** — Autostart toggle (currently silent-on), clear history, export DB, updater on/off.
- **About** stays as its own sidebar section (it's the legal/disclaimer page — more prominent than "advanced setting").

## Comparison to alternatives

### A. Keep "one scroll" — status quo
- Pro: honors Q18 literally, lowest refactor cost.
- Con: doesn't scale past next 1–2 features; no desktop affordances.

### B. Master-detail (left list of attention items, right detail pane)
- Pro: very desktop-native; loved by power users.
- Con: wrong tone for parents. The visible data *is* the summary — there's no "list of things to triage" to warrant a two-pane shape. Forces the parent into a power-user mode.

### C. Tabbed dashboard (no sidebar, tabs across the top)
- Pro: simpler than sidebar.
- Con: mobile/web pattern, not desktop. Doesn't scale past 4–5 tabs. Less visible than a sidebar when the window is tall.

### D. Command palette (⌘K) primary navigation
- Pro: very modern / power-user-favorite.
- Con: violates Q7's non-technical-parent baseline. Not appropriate for v1.

**Recommendation: sidebar (proposed).** Command palette is out of scope entirely for v1 — revisit only if a user asks.

## Step-by-step refactor

1. **Shell scaffold.** New `src/app/layout.tsx` wraps children in a persistent sidebar shell. Sidebar component in `src/components/shell/sidebar.tsx` with 5 items + icon set from `lucide-react`.
2. **Move existing pages into sections.** `src/app/page.tsx` becomes the Today view. New routes `/classes`, `/history`, `/settings`, `/about` (relocating the existing pages).
3. **Reshape Today.** Remove `<GradesTable />` + accordion from the dashboard. Keep Hero + Child Tabs + Attention + HomeworkCard. Add "View all in Classes →" bridge link.
4. **Build Classes page.** `src/app/classes/page.tsx` — the full class list + accordion moved from today's dashboard. Near-zero new code; just relocated.
5. **Build History page (stub).** `src/app/history/page.tsx` — render tabs for Homework / Scrapes with "coming soon" for Scrapes until fetch_runs lands. Homework tab uses `getRecentHomework(limit)` which already exists.
6. **Expand Settings.** New sub-nav inside `/settings`. Children tab is existing content. Notifications tab reads/writes `notify.*` keys. Email tab placeholder for Phase 9. Advanced tab surfaces the autostart toggle + "Clear history" + updater toggle.
7. **Window-state plugin.** Install `tauri-plugin-window-state` for persisted size/position.
8. **Sidebar collapse state.** Persisted in `settings` table (`ui.sidebarCollapsed = "1"`) so it survives restarts. First real read from the settings table after the Notifications work.
9. **Update Q18 → Q22 in design-plan.md.** Append (never edit) Q22 locking the new architecture; leave Q18 as historical record with a "superseded by Q22" note.

Estimated scope: ~2 days — route reshape, sidebar component, and settings-tab reorganization. **Zero new Rust code** (no menu bar, no keyboard shortcuts).

## Scales to planned work

| Future thing | Where it lives |
|---|---|
| Email reports (Phase 9) | Settings → Email tab |
| Notification prefs (notify-pipeline) | Settings → Notifications tab |
| Fetch history / observability (fetch-pipeline) | History → Scrapes tab |
| Previous homework browsing (homework-followups Q1) | History → Homework tab |
| Updater UI (Phase 10) | Toast/banner inside any section + Advanced toggle |
| Additional fetch sources | More rows in the Classes view + History → Scrapes rows |
| Recent Activity if revived (homework-followups Q3) | Today section or History → "Since last check" |

Every proposed feature has a designated home — no more "another card at the bottom of the scroll."

## Open questions

1. **Sidebar icon set.** Pick a style that matches the warm-editorial tone (Q16). `lucide-react` (already in use) has enough to cover it but defaults are a bit technical-feeling. Consider heroicons outline or phosphor for softer shapes. *Lean: stick with lucide for consistency; tune weight/color via CSS if needed.*
2. **Collapsed-sidebar default.** Collapsed (icon-only) is denser, expanded is self-documenting. *Lean: expanded by default on first launch; persist user's choice.*
3. **About as top-level vs under Settings.** Currently top-level. Design plan Q15 makes the legal disclaimer load-bearing; arguing for top-level visibility. *Lean: top-level sidebar item.*
4. **Sidebar labels.** "Today" vs "Home" vs "Dashboard"? "Classes" vs "Grades"? Parent-facing language matters. *Lean: "Today" + "Classes" + "History" + "Settings" + "About" — concrete nouns, no jargon.*
5. **Window chrome.** macOS traffic-lights inside the sidebar header or left as native window chrome? *Lean: leave native chrome; don't re-invent.*
6. **Empty-state Today.** When no children added, Today currently shows the empty-state CTA. Proposed: same behavior, plus the sidebar items for History/Settings are still navigable. Feels right.

## Decision points

- **Approve Q20** (the architectural supersede of Q18's layout claim)?
- **Commit the scope** — ship standalone, or bundle with the fetch + notify pipeline refactors so all three reshape `handleRefresh` / dashboard.tsx in one window?

**My lean:** bundle with the fetch + notify refactors. Three proposals together reshape the whole shell — doing them in one window means touching each file once. The visual result is a noticeably more native-feeling, upgradable app without the scattered "one more card" debt, and with the menu bar dropped, the whole thing stays in TypeScript — no Rust churn beyond the existing tray handler.
