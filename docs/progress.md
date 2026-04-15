# TeacherEase Parent Companion — Progress

## Phase 0: Scaffolding

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | Repo + planning docs | ✅ Done | GitHub repo, MIT license, .gitignore, CLAUDE.md, decisions.md, design-plan.md, .claude/ scaffold |
| 2 | pnpm workspace + package.json | Not started | Root package.json, pnpm-lock, Biome + Vitest + TS deps |
| 3 | Next.js static-export setup | Not started | `src/app/`, static export config, Tailwind + shadcn/ui |
| 4 | Tauri 2 shell init | Not started | `src-tauri/` with Cargo.toml, tauri.conf.json, main.rs minimal, builds on Linux |
| 5 | Cross-platform CI | Not started | GitHub Actions matrix (Windows / macOS / Linux), artifact upload |
| 6 | Biome + Vitest + tsc wiring | Not started | `pnpm lint`, `pnpm test`, `pnpm typecheck` all green on empty project |

## Phase 1: Core scraper

| # | Task | Status | Notes |
|---|------|--------|-------|
| 7 | HTML fixtures from ref repo | Not started | Copy saved debug HTML from `ref/teacherease_parents_helper/logs/` into `tests/fixtures/` |
| 8 | TeacherEase login (fetch + cookie jar) | Not started | Handle ASP.NET `__VIEWSTATE` / `__EVENTVALIDATION` dance |
| 9 | Grade overview parser (cheerio) | Not started | Port Python BeautifulSoup logic |
| 10 | Class detail parser (cheerio) | Not started | Per-class assignments, scores, statuses |
| 11 | Scraper integration test | Not started | End-to-end against live TeacherEase (gated env var), and fixture-based unit tests |

## Phase 2: Local persistence

| # | Task | Status | Notes |
|---|------|--------|-------|
| 12 | SQLite schema + migrations | Not started | `tauri-plugin-sql` wiring, schema per design-plan.md |
| 13 | Child CRUD (Rust command layer) | Not started | Add/edit/remove child, store credentials in OS keychain |
| 14 | Scrape persistence | Not started | Store scrape runs + normalized rows + raw payload |
| 15 | Read queries for UI | Not started | Latest scrape, per-child history, needs-attention filter |

## Phase 3: Dashboard UI (core)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 16 | Layout + header + empty state | Not started | Minimal shell with Refresh-now button, last-run timestamp |
| 17 | Current-grades view | Not started | One row per class, color-coded status |
| 18 | Needs-attention section | Not started | Missing assignments, low scores |
| 19 | Refresh-now wiring | Not started | Frontend button → Rust command → scraper → persist → UI refresh |

## Phase 4: First-run wizard

| # | Task | Status | Notes |
|---|------|--------|-------|
| 20 | Welcome screen | Not started | Per decisions Q7 |
| 21 | Add-child screen + live login validation | Not started | Refuse to advance unless login succeeds |
| 22 | Notification permission pre-prompt | Not started | Our copy, then OS prompt |
| 23 | Inline first scrape + summary | Not started | Run scrape inside wizard, show results before handoff |
| 24 | Skip + resume-later flows | Not started | Empty-state dashboard with CTA if skipped |

## Phase 5: Scheduler + notifications + tray

| # | Task | Status | Notes |
|---|------|--------|-------|
| 25 | Tray icon + menu | Not started | `tauri::tray::TrayIconBuilder`, open/refresh/quit |
| 26 | Internal scrape timer | Not started | Startup + every 6h, retry with backoff, pause on sleep |
| 27 | OS notifications on "needs attention" | Not started | `tauri-plugin-notification` |
| 28 | Autostart registration | Not started | `tauri-plugin-autostart`, toggleable in Settings |
| 29 | Battery settings | Not started | "Only run scheduled scrapes when plugged in" toggle |

## Phase 6: Multi-child support

| # | Task | Status | Notes |
|---|------|--------|-------|
| 30 | Child switcher in header | Not started | Hidden when only one child |
| 31 | Settings → Children CRUD page | Not started | Add / edit / remove, reuses wizard add-child form |

## Phase 7: Dashboard UI (full)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 32 | Dashboard UX design (separate question) | Not started | Parked in decisions — pick up when implementing |
| 33 | Grade trend charts | Not started | Per-class over time |
| 34 | Assignment drilldown | Not started | Per-class detail view with history |

## Phase 8: Optional email (advanced)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 35 | Settings → Advanced → Email form | Not started | SMTP host/port/user/pass, BYO only |
| 36 | Email sender + templates | Not started | Port HTML template from ref repo |
| 37 | Gmail App Password tutorial | Not started | Static page with screenshots |

## Phase 9: Updater + release pipeline

| # | Task | Status | Notes |
|---|------|--------|-------|
| 38 | Updater signing keypair + GH secrets | Not started | One-time setup |
| 39 | `tauri-plugin-updater` wiring | Not started | Update banner in dashboard header |
| 40 | GitHub Actions release workflow | Not started | Tag → build 3 OSes → publish release + latest.json feed |
| 41 | First public release | Not started | v0.1.0 |

## Phase 10: First-launch warning docs

| # | Task | Status | Notes |
|---|------|--------|-------|
| 42 | `docs/first-launch.md` | Not started | Windows SmartScreen and macOS Gatekeeper bypass walkthroughs with screenshots |

---

## What's Working

- Planning docs committed and locked (decisions.md Q1–Q10, design-plan.md, progress.md).
- GitHub repo created, MIT licensed, .gitignore covers Tauri + Next.js + Node.
- Reference Python project archived at `../ref/teacherease_parents_helper/` for HTML fixture mining.

## What's Next

**Task 2**: pnpm workspace + package.json scaffold (root-only, no src yet).
