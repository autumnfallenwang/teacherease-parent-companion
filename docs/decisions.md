# Locked Decisions

Running log of decisions we've agreed on for the rewrite of `teacherease_parents_helper` into a cross-platform desktop app for non-technical parents. Each entry is final unless explicitly revisited.

## Project goal

Rewrite the existing Python + Playwright + cron script (see `ref/teacherease_parents_helper/`) as a standalone desktop app that a non-technical parent can install from a single installer (Windows x64, macOS ARM primary; macOS x64 / Linux x64 secondary). GUI-first, local-only, no server, no accounts.

---

## Q1 — Scraping approach: Playwright vs HTTP

**Decision: Drop Playwright. Use plain HTTP scraping in a Node sidecar with `fetch` (or `undici`) + `cheerio`.**

### Why
Evidence from `ref/teacherease_parents_helper/src/scraper.py`:
- Login is a plain HTML form (email + password inputs, submit button). No OAuth, no captcha, no 2FA.
- Pages are server-rendered ASP.NET WebForms (`.aspx`). Data is in the HTML response body — that's why the current code can use BeautifulSoup to parse it.
- Navigation is URL construction + GET, not clicking through a JS SPA.
- The current scraper runs successfully headless, which means there's no Cloudflare/bot wall that would require a real browser fingerprint.

### Impact
- **Install size:** ~310 MB (Tauri + Playwright Chromium) → **~15 MB** (Tauri + fetch + cheerio). ~20× smaller.
- **Reliability:** higher. No browser crashes, no page-load timeouts, no Chromium version drift on user machines.
- **Speed:** 5–10× faster per run.

### Known caveat
ASP.NET WebForms login often requires a two-step dance: GET the login page, extract hidden `__VIEWSTATE` / `__EVENTVALIDATION` / `__REQUESTVERIFICATIONTOKEN` fields, POST them back with credentials and a cookie jar. Mechanical but fiddly. If it doesn't work on first implementation we solve it (short job). Absolute last-resort fallback: bundle a headless browser — but we do not plan for this.

### Revisit if
- TeacherEase adds real client-side JS rendering for the grade/homework pages.
- TeacherEase adds a bot-detection wall (Cloudflare, hCaptcha, etc.).
- Login flow adds 2FA or SSO.

---

## Q2 — Scheduling & background execution

**Decision: Tray-resident app with an internal timer (Option B).** No OS-level scheduler (no Task Scheduler / launchd / systemd integration) in v1.

### Behavior
- App launches at login and lives in the system tray (Windows notification area / macOS menu bar). **"Launch at login" is a user-toggleable setting**, not forced on. Default: on, with a clear prompt during first-run setup.
- Runs one scrape **on startup** (fresh data when the user logs in), then **every 6 hours** while the machine is awake.
- Dashboard has a manual **"Refresh now"** button — always works, bypasses the timer.
- **OS notifications** on "needs attention" results are the primary push channel. Email is optional and layered on top (decided in a later question).
- When the main window is closed, only the tray icon + Rust core stay resident. The webview is destroyed to keep RAM minimal.

### Why Option B over the alternatives
- **Option A (manual-only):** rejected — defeats the original app's purpose of notifying you without being asked.
- **Option C (native OS scheduler):** rejected for v1 — three separate per-OS implementations, and its one real advantage (running while the app is closed) is largely nullified because laptops sleep. May revisit as an "advanced: run even when app is closed" toggle if a real user asks.
- **Option B advantages:** one code path across all OSes, matches user mental model of tray apps (Dropbox/Slack pattern), notifications actually arrive, graceful fallback (scrape on app open) if the tray app was killed.

### Battery guarantees (non-negotiable for implementation)
1. No Chromium resident in the background (Playwright dropped in Q1 — this is the biggest battery win).
2. Timer is event-driven (`setTimeout`), not a polling loop. Idle CPU is zero between scrapes.
3. Each scrape is ~5–10 s of plain HTTP work, ≤4×/day → ~40 s CPU/day total.
4. App sleeps with the OS when the laptop sleeps; timer pauses and resumes on wake. No wake-from-sleep.
5. Failed scrapes use exponential backoff with a hard retry cap (e.g., 3 attempts), then wait for the next scheduled run — a broken network cannot turn into a battery drain.
6. Main-window-closed state destroys the webview; only the Rust core + tray icon remain resident (~10–20 MB RAM).
7. **Setting: "Only run scheduled scrapes when plugged in."** Off by default, available for battery-conscious users.
8. No telemetry, no analytics, no animations, no websockets, no keep-alive connections — nothing that keeps CPU/network warm.

