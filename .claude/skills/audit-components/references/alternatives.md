# Curated component alternatives — TeacherEase Parent Companion stack

Stack assumptions: cross-platform (macOS + Windows + Linux via Tauri 2), Next.js 15 (App Router, static export), React 19, TypeScript strict, Tailwind 4. Anything that doesn't compose with `dynamic({ ssr: false })` or that requires a server runtime is out — note it in the entry.

This file is the **lookup table**, not a recommendation. The audit's job is to map a *component with 2+ signals firing* to *the right entry here*. Don't suggest swaps for components that aren't firing — the alternatives only help if the build is actually painful.

Last reviewed: 2026-05-04. Refresh quarterly or when a new option enters the ecosystem.

## Forms / inputs (highest-leverage swap target in this codebase)

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **react-hook-form** + **zod** | ~30 KB combined | Very active | Multi-field forms with validation. Likely match for `settings-children.tsx` (~490 lines, per-child credential CRUD), `settings-email-section.tsx` (~480 lines, SMTP config + recipient list + test-send), and `wizard/setup-wizard.tsx` if it ever fires. RHF + zod replaces hand-rolled `validate()` blocks, error-state objects, and per-field touched tracking. |
| **@hookform/resolvers** | ~2 KB | Active | The bridge between RHF and zod. Required if adopting both. |
| Hand-rolled (current) | 0 | n/a | Right call for short forms (≤3 fields). Swap when forms cross ~5 fields with cross-field validation, or when validation rules start drifting between save and test paths. |

**Integration notes for our stack:**
- Works fine inside `dynamic({ ssr: false })` components. No server runtime needed.
- Field-level errors map directly to our existing `errors: Record<string, string>` pattern — drop-in.
- zod schemas can live next to the component or in `src/lib/core/` if shared (e.g. SMTP recipient parsing already in `smtp.ts`).
- Q4 (SMTP), Q34 (credentials in DB), Q14 (logging) contracts are unchanged — only the form plumbing moves.

## Headless UI primitives (buttons, dialogs, dropdowns, tooltips, etc.)

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **shadcn/ui** (current — `shadcn` devDep + `src/components/ui/`) | Per-component (copy-paste) | Active | Already in use: badge, button, card, input, label, switch, table. **Default choice for any new primitive.** Add via `pnpm dlx shadcn@latest add <name>`. |
| **radix-ui** (current — direct dep) | ~5–15 KB per primitive | Active | Behavior-only (no styling). Use directly when shadcn/ui doesn't have what you need or you want zero abstraction. |
| **react-aria** (Adobe) | ~10–25 KB per hook | Active | Accessibility-first hooks. Highest a11y quality bar; heavier API. Reach for when shadcn + Radix aren't enough. |

**Heuristic:** if the new primitive has a name (Tooltip, Popover, Slider, Toggle, ToggleGroup, Sheet, Tabs, Dialog, Combobox, RadioGroup), reach for shadcn first. Don't hand-roll it. Tooltip in particular keeps coming up — add it via shadcn the moment a third hand-rolled hover-hint shows up.

## Tables / data grids

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **@tanstack/react-table** (headless) | ~14 KB | Very active | If `grades-table.tsx` ever needs sorting, filtering, column resizing, or virtualization. Currently a static render — no need yet. |
| Hand-rolled (current `grades-table.tsx`, `standards-tree.tsx`) | 0 | n/a | Right call now: read-only display, ≤200 rows, no interactivity beyond row click. Swap only if interactivity is added or 2+ signals fire. |

## Tree views (standards / homework hierarchies)

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **react-arborist** | ~25 KB | Active | Virtualized tree with keyboard nav, drag-drop, multi-select, headless styling. Reach for it if `standards-tree.tsx` (~258 lines) crosses ~500 nodes per child or gains drag-drop / multi-select. |
| Hand-rolled (current `standards-tree.tsx`) | 0 | n/a | Right call now: rendering bound by per-class standard counts, no interactivity beyond expand/collapse. |

