# Quick start

From "I just downloaded this" to "I'm getting daily emails about my kid's grades" in about 10 minutes.

> Screenshots are from a Mac M4 (Apple Silicon). Windows works the same way after step 1 — pick the right installer below, the rest of the flow is identical.

---

## Download the right file for your OS

Open the **[releases page](https://github.com/autumnfallenwang/teacherease-parent-companion/releases)** and find the release marked **Latest** at the top — that's the one you want. Scroll down to its **Assets** and grab the file that matches your machine.

![Picking the right release file](docs/quickstart/01-release-page.png)

- **Mac with M1 / M2 / M3 / M4** → `..._aarch64.dmg`
- **Mac with Intel chip** → `..._x64.dmg`
- **Windows** → `..._x64-setup.exe`

Not sure which Mac you have: Apple menu → About This Mac → Chip. Anything starting with "Apple M" → `aarch64.dmg`.

---

## Install

Double-click the `.dmg` and drag the app onto Applications. Eject the DMG when it's done.

![Drag-to-Applications DMG window](docs/quickstart/02-drag-to-applications.png)

---

## First launch on macOS — bypass Gatekeeper

The app isn't code-signed, so the first launch shows:

![macOS "damaged" dialog](docs/quickstart/03-damaged-dialog.png)

**Click Cancel.** Don't move it to Trash — the app isn't damaged, macOS just blocks unsigned downloads. Open **Terminal** and run:

![Terminal: xattr command](docs/quickstart/03-terminal-xattr.png)

```sh
xattr -dr com.apple.quarantine "/Applications/TeacherEase Parent Companion.app"
```

This strips the "downloaded from internet" tag. Now double-click the app and it'll open.

---

## Acknowledge the disclaimer

First launch shows a one-screen disclaimer covering what the app does, where credentials are stored, and your responsibilities.

![Disclaimer screen](docs/quickstart/04-disclaimer.png)

Read it, then click **I understand — continue**. Only appears once (or after Reset App).

---

## Lay of the land

You're now in the empty app.

![Empty-state app layout](docs/quickstart/05-empty-app.png)

- **Today / Classes / History** (top of the sidebar) — the three views of your kid's data.
- **Settings / About** (bottom) — configuration + version info.
- **Main area** — empty until you add a child. The green button gets you there.

---

## Pick a theme (optional)

Before adding data, set the look. **Settings → Appearance** has Profile / Mode / Size pickers.

![Appearance settings](docs/quickstart/06-appearance.gif)

Pick the combo that's most comfortable for your eyes.

---

## Add your first child + run a fetch

This is where the app starts working.

### Settings → Children → Add another child

![Add child form](docs/quickstart/07a-add-child.gif)

Fill in:
- **Child's name** — anything you want; only displayed locally.
- **TeacherEase email + password** — the credentials you use on the parent portal.
- **Homework page URL** (optional) — Google Sites homework page if your team has one.

Click **Add child**. The app validates the credentials by attempting a login before saving.

### Repeat for each child

![Children configured](docs/quickstart/07b-children-list.png)

### Run your first fetch

**Settings → Fetch → Fetch now** pulls data for every child immediately.

![Fetch now](docs/quickstart/07c-fetch-now.png)

The "Last successful fetch" list updates as each child completes. Expect 3–10 seconds per child.

### Today + Classes are now live

**Today** shows what needs attention right now — missing assignments, low scores in the forgiveness window, plus today's homework.

![Today tab populated](docs/quickstart/07d-today.png)

**Classes** shows every class with progress + status. Click a class to drill into standards and assignments.

![Classes tab populated](docs/quickstart/07e-classes.png)

### History

Homework over time, grouped by day.

![History tab](docs/quickstart/08-history.png)

---

## Tune what counts as "attention"

**Settings → Attention** — what counts as missing or low-score, and how long stale items keep nagging you.

![Attention settings](docs/quickstart/08a-attention-settings.png)

- **Forgiveness window** — how many weeks a missing/low-score item keeps showing up before it stops nagging.
- **Low-score threshold** — assignments graded below this trigger an alert.
- **Icon reference** — legend for the status icons you'll see across Today / Classes / History (Missing recent/older, Low score recent/older, Meeting, Not graded).

---

## Schedule when fetches run

**Settings → Fetch** — set how often the app pulls data and when the first run of the day happens.

![Fetch schedule](docs/quickstart/08b-fetch-schedule.png)

- **Fetches per day + First slot at** — frequency and the time of the first run; the rest of the day's slots fill in evenly.
- **Skip weekends** — pause Saturday and Sunday. On by default.
- **Fetch now** — kick off a manual fetch any time without waiting for the next slot.

---

## Set up Gmail for daily email digests

If you want a daily email summary of what needs attention, you'll need an **App Password** from Google. Regular Gmail passwords don't work for SMTP.

### Open Google Account → Security → 2-Step Verification

Go to [myaccount.google.com/security](https://myaccount.google.com/security) and click **2-Step Verification**.

![Google Account security page](docs/quickstart/09a-google-security.png)

### Turn on 2-Step Verification

Required before you can create app passwords. Click **Turn on 2-Step Verification** and follow Google's flow.

![Enable 2-Step Verification](docs/quickstart/09b-enable-2sv.png)

### Create the app password

Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). Type a name (e.g. `TeacherEase Companion`) and click **Create**.

![Create app password](docs/quickstart/09c-create-app-password.png)

### Copy the 16-character password

Google shows it once. Copy it now — you can't retrieve it later, only regenerate.

![Generated app password](docs/quickstart/09d-app-password.png)

---

## Wire SMTP into the app

### Settings → Notifications → Email → set up SMTP

![Email SMTP form](docs/quickstart/10a-email-smtp-form.png)

For Gmail:
- **Host:** `smtp.gmail.com`
- **Port:** `587`
- **Username:** your full Gmail address
- **Password:** the 16-character App Password you just generated (no spaces)
- **From:** same as Username — Gmail rejects mail sent from a different address.
- **To:** where the digest gets delivered. Add multiple recipients if needed.

Leave **Send test email after save** on. Click **Save & send test email** — you should get an email within a few seconds.

### Schedule the digest

![Notifications panel](docs/quickstart/10b-notifications-panel.png)

- **Email digest** toggle — turn on to send daily summaries.
- **Notifications per day + first slot** — how often + when to send.
- **Fetch fresh data first** — runs a fetch right before sending so the digest reflects today's portal state. Recommended.
- **Send digest now** — sends immediately, useful for testing.

---

## Settings → Advanced

![Advanced settings](docs/quickstart/11-settings-advanced.png)

- **Check now** — check for app updates and install the latest version directly from here, no need to revisit the releases page.
- **Start on login** — auto-launch when you sign in (so the scheduler can run unattended).
- **Reset app** — wipes all data and returns to first-install state. Use only if you want to start over.

---

## About

![About page](docs/quickstart/12-about.png)

Shows the current version plus the disclaimer, privacy notes, and the source repo. The **View logs** link at the bottom opens the log folder — attach the latest file when reporting an issue so the developer can see what happened.

---

## Get help

- **GitHub issue** — [open an issue](https://github.com/autumnfallenwang/teacherease-parent-companion/issues/new) on the repo.
- **Email the developer** — qiushiwang0702@gmail.com.
