#!/bin/bash
# PreToolUse(Bash) hook: before `git commit` or `git push`, scan staged files
# for secrets, sandbox paths, and real portal URLs. Blocks via exit 2 if found.

# Bash tool input arrives as JSON on stdin; extract the command string.
CMD=$(jq -r '.tool_input.command // empty')

# Only gate git commit / push — every other bash invocation passes through.
echo "$CMD" | grep -qE '^git (commit|push)' || exit 0

# Sensitive keywords in staged diffs.
SECRETS=$(git diff --cached --diff-filter=ACM -S 'password' -S 'secret' -S 'api_key' -S 'apikey' -S 'token' -S 'private_key' --name-only 2>/dev/null)

# Known secret patterns (API keys, private keys, etc.).
PATTERNS=$(git diff --cached --diff-filter=ACM -G '(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----|AKIA[0-9A-Z]{16})' --name-only 2>/dev/null)

# .env files being committed (allow .env.example).
ENVFILES=$(git diff --cached --name-only 2>/dev/null | grep -E '\.env$|\.env\.' | grep -v '\.example$')

# sandbox/ paths staged (should never be committed per CLAUDE.md).
SANDBOX=$(git diff --cached --name-only 2>/dev/null | grep -E '^sandbox/')

# Real TeacherEase hostnames. Allow the dummy `example.teacherease.*` /
# `school.example` domains used in tests and docs.
TEACHEREASE_URLS=$(git diff --cached --diff-filter=ACM -G '[a-zA-Z0-9-]+\.teacherease\.(com|net|org)' --name-only 2>/dev/null | while read -r f; do
  if git diff --cached -- "$f" | grep -E '\+.*[a-zA-Z0-9-]+\.teacherease\.(com|net|org)' | grep -qv 'example\.teacherease\|school\.example'; then
    echo "$f"
  fi
done)

FOUND="${SECRETS}${PATTERNS}${ENVFILES}${SANDBOX}${TEACHEREASE_URLS}"

if [ -n "$FOUND" ]; then
  echo "BLOCKED: Potential secrets, sandbox files, or real portal URLs detected in staged files:" >&2
  echo "$FOUND" | sort -u >&2
  echo "Review these files before committing. See CLAUDE.md 'Security constraints'." >&2
  exit 2
fi

exit 0
