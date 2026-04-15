#!/bin/bash
# Pre-commit/push hook: scan staged files for secrets

# Only run on git commit or git push
echo "$CLAUDE_BASH_COMMAND" | grep -qE '^git (commit|push)' || exit 0

# Check for sensitive keywords in staged diffs
SECRETS=$(git diff --cached --diff-filter=ACM -S 'password' -S 'secret' -S 'api_key' -S 'apikey' -S 'token' -S 'private_key' --name-only 2>/dev/null)

# Check for known secret patterns (API keys, private keys, etc.)
PATTERNS=$(git diff --cached --diff-filter=ACM -G '(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----|AKIA[0-9A-Z]{16})' --name-only 2>/dev/null)

# Check for .env files being committed
ENVFILES=$(git diff --cached --name-only 2>/dev/null | grep -E '\.env$|\.env\.' | grep -v '\.example$')

# Check for sandbox/ paths being staged (they should never be committed — see CLAUDE.md)
SANDBOX=$(git diff --cached --name-only 2>/dev/null | grep -E '^sandbox/')

# Check for real TeacherEase hostnames (e.g. myschool.teacherease.com).
# Allow the dummy example domain used in tests/docs.
TEACHEREASE_URLS=$(git diff --cached --diff-filter=ACM -G '[a-zA-Z0-9-]+\.teacherease\.(com|net|org)' --name-only 2>/dev/null | while read -r f; do
  # If the only match in this file is an example/dummy, skip it.
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
