# Updater signing — runbook

Tauri's updater plugin verifies every downloaded update payload against a public key baked into the app at build time. The matching private key signs each payload during the GH Actions release workflow (R3). This runbook covers the one-time keypair setup, rotation, and loss recovery.

Design-plan locked decision: **Q9** — updater signing is required and separate from OS code signing.

## Prerequisites

- Tauri CLI (`pnpm tauri`) — already in project devDependencies.
- `gh` CLI authenticated against this repo. Install: <https://cli.github.com/>.
- A secure home for the local private-key file (password manager, encrypted archive — NOT iCloud/Dropbox in plaintext).

## One-time keypair generation

Run locally. The private key will be written to `~/.tauri/`; the public key is printed to stdout.

```bash
mkdir -p ~/.tauri
pnpm tauri signer generate -w ~/.tauri/teacherease-parent-companion.key --password ""
```

### What `--password ""` means

Passwordless key. GitHub's encrypted-secret storage is the defense layer; adding a password doubles the rotation surface (if either the key or the password is lost, the key is useless) and adds a second GH secret to manage. For a small-maintainer project, passwordless is the standard choice.

**If you prefer password-protected:** drop `--password ""` — the CLI will prompt interactively. Note this means you'll also need a `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GH secret. The R3 workflow will reference both.

### What the output looks like

Tauri writes two files and prints their paths:

```
Your keypair was generated successfully:
Private: /home/<you>/.tauri/teacherease-parent-companion.key    (Keep it secret!)
Public:  /home/<you>/.tauri/teacherease-parent-companion.key.pub
```

The `.pub` file contains a single line of base64 that decodes to minisign's public-key format (starts with `dW50cnVzdGVkIGNv...` = "untrusted comment:..."). That's the content you'll commit to `tauri-updater.pub` at the repo root.

**Do NOT touch** the `.key` file (without `.pub`) — that is the private key. Never paste its contents to chat, email, Slack, or a PR.

## Public-key commit

Copy the `.pub` file into the repo root as `tauri-updater.pub`:

```bash
cp ~/.tauri/teacherease-parent-companion.key.pub tauri-updater.pub
```

Commit:

```bash
git add tauri-updater.pub
git commit -m "chore: add updater signing public key (R1)"
```

`.gitignore` already carves out `tauri-updater.pub` from the `*.key` / `*.pem` blanket exclusion (lines 50–53 of `.gitignore`).

R2 will read this file when wiring `plugins.updater.pubkey` in `tauri.conf.json`.

## GH secrets setup — REQUIRED before tagging v0.1.0

R3's release workflow (`.github/workflows/release.yml`) reads the private key from `TAURI_SIGNING_PRIVATE_KEY`. Without it, tag push → workflow fails at the build step with `TAURI_SIGNING_PRIVATE_KEY is not set`.

Upload the key:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/teacherease-parent-companion.key
```

If password-protected:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
# paste password at the prompt
```

Verify:

```bash
gh secret list
```

Should show `TAURI_SIGNING_PRIVATE_KEY` (and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if password-protected) with a recent `Updated` timestamp. Secret values are never displayed back.

### Pre-flight checklist (run before tagging v0.1.0 — R4)

