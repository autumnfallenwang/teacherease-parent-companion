#!/bin/bash
# PostToolUse(Edit|Write) hook: auto-format TS/JS/JSON with biome, Rust with
# rustfmt. Never blocks (PostToolUse runs after the tool already succeeded) —
# format failures are silenced so a missing binary can't break unrelated work.

FILE=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
[ -z "$FILE" ] && exit 0

case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.json)
    pnpm biome check --write "$FILE" 2>/dev/null
    ;;
  *.rs)
    rustfmt "$FILE" 2>/dev/null
    ;;
esac

exit 0
