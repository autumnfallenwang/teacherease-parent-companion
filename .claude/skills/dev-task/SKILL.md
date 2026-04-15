---
name: dev-task
description: Plan and implement the next development task. Use when the user wants to build a feature, work on a task, implement something from the design plan, or says things like "let's work on task 7", "build the scraper login", "what's next", or "pick up the next task".
---

Pick up the next task from the development plan and implement it. The goal is to produce working, tested code — but the plan matters more than the code. A bad plan wastes tokens and time; a good plan makes implementation mechanical.

## Phase 1: Understand current state

1. Read `docs/progress.md` to see what's done, what's partial, what's next.
2. Read `docs/design-plan.md` for design decisions and architectural context.
3. Read `docs/decisions.md` for the "why" behind locked decisions. **Never contradict a locked decision without explicitly raising it with the user first.**
4. Read `docs/lessons.md` for past corrections — avoid repeating known mistakes.
5. Identify the next task to work on — follow the phase order; earlier phases must be done before later ones.
6. If $ARGUMENTS is provided, treat it as the specific task to work on (e.g. "task 9" or "grade overview parser") instead of auto-detecting.

## Phase 2: Explore and plan (the most important phase)

This phase is cheap in tokens and prevents expensive rework. Take your time here.

7. Read all source files relevant to the next task:
   - Files the task will create or modify
   - Files the task depends on (imports, types, existing patterns)
   - Existing test files to understand testing conventions
8. Determine which platform(s) this task targets:
   - **TypeScript frontend** (`src/`): Next.js App Router, React, Tailwind + shadcn/ui patterns.
   - **TypeScript scraper** (`scraper/` or `src-tauri/sidecar/`): pure Node, `fetch` + `cheerio`, no DOM APIs.
   - **Rust Tauri core** (`src-tauri/src/`): `#[tauri::command]` handlers, plugin wiring, state management.
   - Cross-cutting tasks may touch all three.
9. For scraper work: **always work from saved HTML fixtures in `tests/fixtures/`**, never hit the live portal during development. If no fixture exists, mine one from `ref/teacherease_parents_helper/logs/` or ask the user to capture a fresh sample.
10. Consult library docs via type definitions in `node_modules/` (for TS) or `cargo doc` (for Rust) as needed — Tauri plugins, cheerio, better-sqlite3, etc.

### Plan Round 1 — Draft

11. Enter plan mode and write a detailed implementation plan:
    - Files to create/modify (with exact paths)
    - Types and interfaces to define
    - Functions to implement (with signatures and key logic)
    - Tests to write (with test names and what they verify)
    - Changes to existing files (imports, wiring, IPC command registration)
    - Any risks or open questions

12. Present the plan to the user and **wait for feedback**. Explicitly ask: "Does this plan look right? Any changes before I proceed?"

### Plan Round 2 — Revise

13. Incorporate the user's feedback into the plan. If they had corrections, update the plan and present the revised version.
14. If the user approves (or says something like "go", "looks good", "do it"), proceed to Phase 3.
15. If the user has more feedback, revise again until they approve.

The point of two rounds: catching wrong assumptions before any code is written saves far more time than fixing bad code later.

## Phase 3: Implement

16. Exit plan mode and create/modify files according to the approved plan.
17. Run `/lint fix` to auto-fix formatting.

## Phase 4: Verify with recovery

18. Run `/check all`. For Rust-only tasks, run `/check rust`. For cross-platform tasks, run both.

If checks fail, follow this recovery strategy:

- **Lint failure** → run `/lint fix` and retry `/check all`
- **Type error** → read the error, fix the code, retry `/check all`
- **Test failure** → analyze the failure, fix the code or test, retry `/check all`

Retry up to **3 times total**. If still failing after 3 attempts:
- Stop and summarize what's failing and why
- Show the error output
- Ask the user how to proceed (fix manually, change approach, or skip)

Do not silently loop. Each retry should fix a different issue, not retry the same broken thing.

## Phase 5: Update progress

19. Run `/update-progress` to update docs with new task status.

## Phase 6: Record lessons (if applicable)

20. If the user corrected any assumptions during planning or implementation, add an entry to `docs/lessons.md` so the same mistake isn't repeated in future tasks.