### Target: under 0.1% battery per day from this app. Unnoticeable in system battery stats.

---

## Q3 — Multi-child support & access model

**Decision: Support multiple children in one install from v1. No in-app login — whoever opens the app sees all children.**

### Scope
- **In v1:** multiple children on the **same portal type** (TeacherEase). Each child has their own portal credentials (TeacherEase logins are per-student). Setup wizard lets the user add child #1, then "+ Add another child" for additional kids. Dashboard has a child-switcher; if only one child exists, the switcher is hidden and the UI looks identical to a single-child version (single-child is a degenerate case of multi-child — zero cost to simple users).
- **Not in v1:** multi-portal support (e.g., one child on TeacherEase + another on PowerSchool). Code will be structured so scraping logic is isolated per portal, but we do **not** design a generic adapter interface yet — YAGNI.
- **Not in v1:** multi-parent sharing, cloud sync, accounts, permissions, roles. Each parent runs their own install with their own local data.
- **Not in v1:** in-app authentication. No app password, no PIN, no user profiles inside the app. The "user" is whoever is logged into the OS. Anyone who opens the app sees all children and all data.

### Why multi-child from day one
1. Data-model cost is near-zero if done now; retrofitting later means migrating user settings, rewriting dashboard, redesigning notifications.
2. UI cost is small: a child-switcher dropdown in the dashboard header + "+ Add / Remove" in settings. No new screens.
3. Families with multiple school-age kids are common; real users will hit this immediately.
4. Naturally accommodates the "other parent can use this too" requirement — a three-kid family is the same shape as three separate single-kid installs.

### Data shape this locks in
- `children` table: `id, display_name, portal_type ('teacherease'), username, grade, school, created_at`
- Credentials: stored in the OS keychain (Keychain / Credential Manager / libsecret), keyed by `child.id`. Never in SQLite, never in a plain file.
- `scrapes` table: `id, child_id, run_at, status, raw_data_json` — per-child scrape history.
- "Current child" is UI state (not persisted to the DB beyond a last-selected preference).

---

## Q4 — Notification channel & email configuration

**Decision: Default experience is in-app dashboard + OS-level notifications. Email is an opt-in advanced setting with BYO SMTP; no hosted email relay.**

### Default (out of the box)
- First-run setup never mentions email at all.
- Primary push channel is **OS notifications** (Windows toast, macOS Notification Center, Linux libnotify).
- Primary review surface is the **in-app dashboard**.
- Zero config, zero network beyond the portal itself and GitHub update checks.

### Advanced: email (opt-in)
- Lives under **Settings → Advanced → "Email reports (optional)"**, collapsed by default.
- User provides their own SMTP host / port / username / password (BYO SMTP). Typically a Gmail App Password, but any SMTP provider works.
- We provide a **short tutorial** (link or inline page with screenshots) showing how to obtain a Gmail App Password and paste it into the app. We do **not** build an interactive wizard that walks users through Google's UI — just a "here's how, good luck" tutorial.
- Credentials for SMTP are stored in the OS keychain, same as portal credentials.

### Rejected options & why
- **Hosted transactional email relay (Resend/Postmark/SendGrid with our API key baked in).** Rejected for v1. Reasons: (a) adds recurring cost and ongoing infra responsibility (domain, SPF/DKIM, deliverability); (b) breaks the "100% local, no server" privacy story for a product handling kids' grades; (c) the real v1 user base (project author + a few known parents) can handle SMTP config themselves or live without email. May revisit if real users ask for it.
- **Per-user hosted relay (user signs up for Resend themselves).** Rejected — moves the usability cliff from "Gmail App Password" to "go sign up for Resend," same problem on a different site.
- **No-email-ever.** Rejected because some users genuinely want reports in their inbox for permanent record or to see updates while away from the laptop.

### Consequence accepted
- If a user is away from their computer all day (laptop closed, at the office), they won't get OS notifications until they return. If they want push-while-away, they must enable the advanced email option. This is a known limitation, documented in the README.

---

## Q5 — Cross-platform portability of the stack

**Decision: The tech stack runs on Windows, macOS, and Linux without per-OS code branches in the application source. OS-specific behavior is absorbed by Tauri plugins / mature libraries that expose one unified API and pick the right backend per OS at runtime.**

