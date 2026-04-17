# Releasing — runbook

End-to-end steps for cutting a release. The release workflow (`.github/workflows/release.yml`) handles building, signing, and draft-release creation on tag push; the maintainer does the version bump, commit, tag, review, and publish.

See also: [`updater-signing.md`](updater-signing.md) for the signing keypair and GH-secret setup.

## Pre-flight checklist

Run once before the very first release. For every release after, skim to confirm nothing has drifted.

- [ ] `gh secret list` shows `TAURI_SIGNING_PRIVATE_KEY`. (See `docs/updater-signing.md` if not.)
- [ ] (Password-protected key only:) also shows `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- [ ] `cat tauri-updater.pub` matches `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` — drift here breaks signature verification for every installed app.
- [ ] Repo → Settings → Actions → General → Workflow permissions is "Read and write permissions". `tauri-action` needs this to create Releases.
- [ ] `pnpm check` green on main: lint + typecheck + full test suite.
- [ ] `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` green in `src-tauri/`.
- [ ] Working tree clean: `git status` has no uncommitted tracked changes.

## Cut a release

### 1. Update the changelog

Edit `CHANGELOG.md`:

- Move everything under `## [Unreleased]` into a new `## [X.Y.Z] — YYYY-MM-DD` section. Fill in today's date.
- Leave a new empty `## [Unreleased]` above it.
- Update the comparison links at the bottom of the file.

### 2. Bump version numbers

Keep these in sync:

- `package.json` → `"version": "X.Y.Z"`
- `src-tauri/tauri.conf.json` → `"version": "X.Y.Z"`

### 3. Commit

```bash
git add CHANGELOG.md package.json src-tauri/tauri.conf.json
git commit -m "chore: release vX.Y.Z"
```

### 4. Tag and push

```bash
git tag vX.Y.Z
git push origin main --tags
```

The tag push triggers `.github/workflows/release.yml` immediately.

### 5. Watch the workflow

```bash
gh run watch
```

Or open the Actions tab in the browser. Four jobs run in parallel (Linux / Windows / macOS-arm64 / macOS-x64) and typically complete in 10–15 minutes each.

If a job fails, see Troubleshooting below. The workflow is re-runnable from the Actions tab.

### 6. Review the draft release

Once all jobs succeed, `tauri-action` creates a **draft** release at:

```
https://github.com/autumnfallenwang/teacherease-parent-companion/releases
```

Verify the assets list includes:

- `TeacherEase Parent Companion_X.Y.Z_amd64.AppImage` (+ `.sig`)
- `TeacherEase Parent Companion_X.Y.Z_amd64.deb` (+ `.sig`)
- `TeacherEase Parent Companion_X.Y.Z_x64_en-US.msi` (+ `.sig`)
- `TeacherEase Parent Companion_X.Y.Z_aarch64.dmg` (+ `.sig`)
- `TeacherEase Parent Companion_X.Y.Z_x64.dmg` (+ `.sig`)
- `latest.json` — the manifest that `tauri-plugin-updater` reads

Exact file names may vary by Tauri version; the key thing is each bundle has a matching `.sig` and `latest.json` is present.

### 7. Edit the release body and publish

1. Click the draft release → Edit.
2. Replace the placeholder body with the new `[X.Y.Z]` section from `CHANGELOG.md`.
3. Click **Publish release**.

Publishing moves the release from "draft" to "latest," which is what makes `https://github.com/autumnfallenwang/teacherease-parent-companion/releases/latest/download/latest.json` resolve for already-installed apps.

## Smoke test

Minimum viable smoke test — install on at least one OS and confirm the app launches:

- **Linux:** `chmod +x *.AppImage && ./TeacherEase*.AppImage`. First-run wizard should appear.
- **Windows:** double-click the `.msi`. SmartScreen nags (More info → Run anyway). First-run wizard should appear.
- **macOS:** mount the `.dmg`, drag to Applications. Gatekeeper nags (right-click the app → Open → Open). First-run wizard should appear.

Ideal smoke test: complete the wizard with real credentials, trigger a refresh, confirm grades render.

## Verify the updater (first time only)

After the first release (v0.1.0), cut v0.1.1 to confirm the update path works end-to-end.

1. On a test machine / VM, install v0.1.0.
2. Back on the dev machine, cut v0.1.1 using the steps above. Ideally with a small, visible change (e.g. update the About page version string — which happens automatically via the version bump).
3. Wait for the draft to build + publish.
4. Launch the v0.1.0 install. Within a few seconds, the top-of-main update banner should appear showing "Version 0.1.1 available".
5. Click **Install**. The app should download, verify the signature, install, and relaunch as v0.1.1.
6. Open Settings → About and confirm the version number updated.

If the banner never appears:
- Confirm `updater.enabled` is `1` in the `settings` table (Settings → Advanced → "Check for updates" toggle on).
- Check logs (Settings → About → View logs) for `updater:` entries.
- Confirm `https://github.com/autumnfallenwang/teacherease-parent-companion/releases/latest/download/latest.json` returns 200 (not 404).

If install fails with "signature verification failed": pubkey in the app drifted from the signing key. See `docs/updater-signing.md` Troubleshooting.

## Troubleshooting

### Workflow fails with `TAURI_SIGNING_PRIVATE_KEY is not set`

GH secret not uploaded. See `docs/updater-signing.md`.

### Workflow fails with permission denied creating release

Repo → Settings → Actions → General → Workflow permissions is "Read-only". Switch to "Read and write permissions".

### `gh run watch` shows a job stuck on "Install Linux Tauri deps"

APT transient failure. Re-run the failed job from the Actions tab.

### macOS build fails with `codesign` error

You're hitting Apple's code-signing requirements, which are separate from Tauri's updater signing. Per design-plan Q9, OS code signing is deferred; the workflow shouldn't invoke `codesign`. If this error appears, something in `tauri.conf.json` accidentally enabled macOS signing — check for `macOSPrivateApi` or signing-related fields.

### Release body still says the placeholder text

You forgot step 7. Edit the draft, paste the CHANGELOG section, publish. The placeholder is a reminder, not a bug.

## Post-release

- If user-visible features changed, update `README.md`'s feature list.
- For significant releases, announce on the project README / issue tracker.
- Sanity check: the published release shows "Latest" badge on the Releases page, and `latest.json` is downloadable.
- **Update this runbook** if you hit anything that this document got wrong. The first few releases are learning opportunities.
