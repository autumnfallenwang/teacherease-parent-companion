#!/bin/bash
# PreToolUse(Edit|Write) hook: block direct edits to .env files.
# Secrets belong in the OS keychain, not checked-in .env files. Use .env.example.

FILE=$(jq -r '.tool_input.file_path // empty')

case "$FILE" in
  *.env|*.env.*)
    echo 'BLOCKED: Do not edit .env files — they may contain secrets. Use .env.example instead.' >&2
    exit 2
    ;;
esac

exit 0
