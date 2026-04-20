# User guide

Quick reference for parents who just installed TeacherEase Parent Companion.

---

## Install

Grab the right file for your system from the [Releases page](https://github.com/autumnfallenwang/teacherease-parent-companion/releases/latest).

| Your system | Download | How to install |
|---|---|---|
| **Windows** | `*_x64-setup.exe` | Double-click. Windows may show a "SmartScreen" warning on first launch — click "More info" then "Run anyway". The app is unsigned at the OS level in early releases; see [first-launch-windows.md](first-launch-windows.md) for the walkthrough. |
| **macOS (Apple Silicon, M1/M2/M3/M4)** | `*_aarch64.dmg` | Double-click → drag icon to Applications. First launch: right-click the app in Applications → Open → Open (bypasses Gatekeeper). See [first-launch-macos.md](first-launch-macos.md). |
| **macOS (Intel)** | `*_x64.dmg` | Same as above but pick the x64 DMG instead. |
| **Linux (Ubuntu/Debian/Mint)** | `*_amd64.deb` | `sudo dpkg -i TeacherEase*.deb` — or double-click in your file manager to launch the system package installer. |
| **Linux (any distro)** | `*_amd64.AppImage` | Mark executable + run: `chmod +x TeacherEase*.AppImage && ./TeacherEase*.AppImage`. No install required. |

**After installing**, open the app. You'll see a one-time disclaimer. Acknowledge to continue.

---

## Add your first child

Open the app → Today tab shows "No children yet" → click **Add your first child**.

That takes you to **Settings → Children**. Click **Add another child** and fill in:

- **Child's name** — whatever you want to call them in the app. Not sent anywhere.
- **TeacherEase email** — the email you use to log into your school's TeacherEase portal.
- **Password** — your TeacherEase portal password. Stored in your OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service), not in the app's database.
- **Homework page URL** (optional) — if your school publishes homework on a Google Sites page, paste that URL here. Leave blank if not. You can add it later.

Click **Save**. The app validates the login against TeacherEase live. If it fails, you'll see an error — likely a typo in email or password.

Repeat for each child.

---

## How fetching works

The app automatically pulls grade data on a schedule. Default is **4 times a day** at evenly-spaced local times (00:00 / 06:00 / 12:00 / 18:00).

To adjust: **Settings → Fetch**:
- **Fetches per day** — 1 to 8. Default 4.
- **First slot at** — the "starting" time for the day's slots. Default `00:00`. Set to `06:00` and the slots become 06:00 / 12:00 / 18:00 / 00:00 — better aligned with a typical school day.
- **Skip weekends** — toggle to skip Saturday and Sunday runs entirely. Off by default.
- **Time slots** — shows every trigger time for today (or Monday if weekend-skipping is on).
- **Fetch now** button — manually pull right now without waiting for the next scheduled slot.

**The fetcher only runs while the app is open.** Autostart is on by default (set in Settings → Advanced → Start on login), so the app is normally running in the background whenever you're signed in.

If you open the app after more than 6 hours of not running, it does a silent catch-up fetch automatically.

---

## How notifications work

The app can send a single daily digest notification summarizing what needs your attention across all children. Default is **once a day at 07:00 local**.

To adjust: **Settings → Notifications**:
- **Desktop** — on/off for OS system notifications.
- **Email** — set up SMTP to receive the same digest as an HTML email. Click **Set up email** → enter SMTP host/port/username/password + one or more recipient addresses. After saving, a test email fires so you can confirm it arrived.
- **Schedule** — same shape as Fetch: Notifications per day, First slot at, Skip weekends.
- **Send digest now** — fire a digest right now using current data, bypassing the schedule.

**What the digest contains** — per child:
- How many classes need attention.
- What's meeting expectations.
- Today's homework list (if homework URL is configured).
- What's due today.

The desktop notification is a concise hero-level summary. The email version shows full per-child detail.

---

## Tabs at a glance

- **Today** — current snapshot: per-child hero, attention list, homework for/due today.
- **Classes** — every class with progress bars + status; click a class to drill into standards + assignments.
- **History** — every homework entry ever captured, grouped by month. Use the dropdown to browse.
- **Settings** — Children, Appearance, Attention, Fetch, Notifications, Advanced.
- **About** — app version, logs, legal disclaimer.

---

## Troubleshooting

**"No stored password" error in logs.** Your OS keychain either denied access or the stored credential is missing. Open Settings → Children → Edit the child → re-enter password → Save.

**Fetch keeps failing.** Check Settings → Fetch → "Last successful fetch" per child. If it's been failing for a while, try **Fetch now** and watch Settings → About → View logs for the specific error. Most common: password changed on the portal side; re-enter in Settings → Children.

**Email test doesn't arrive.** Gmail users: your regular password won't work, you need an [App Password](https://myaccount.google.com/apppasswords) (requires 2-step verification on your Google account). The in-app **Settings → Notifications → Email → Setup guide** link walks through this. Other SMTP providers: double-check host/port. Port 587 uses STARTTLS, port 465 uses implicit TLS; this app detects automatically based on port.

**Homework tab shows nothing.** The child's homework URL isn't configured, or the URL is correct but the Google Sites page structure isn't what the scraper expects. Settings → Children → Edit → paste a working Google Sites URL.

**App is using too much disk.** The DB accumulates scrape history forever. Settings → Advanced → **Clear history** wipes grades/homework/classes tables but keeps children and credentials. Or use **Reset app data** to wipe everything back to first-install state.

**I want to uninstall cleanly.** Click **Settings → Advanced → Reset app data**, confirm, and the app exits. Then uninstall the app via your OS's normal mechanism (Windows: Add/Remove Programs. macOS: drag to Trash. Linux: `apt remove` or delete the AppImage).

---

## Getting help

- Bug or feature request: [GitHub issues](https://github.com/autumnfallenwang/teacherease-parent-companion/issues).
- Privacy + responsible-use policy: [DISCLAIMER.md](../DISCLAIMER.md).
- Developer-oriented docs: [CLAUDE.md](../CLAUDE.md).
