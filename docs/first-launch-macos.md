# First launch on macOS

The DMG downloaded from the [Releases page](https://github.com/autumnfallenwang/teacherease-parent-companion/releases) is unsigned — we haven't purchased an Apple Developer ID certificate ($99/year). macOS Gatekeeper blocks unsigned apps by default. This walkthrough gets you past it.

> **Note:** screenshots are not included yet — the text below uses exact menu names. If your dialog looks different, [file an issue](https://github.com/autumnfallenwang/teacherease-parent-companion/issues) with a photo. (Future screenshots will land under `public/img/first-launch-macos/`.)

## Pick the right architecture

The release page publishes two DMGs for macOS:

- `TeacherEase Parent Companion_X.Y.Z_aarch64.dmg` — Apple Silicon (M1, M2, M3, M4 — 2020 MacBook Air and newer).
- `TeacherEase Parent Companion_X.Y.Z_x64.dmg` — Intel Macs (2019 and earlier).

Check your chip: **Apple menu → About This Mac → Chip** (e.g. "Apple M2", "Intel Core i5"). Download the matching DMG. Using the wrong arch runs under Rosetta 2 with a performance penalty.

## Step-by-step (macOS 14 Sonoma and earlier)

1. Double-click the DMG to mount it.
2. Drag **TeacherEase Parent Companion.app** onto the Applications shortcut in the DMG window.
3. Eject the DMG.
4. Open **Finder → Applications**.
5. **Right-click** (or Ctrl-click / two-finger trackpad click) on **TeacherEase Parent Companion** → **Open**.
6. A dialog appears: *"macOS cannot verify the developer of 'TeacherEase Parent Companion'. Are you sure you want to open it?"* — click **Open**.
7. The app launches. Gatekeeper remembers this bypass for future launches.

## Step-by-step (macOS 15 Sequoia and newer)

Apple removed the right-click → Open shortcut in Sequoia. The flow is slightly longer but still straightforward:

1. Mount the DMG and drag the app to Applications as before.
2. Double-click the app in Applications. macOS blocks it with: *"'TeacherEase Parent Companion' cannot be opened because it is from an unidentified developer."* Click **Done** (or **Cancel**).
3. Open **System Settings → Privacy & Security**.
4. Scroll to the **Security** section. You'll see a new line: *"TeacherEase Parent Companion was blocked because it is not from an identified developer."* Click **Open Anyway**.
5. Re-launch the app from Applications. One final confirmation dialog — click **Open**.
6. The app launches. Gatekeeper remembers this bypass.

## Why the warning appears

Apple's Gatekeeper flags any app that isn't signed with a registered Apple Developer ID and notarized through Apple's service. Signing requires a $99/year certificate; notarization requires going through Apple's scanner for each build. Both are deferred for v0.1 until demand justifies the cost.

The app is open source — the [complete source code](https://github.com/autumnfallenwang/teacherease-parent-companion) can be audited before install.

## What goes away automatically

Unlike Windows SmartScreen (which has a reputation-based system), macOS Gatekeeper does not "warm up" over time. Every fresh install on every Mac shows the warning until Apple notarizes a build. The bypass is per-user, per-app, persistent — you'll redo it once per Mac you install on.

## Verifying the download (optional but recommended)

```bash
shasum -a 256 "TeacherEase Parent Companion_0.1.0_aarch64.dmg"
```

Compare against a hash from a second download on a different network, or a known-good install on another machine. For automatic integrity of subsequent updates, the installed app verifies every update against our minisign public key baked into the binary (`tauri-plugin-updater`).

## Uninstall

- Before trashing the app, the cleanest way to wipe all data is **Settings → Advanced → Reset app** from inside the app. That nukes the local DB (credentials + grades + homework + all settings) in one click.
- Drag `/Applications/TeacherEase Parent Companion.app` to the Trash.
- App data lives at `~/Library/Application Support/dev.autumnfallenwang.teacherease-parent-companion/` — delete this folder to wipe the local database and logs if you skipped the in-app reset.
- **Upgraders from v0.1.2**: if you ever used a pre-Q34 build, there may be leftover keychain entries in **Keychain Access → login keychain** named `teacherease-parent-companion`. Reset-app already sweeps them, but they can also be removed manually.