### What is identical across OSes (the ~95%)
- Next.js/React/TypeScript frontend — pure web code in a webview.
- HTTP scraper (`fetch` + `cheerio`) — plain Node/TS, no OS awareness.
- SQLite via `tauri-plugin-sql` — unified JS API, precompiled binaries per OS.
- All business logic, HTML parsing, dashboard UI, scrape scheduling, retry logic, notification content.

### Where OS differences exist but are absorbed by one unified API
| Concern | Library / plugin | Backends |
|---|---|---|
| OS notifications | `tauri-plugin-notification` | Windows toast / macOS UserNotifications / Linux libnotify |
| System tray icon | Tauri built-in `TrayIconBuilder` | Notification area / menu bar / AppIndicator |
| Credential storage | Tauri `stronghold` or Node `keytar` | Credential Manager / Keychain / libsecret |
| Launch at login | `tauri-plugin-autostart` | Registry Run key / LaunchAgent plist / `autostart/*.desktop` |
| App-data folder | Tauri `appDataDir()` | `%APPDATA%` / `~/Library/Application Support` / `~/.config` |
| Updater | `tauri-plugin-updater` | MSI / DMG+app bundle / AppImage or deb |

In every row, application code is the same on all three OSes.

### Parts that are per-OS configuration (not code)
- `tauri.conf.json` has per-OS sections (`windows`, `macOS`, `linux`) for installer type, icons, bundle IDs. Config, not `if (platform === ...)` branches.
- Code signing (if/when added) uses per-OS signing tools in CI, not in app code.

### Cross-platform work that is NOT free
- **CI setup:** need GitHub Actions runners for Windows, macOS, and Linux to produce installers. One-time setup (~1 hour). Free tier covers our scale.
- **Smoke testing per release:** manually run each built installer on its target OS before shipping. ~15 min per release.
- **Code signing:** deferred to post-v1. Apple Developer ($99/yr) + Windows cert (~$200+/yr). Money, not code.

### Target OS priority
- **Primary (v1 shipped and tested):** Windows x64, macOS ARM (Apple Silicon).
- **Secondary (builds produced, not heavily tested):** macOS x64 (Intel), Linux x64.
- All four come from the same codebase and the same CI pipeline — cost of producing the secondary builds is effectively zero.

---

## Q6 — Desktop shell: Tauri vs Electron

**Decision: Tauri.** Frontend is Next.js (static export) + React + TypeScript. Backend/sidecar logic is TypeScript running in a Node process spawned by Tauri (or directly in the Rust core via `tauri::command` for simple glue). Rust is used only as the shell/plumbing layer; we do not write business logic in Rust.

### Why Tauri over Electron
- **Install size.** Tauri uses the OS's native webview (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux) instead of bundling Chromium. Baseline shell is ~5–15 MB vs Electron's ~100+ MB. Combined with dropping Playwright (Q1), total installer is ~15 MB instead of ~400 MB — the single biggest quality-of-life win for non-technical users downloading over home internet.
- **Battery / RAM.** No resident Chromium. Idle footprint is ~10–20 MB RAM with the webview destroyed when the main window is closed. Fits Q2's battery guarantees.
- **Security model.** Tauri sandboxes the webview by default; only explicitly allowed commands are callable from the frontend. Fine-grained capability config.
- **First-class plugins for everything we need.** Tray, autostart, notifications, SQL, updater, stronghold (keychain) — all official. Matches the Q5 portability story exactly.
- **Maturity.** Tauri 2.x is stable, ~80k GitHub stars, used in production. Second-most-popular desktop web shell after Electron.

### Trade-offs accepted
- **Different webviews per OS** means very exotic CSS/JS features can behave differently. For a dashboard UI this is a non-issue; we avoid bleeding-edge web APIs and stick to widely supported React patterns.
- **Rust in the build toolchain.** We don't write Rust application code, but `cargo` is part of the build. One-time setup cost, handled in CI.
- **Smaller community than Electron** — fewer Stack Overflow answers, fewer third-party recipes. Offset by Tauri's own docs being good and Claude being able to fill gaps.

### Revisit if
- A required feature has no Tauri plugin and would require writing meaningful Rust (realistic chance: low — every feature in our scope is already covered).
- Per-OS webview quirks become a material UI problem (realistic chance: very low for a dashboard).

---

## Q7 — First-run setup wizard

**Decision: Short, linear, 4-screen wizard at first launch. Skippable at any point. Everything configured in the wizard is also editable later from Settings.**