- [ ] `gh secret list` shows `TAURI_SIGNING_PRIVATE_KEY`.
- [ ] (Password-protected key only:) also shows `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- [ ] `cat tauri-updater.pub` matches the `plugins.updater.pubkey` string in `src-tauri/tauri.conf.json`. If these drift, signature verification will fail on every installed app.
- [ ] Repo settings → Actions → Workflow permissions is set to "Read and write permissions" (default). Required for `tauri-action` to create the Release.

## Local backup

The `.key` file is cryptographic identity for the entire update channel. Losing it without a GH-secret backup means every existing user is stranded on their current version (see "Loss recovery" below). Keep a copy:

- Encrypted archive in a password manager (1Password, Bitwarden, etc.) — treat as a secret note or file attachment.
- **Never** commit, email, Slack, or store in plaintext cloud storage.

## Rotation plan

When to rotate:
- Suspected compromise (laptop lost/stolen, shared accidentally, exposed in a log).
- After a major version (optional, defense in depth).
- When a maintainer leaves the project.

Rotation is disruptive — it breaks auto-update for every existing install. Don't rotate casually.

Steps:
1. Generate a fresh keypair:
   ```bash
   pnpm tauri signer generate -w ~/.tauri/teacherease-parent-companion-v2.key --password ""
   ```
2. Overwrite `tauri-updater.pub` with the new public key. Commit to `main`.
3. Update the GH secret:
   ```bash
   gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/teacherease-parent-companion-v2.key
   ```
4. Bump app version in `src-tauri/tauri.conf.json` + `package.json`.
5. Tag + release via the R3 workflow.
6. **Include this line in the release notes:**
   > This release rotates our update signing key. If you're upgrading from v0.x.y or earlier, the auto-updater will not accept this build — please download manually from the [Releases page](https://github.com/autumnfallenwang/teacherease-parent-companion/releases) once, then auto-updates will resume.

Tauri's updater does not support chain-of-trust rotation (a key signing a successor key); each build accepts exactly one pubkey. The "install once manually" step is an unavoidable consequence.

## Loss recovery

Two scenarios:

### 1. Lost local `.key` file, but GH secret is still set

Still shippable via GH Actions — the release workflow uses the GH secret, not your local file.

Immediate next steps:
1. Treat the old key as compromised (we can't prove it wasn't leaked on the lost machine).
2. Rotate per the "Rotation plan" above.
3. Restore the new key to your local machine and your password manager.

### 2. Lost local `.key` file AND the GH secret value

(E.g., someone accidentally ran `gh secret delete TAURI_SIGNING_PRIVATE_KEY` and the local copy is gone.)

The private key is gone. You cannot sign updates with that identity ever again.

Forward path:
1. Generate a new keypair.
2. Ship v0.X.Y with the new pubkey baked in.
3. **Existing users on the old key never receive this update automatically.** They must visit the Releases page and download the installer manually.
4. Release notes must flag this clearly.

This is a bad day but survivable. The cost is manual re-download for every active user, not data loss.

## Verification

After generation + pubkey commit:

- [ ] `ls ~/.tauri/teacherease-parent-companion.key` exists and is readable.
- [ ] `git status` shows no `.key` file staged (should be blocked by `.gitignore`).
- [ ] `cat tauri-updater.pub` returns a single line of base64; 60–120 chars.
- [ ] `git log -- tauri-updater.pub` shows the commit.

## Troubleshooting

### Release workflow fails with `TAURI_SIGNING_PRIVATE_KEY is not set`

The GH secret wasn't uploaded (or was uploaded to the wrong scope). Fix: `gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/teacherease-parent-companion.key`, then re-run the failed workflow.

### Installed app says "signature verification failed" on update

The pubkey in `src-tauri/tauri.conf.json` doesn't match the private key that signed the release. Either the build used an older private key (check GH secret value) or the `plugins.updater.pubkey` string was edited by hand and corrupted. Fix: overwrite `plugins.updater.pubkey` with the exact content of `tauri-updater.pub` (one line, no whitespace changes), rebuild + re-release.

### CI (`ci.yml`) build step fails with signing-related error

The base `tauri.conf.json` should NOT have `bundle.createUpdaterArtifacts: true` — that's only set via `--config` override in `release.yml`. If you see signing errors in PR CI, confirm the flag is absent from the base config.

## Files

| File | Home | Committed |
|---|---|---|
| `~/.tauri/teacherease-parent-companion.key` | Your machine only | No — `.gitignore` line 45 (`*.key`) + line 51 |
| `tauri-updater.pub` | Repo root | Yes — `.gitignore` carve-out line 53 |
| GH secret `TAURI_SIGNING_PRIVATE_KEY` | GitHub Actions | N/A (encrypted at GitHub) |

## Related tasks

- **R2:** `tauri.conf.json` wires `plugins.updater.pubkey` from `tauri-updater.pub` + installs `tauri-plugin-updater`.
- **R3:** GH Actions release workflow signs update payloads using the GH secret.
- **R4:** First public v0.1.0 release exercises the full signing pipeline.
