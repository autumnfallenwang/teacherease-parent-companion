# First launch on Windows

The MSI installer downloaded from the [Releases page](https://github.com/autumnfallenwang/teacherease-parent-companion/releases) is unsigned at the OS level — we haven't purchased a Windows code-signing certificate. Windows SmartScreen will flash a warning on first launch. This walkthrough gets you past it.

> **Note:** screenshots are not included yet — the text below uses the exact button names. If your dialog looks different, [file an issue](https://github.com/autumnfallenwang/teacherease-parent-companion/issues) with a photo so we can update this doc. (Future screenshots will land under `public/img/first-launch-windows/`.)

## What to expect

When you double-click the downloaded `.msi`, Windows shows:

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognized app from starting. Running this app might put your PC at risk.

With two buttons: **Don't run** (default) and a small **More info** link.

## Step-by-step

1. Double-click the downloaded `.msi`.
2. When the SmartScreen dialog appears, click the **More info** link (it looks like grey text, not a button).
3. A new line appears with the publisher shown as **Unknown publisher** and a **Run anyway** button. Click **Run anyway**.
4. Windows may show a UAC prompt asking for permission to install — click **Yes**.
5. The MSI installer runs as normal. Accept the license, pick the install location, finish.
6. Launch the app from Start Menu → **TeacherEase Parent Companion**.

After install, SmartScreen does not nag again for this app; the warning is installer-only.

## Why the warning appears

SmartScreen flags anything without established reputation, independent of whether the binary is actually safe. An unsigned MSI with no history of installs triggers the warning by default. Our binary is open source — the [complete source code](https://github.com/autumnfallenwang/teacherease-parent-companion) can be audited before or after install.

Code signing for Windows costs $200+/year per certificate authority and is deferred until there's demand. Paying it would remove the warning entirely.

## What goes away automatically

Once enough people install the MSI without flagging it as malware, SmartScreen's reputation system lifts the warning organically. That process can take weeks to months and isn't under our control. Signed builds bypass this by carrying a trusted publisher identity.

## Verifying the download (optional but recommended)

If you want extra confidence before running the installer:

1. On the [Release page](https://github.com/autumnfallenwang/teacherease-parent-companion/releases), find the MSI asset.
2. In PowerShell, compute the SHA-256 of your downloaded file:
   ```powershell
   Get-FileHash "TeacherEase Parent Companion_0.1.0_x64_en-US.msi" -Algorithm SHA256
   ```
3. Compare the hash against what you see on the release page (GitHub shows file sizes in the asset list — for the hash itself, we rely on the manual comparison between your freshly-downloaded copy and a second downloaded copy on a different network, or the hash of a known-good install on another machine).

For update-time integrity, `tauri-plugin-updater` verifies every downloaded update payload against our minisign public key baked into your installed app. This is the primary defense against tampered updates going forward — the OS-signing warning only matters for the very first install.

## If something looks wrong

- Don't run the installer.
- Open an issue at [github.com/autumnfallenwang/teacherease-parent-companion/issues](https://github.com/autumnfallenwang/teacherease-parent-companion/issues) with the SHA-256 you observed and a screenshot of the download URL.

## Uninstall

- Before uninstalling, the cleanest way to wipe all data is **Settings → Advanced → Reset app** from inside the app. That nukes the local DB (credentials + grades + homework + all settings) in one click.
- **Settings → Apps → Installed apps** → find **TeacherEase Parent Companion** → **Uninstall**.
- The app-data folder at `%APPDATA%\dev.autumnfallenwang.teacherease-parent-companion\` contains your local database + logs. Delete it manually if you skipped the in-app reset.
- **Upgraders from v0.1.2**: if you ever used a pre-Q34 build, there may be leftover entries under **Credential Manager → Windows Credentials** named `teacherease-parent-companion`. Reset-app already sweeps them, but they can also be removed manually.