### Screens
1. **Welcome.** One sentence: *"Keep track of your child's grades and homework from TeacherEase. Everything stays on your computer."* One **Get started** button. A small **Skip setup** link in the corner.
2. **Add your first child.** Form: child display name, TeacherEase login email, TeacherEase password. Reassurance line: *"Stored securely on this computer and never sent anywhere else."* On **Continue**, we attempt a real login against TeacherEase immediately. On success, credentials go to the OS keychain and we advance. On failure, inline error, stay on the screen. **Live validation before advancing is non-negotiable.**
3. **Notification permission.** Pre-announce with our own copy, then trigger the OS permission prompt on **Allow notifications**. **Skip** is a secondary button; skipping is remembered and is not nagged.
4. **All set.** Run the first scrape inline during the wizard, show a summary ("3 classes meeting, 1 needs attention, 0 missing assignments") before handing off to the dashboard. **Open dashboard** button. Running the first scrape here catches parser/portal/network breakage while the user is still paying attention and delivers value before setup "ends."

### Skip behavior
- **Any screen is skippable** at any point via a **Skip setup** link in the top-right corner of the wizard.
- If the user skips before adding a child, the dashboard opens in an **empty state** with a clear CTA: *"Add your first child to get started"* → button that jumps straight to the same "add child" flow used in Settings.
- If the user skips notifications, we mark it as "not yet granted" and don't re-prompt automatically; the dashboard shows a subtle inline banner once: *"Enable notifications to hear about missing assignments →"* which the user can dismiss permanently.
- Skip does **not** disable launch-at-login — that default stays on regardless.

### Later-editing: everything in the wizard maps to a Settings page
- **Children** — Settings → Children: list with "+ Add child", edit, remove. Same form as wizard screen 2, with the same live-login validation.
- **Notifications** — Settings → Notifications: toggle, re-trigger OS permission prompt if previously denied.
- **First scrape** equivalent — the dashboard's **Refresh now** button.
- **Everything else configurable** (launch at login, scrape frequency, "only run on AC power", optional email SMTP) lives in Settings and is reachable from the tray menu and from the main window.

### Explicitly NOT in the wizard (kept minimal on purpose)
- **Multiple children.** Wizard handles one child; additional kids are added from Settings → Children after setup. Linear wizard > branching wizard for non-tech users.
- **Email / SMTP configuration.** Advanced setting only (per Q4). Never surfaced at first run.
- **Launch-at-login prompt.** Default ON silently. Toggle available in Settings. Don't make the user answer a question they can't meaningfully answer during onboarding.
- **Portal URL entry.** Hardcoded TeacherEase base URL. User never sees the word "URL" in the wizard.
- **"Advanced," "import," "restore"** — none of it in first-run.

### Error copy (plain language, no codes)
- Wrong password → inline: *"Couldn't log in. Double-check your email and password."*
- Portal down → *"TeacherEase isn't responding. Try again now or come back later — we'll save your progress."*
- No internet → *"Looks like you're offline. Connect to the internet and try again."*
- Login succeeded but parser found nothing → *"We logged in, but couldn't find any grades. This might be a temporary issue with TeacherEase — open the dashboard and tap Refresh."* (Still let the user through; surfaces broken-parser cases without blocking access.)

### Target
4 screens, ~90 seconds for a typical user, one input screen only (screen 2). Every decision validated before moving on. Every setting also editable later from Settings.

---

## Q8 — History & data retention

**Decision: Keep full local history of all scrapes in SQLite. The app is stateful — not stateless like the old cron script.**

### What we store
- **`children`** — one row per child (id, display_name, portal_type, username, grade, school, created_at). Credentials live in OS keychain, keyed by child id.
- **`scrapes`** — one row per scrape run (id, child_id, run_at, status [success/failed/parser_error], duration_ms, error_message nullable).
- **`raw_payloads`** — raw parsed JSON from each successful scrape (scrape_id FK, json blob). Enables re-rendering historical views and fixing parser bugs retroactively without re-scraping.
- **`grades`** — normalized per-class snapshot per scrape (scrape_id, class_name, current_grade, status, needs_attention boolean). Enables fast trend queries without parsing the raw blob.
- **`assignments`** — normalized per-assignment snapshot per scrape (scrape_id, class_name, assignment_name, score, max_score, status, due_date). Enables "assignments over time" views and "missing assignment first appeared on" queries.

### Retention policy
- **Keep everything forever by default.** A few years of a single family's data is measured in megabytes, not gigabytes — no reason to prune. Disk cost is irrelevant.
- **Settings → Advanced → "Clear history older than N months"** exists but is off by default. Power-user escape hatch only.
- **Export** button in Settings: dumps the full SQLite DB to a `.db` file the user can copy/back up.

