---
name: commit
description: Git commit with conventional format. Use when the user wants to commit, save progress, push changes, or says "commit", "save this", "push it", or "ship it".
---

## Step 1: Verify → `/check fast`

Run `/check fast`. Abort if anything fails.

## Step 2: Stage and commit

1. Stage changed files with `git add` (specific files, not `-A` — avoids accidentally committing secrets or debug HTML dumps).
2. Commit with message: `$ARGUMENTS`
3. Push to remote with `git push`

Message must use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.

Append to the commit body:

```
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

## Never commit

- `.env` files (any variant except `.env.example`)
- SQLite DBs (`*.db`, `*.sqlite`)
- Debug HTML dumps from the scraper (`logs/`, `*_debug.html`)
- Updater private keys (`tauri-updater.key`)
- Anything matched by the pre-tool secrets hook

The `.gitignore` already excludes these, but double-check `git status` before staging.
