#!/bin/bash
# UserPromptSubmit hook: when the user invokes /dev-task, inject an instruction
# telling the assistant to enter plan mode before anything else. Word-boundary
# matched so /dev-tasks or /dev-task-foo won't trigger.

jq -c '(.prompt // "") as $p
  | if ($p | test("^/dev-task(\\s|$)")) then
      {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "AUTOMATED PROJECT HOOK: /dev-task was invoked. Call the EnterPlanMode tool as your first action this turn (load it via ToolSearch if it appears in the deferred tools list). After entering plan mode, proceed with the dev-task workflow as normal."
        }
      }
    else empty
    end'