### What history enables
- Trend views ("grade trajectory over the semester").
- "First seen" and "first missing" timestamps for alerts ("this assignment has been missing for 9 days").
- Diffing between runs to drive notifications (notify only on new problems, not repeat problems).
- Retroactive parser fixes — if we find a parsing bug, we can re-derive normalized tables from `raw_payloads` without re-hitting TeacherEase.

### DB location
- Standard OS app-data folder via Tauri `appDataDir()`. One file: `app.db`. SQLite is embedded in the app binary via `tauri-plugin-sql` — no user-visible dependency.

---

## Q9 — Update & distribution

**Decision: GitHub Releases as the canonical first-time download. In-app auto-updater via `tauri-plugin-updater` for subsequent updates. Unsigned binaries in v1, with documented first-launch warning steps.**

### First-time install
- Canonical download: **GitHub Releases** page on the project repo.
- Per-OS assets: Windows `.msi` (or `.exe` installer), macOS `.dmg` (ARM + x64 universal or separate), Linux `.AppImage` and `.deb`.
- README has a clear "Download for Windows / macOS / Linux" section linking to the latest release.
- No app-store distribution in v1 (Microsoft Store / Mac App Store skipped — extra friction, extra review, extra cost).

### In-app updates
- **Tauri built-in updater** (`tauri-plugin-updater`) checks a JSON feed hosted on GitHub Releases on app launch and once per day thereafter.
- On update available: unobtrusive banner in the dashboard header — *"A new version is available. Update now?"* with **Update** and **Later** buttons.
- Clicking Update: download in background, verify signature (Tauri updater requires a signing keypair for the update payload itself — **this is separate from OS code signing** and we will set it up for v1), apply, prompt to restart.
- "Later" remembers the dismissal for that version and nags again on next launch. Never blocks the user.
- Update check can be disabled in Settings → Advanced → "Check for updates automatically" (default on).

### Code signing (OS-level, not updater signing)
- **Skipped for v1.** Apple Developer ($99/yr) and Windows EV cert (~$200+/yr) are both deferred until there's real user demand.
- **Consequence: first-launch warnings on Windows and macOS.** Documented explicitly in README:
  - **Windows SmartScreen:** *"Windows protected your PC" → click "More info" → "Run anyway."*
  - **macOS Gatekeeper:** *"'AppName' can't be opened because Apple cannot check it for malicious software"* → Right-click app → Open → Open anyway; or System Settings → Privacy & Security → "Open Anyway."*
  - **Linux:** no warning, `chmod +x` the AppImage or install the `.deb`.
- README has screenshots of each warning and the exact click path to bypass it. This is the single biggest UX wart of skipping signing and it deserves a proper walkthrough.
- Revisit signing if: real non-technical users hit the warning and bail, or the project grows beyond "me and a few parents I know."

### Updater signing (required, different thing)
- Tauri's updater signs the update payload with a keypair we generate once. The public key is baked into the app at build time; the private key lives in GitHub Actions secrets.
- This prevents a compromised GitHub release from pushing a malicious update. One-time setup, zero ongoing cost.

---

## Q10 — Localization

**Decision: English only in v1. No i18n framework wired up.**

### Rationale
- Target users are all English-speaking.
- i18n adds real complexity (string extraction, translation files, per-locale date/number formatting, RTL considerations) that we don't need.
- Strings live inline in the React components. If we ever need a second language, retrofitting i18n is a known, mechanical refactor (`react-i18next` or `next-intl`) — not a rewrite.

### Revisit if
- A real user requests another language (most likely Chinese given the author's background).
- The project grows beyond the initial circle.

---

## Q3 — Project name & repo

**Decision: Name is "TeacherEase Parent Companion". Repo slug is `teacherease-parent-companion`. Public GitHub repo under `autumnfallenwang`.**

- GitHub URL: https://github.com/autumnfallenwang/teacherease-parent-companion
- License: MIT (matches predecessor).
- Initial scaffold: README, LICENSE, `.gitignore` covering Node/Next.js, Rust/Tauri, env/secrets, SQLite, OS files, and editor metadata.
- Local working copy: `/home/aaronwang/agentic/homework/teacherease-parent-companion/`.
- Predecessor repo (`teacherease_parents_helper`, Python + Playwright) stays as-is for the author's own server use; the new repo is the desktop rewrite.