## Toasts / notifications (in-app, not OS-level)

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **sonner** | ~6 KB | Active | If we ever need an in-app toast (e.g. "Saved.", "Test email sent."). Currently we set ephemeral `status` state inside each settings tab — works, but starts to repeat. Reach for sonner the third time we copy a `setTimeout(() => setStatus(...), 600)` pattern. |

OS-level notifications stay on `@tauri-apps/plugin-notification` per `notify/os-channel.ts`. Sonner is for in-window UI feedback only.

## Drag-resize / pane-split

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **react-resizable-panels** | ~12 KB | Active | If we ever add a resizable sidebar or split-view dashboard. Currently the sidebar is fixed-width via `shell/sidebar.tsx` — no need yet. |

## Icons

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **lucide-react** (current) | ~3 KB per icon (tree-shaken) | Very active | Keep. Wide coverage, tree-shakeable, matches the project's outline-icon aesthetic. |

## Charts / data viz

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **recharts** | ~80 KB | Active | If we ever ship grade trend charts beyond the simple sparkline-style indicators currently in `progress-bar.tsx` / `trend.ts`. Out of scope for v0.1.x. |

## Markdown / rich text rendering (display, not editing)

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **react-markdown** + remark | ~25 KB | Active | If we ever render formatted release notes inside `about-page.tsx` (currently links out to GitHub release pages per B-18). Not blocking. |

## Date / time

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| **date-fns** | ~3 KB per function (tree-shaken) | Active | If `homework-date.ts` and `activity.ts` start needing locale-aware formatting beyond what native `Intl` handles. Native is fine for now. |

## State management

| Library | Bundle | Maintenance | Use when |
|---|---|---|---|
| Hand-rolled `useState` / `useReducer` (current) | 0 | n/a | Keep. State is component-local; the only cross-component state (selected child, theme) is small. |
| **zustand** | ~3 KB | Active | If state grows past ~5 reducers and prop-drilling becomes the issue. Not the case yet. |

## Tauri / OS integration

| Plugin | Maintenance | Use when |
|---|---|---|
| **tauri-plugin-updater** (current) | Official | Already in use as of v0.1.x. |
| **tauri-plugin-process** (current) | Official | Already in use (relaunch after install). |
| **tauri-plugin-sql** (current) | Official | Already in use for app DB (Q34). |
| **tauri-plugin-http** (current) | Official | Already in use for scraper (B-07). |
| **tauri-plugin-log** (current) | Official | Already wired into `JsonFileLogger`. |
| **tauri-plugin-notification** (current) | Official | Already in use (`notify/os-channel.ts`). |
| **tauri-plugin-autostart** (current) | Official | Already in use (launch-on-login). |
| tauri-plugin-dialog | Official | If we add a "browse for download folder" or similar OS dialog. Not on roadmap. |
| tauri-plugin-fs | Official | If we add user-controlled FS access (e.g. CSV export). Not on roadmap. |
| tauri-plugin-global-shortcut | Official | If global hotkeys ever fire. Not on roadmap. |

## HTML scraping / parsing

| Library | Maintenance | Use when |
|---|---|---|
| **cheerio** (current) | Active | Already in use in `src/lib/scraper/`. Keep. Domain-locked: scraper is product code, not a candidate for swap. |

---

## What's deliberately not on this list

- **CSS-in-JS** (styled-components, Emotion): we use Tailwind; don't add a parallel system.
- **Animation libraries** (Framer Motion, react-spring): our animations are CSS-only via `tw-animate-css` and that's working. Reach for these only if motion becomes a feature, not decoration.
- **i18n** (react-intl, i18next): single-locale (English) by design.
- **Routing** (TanStack Router, React Router): Next.js App Router handles this; don't add a parallel.
- **HTTP clients** (axios, ky): scraper uses `tauri-plugin-http`; don't add a parallel.
- **Code editor libraries** (CodeMirror, Monaco): no code-editing surface in this product.
