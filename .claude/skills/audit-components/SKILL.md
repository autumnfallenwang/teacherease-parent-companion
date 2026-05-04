---
name: audit-components
description: Audit TeacherEase Parent Companion's hand-rolled UI components and recommend off-the-shelf swaps. Use whenever the user says /audit, "audit components", "build or buy", "should we replace X", "what should we replace", "is component X worth keeping", or describes mounting frustration with a component (repeated bugs, stuck on edge cases, "this thing keeps breaking", "we keep adding things to fix it"). Also fire proactively at the end of a phase or after closing a walkthrough finding that touched the same component twice — that's the cheapest moment to catch swap opportunities while context is fresh. Produces a prioritized swap recommendation table written to docs/audits/, with effort estimates and reasoning anchored in five signals.
---

# Audit Components — should we keep building or buy?

## Why this skill exists

TeacherEase Parent Companion is a vibe-coded app: we build pieces, ship them, learn what's actually painful, and iterate. That cycle is healthy, but it has a known failure mode — components that started as "small enough to hand-roll" silently calcify into ceilings. The `settings-children.tsx` and `settings-email-section.tsx` files are creeping toward that threshold (~490 + ~480 lines each, with credential-storage + form-validation + SMTP-test logic all interleaved). Catching them now is cheaper than after the next round of validation rules pile on.

This skill is the recurring discipline that catches those calcifications before they compound. It does *not* say "always buy" — most of our domain code (scraper, schedulers, attention engine, IPC bridge, Q-decision-anchored UX) is correctly hand-rolled and shouldn't change. The skill is a structured pass over what we've built, against the **five signals**, with a curated map of off-the-shelf alternatives.

Run it at the end of phases, after walkthrough findings that hit the same component twice, or whenever a component starts feeling unreliable.

## The five signals

A component is a candidate for swapping when **two or more** of these fire. One alone is usually a transient bug; two means the foundation is the problem.

1. **Bug-ratio inversion.** More time fixing bugs in the component than building features around it. Check git log: how many `fix:` commits touched this file vs `feat:`? Skewed toward fix → signal.
2. **Edge-case avalanche.** Each fix uncovers a new "oh, we also need…" Class-of-problem, not isolated incident. Off-the-shelf libraries usually have a name for the class and have already solved it.
3. **Foundation-becomes-ceiling.** A natural feature request ("add per-child SMTP overrides", "validate recipient list against a regex", "show parsed homework as a tree") would be a multi-week project because of how the component is built. The shape of the component is dictating what features we can ship.
4. **Knowledge isolation.** Only one person (you) understands why the component is structured this way. No docs, no GitHub issues, no Stack Overflow surface. Future-you in six months would re-derive the design from scratch.
5. **Defensive justification.** When you describe the build choice, you find yourself apologizing ("well, I had to build it because…"). Healthy build decisions sound matter-of-fact, not justified.

Default to **keep** unless 2+ signals fire. Be honest, not enthusiastic — premature swaps are as costly as overdue ones.

## What's in scope

**Audit:**
- `src/components/` — every `.tsx` file (including nested `settings/`, `shell/`, `wizard/`, `theme/`, `ui/`)
- `src/lib/core/` — pure-core helpers and types (attention engine, activity diff, sort, trend, theme, homework-date, update-banner)

**Don't audit (these are domain code by definition):**
- `src/lib/ipc.ts` — Tauri bridge, no library replaces it
- `src/lib/scraper/` — TeacherEase-specific HTML parsing, no library replaces it
- `src/lib/fetch/` and `src/lib/schedule/` — orchestrators wired to Q-decisions
- `src/lib/notify/` — channel abstraction is product-specific
- `src/app/page.tsx` and `src/app/layout.tsx` — composition shell
- `src-tauri/` — Rust backend
- The scraper, scheduler, attention engine, notify pipeline
- Anything anchored to a Q-decision in `docs/design-plan.md` whose contract is product-specific

If a component is anchored to a Q-decision and the Q-decision specifies *behavior* (e.g. Q34 credentials in DB, Q14 logging conventions), that's domain — don't recommend swapping the contract. You can still recommend swapping the *implementation* (e.g. "the SMTP form's validation is `react-hook-form + zod` once we adopt it; the Q4 SMTP-config contract is unchanged").

## How to run the audit

Read `references/alternatives.md` for the curated swap targets first. Then walk the in-scope files in this order:

1. **List in-scope components.** `ls src/components/**/*.tsx` and `ls src/lib/core/*.ts` (excluding tests).
2. **For each, gather signal evidence.** This is the substantive part — don't skip it.
   - Read the file. How many lines? Is the structure obvious or layered?
   - Run `git log --oneline --follow <file>` and count `fix:` vs `feat:` commits.
   - Check `docs/backlog.md` for entries that touched this file.
   - Check `docs/lessons.md` for warnings about this component.
   - Read inline comments — `// biome-ignore`, `// HACK`, `// workaround`, "Q34 — credentials live in DB, not keychain; the legacy keychain plumbing…" — these are signals. Heavy comments explaining defensive geometry usually mean signal #5 is firing.
3. **Score against the five signals.** For each signal, answer with evidence: yes/no/maybe + one-sentence reason. Don't bluff. If you can't tell, write "needs human input."
4. **Cross-reference alternatives.** For components with 2+ signals, look up `references/alternatives.md` for matching off-the-shelf options. Note: bundle size, maintenance status (last commit, weekly downloads), license, any known integration issues with Tauri 2 / Next.js 15 / React 19.
5. **Estimate effort.** Be honest about cost. A swap involves: install deps + integrate behind the same component boundary + port domain extensions (Q-decision-specific behavior, validation rules, etc.) + delete custom code + update tests. Estimate in phase-units (single phase = ~3 days for one maintainer in this codebase).
6. **Write the audit report.**

## Report structure

ALWAYS save to `docs/audits/audit-YYYY-MM-DD.md`. Use this exact template:

```markdown
# Component audit — YYYY-MM-DD

## Scope
- Audited: src/components/ (N .tsx files), src/lib/core/ (N .ts files)
- Excluded (domain): <one-line list>

## Summary
- Components reviewed: N
- Recommended for swap: M (signals firing: ≥2)
- Recommended to keep: K
- Insufficient evidence / needs human input: J

## Recommendations (priority order)

### 1. <component-path> → <off-the-shelf option>
**Signals firing (M/5):** signal-1, signal-2, signal-3
- **Bug-ratio inversion:** evidence
- **Edge-case avalanche:** evidence
- **Foundation-becomes-ceiling:** evidence
- **Knowledge isolation:** evidence (if firing)
- **Defensive justification:** evidence (if firing)

**Proposed swap:** <library name + version>
**Bundle cost:** ~XX KB gzipped
**Effort estimate:** ~N days (one phase)
**Domain extensions to port:** <list>
**Q-decisions affected:** <list of Q-numbers, or "none">
**Why now:** <one-sentence trigger>

(repeat per recommendation)

## Keep (no action)
| Component | Signals firing | Notes |
|---|---|---|
| src/components/foo.tsx | 0/5 | trivial, working |
| src/components/bar.tsx | 1/5 | one fix-commit but isolated |

## Insufficient evidence
- <component>: <what's missing — usually means the component is too new to have signal data yet>

## Drift since last audit
(only present if a previous docs/audits/ file exists)
- <component>: was N/5, now M/5 — reason
```

## What a good output looks like

The report is for you, six months from now. Optimize for:

- **Skim-readable.** A reader who knows the codebase should be able to read the Summary + Recommendations headers in 30 seconds and decide whether to act.
- **Evidence-backed.** Every signal claim has a concrete reference (commit count, line numbers, comment quote, backlog entry). No "this feels off" without a citation.
- **Honest about effort.** Don't underestimate to make a swap look attractive. Migrating a 480-line settings form to react-hook-form + zod is real work; calling it "trivial" is a disservice.
- **Comfortable saying "keep."** Most components should be kept. A short audit ("reviewed 23, swap 1, keep 22") is a good audit. A long one with five "swap now" recommendations is a yellow flag — either you've been ignoring this skill for too long, or it's overreaching.

## When the user fires this skill

Default behavior: write the audit, save it, summarize the top recommendations to the user inline, link the file. Don't act on recommendations automatically — the user decides what to fire as `/dev-task`. The audit is a *report*, not a *plan*.

If the user says "audit just settings" or "audit just the wizard", scope down to that subtree only — same five-signal framework, same report shape, smaller header.

If a previous audit exists in `docs/audits/`, read the most recent one first and include a "Drift since last audit" section. Components that flipped from keep → swap (or vice versa) are the most interesting deltas.

## When NOT to fire this skill

- The user is asking for a creative/design direction → that's `frontend-design`.
- The user is asking what library to use for a *new* feature → that's plain conversation, not an audit. The skill audits what already exists.
- The user is mid-implementation of a feature → finish it first. Audits at the start of work are noise; audits after are signal.
- The user is asking about backend code (Rust) — no scope here. Rust crates have a different ecosystem and the five signals translate but the curated alternatives list is JS/TS-specific.

## Output size discipline

Keep the audit under 200 lines. If you're trending longer:
- Most "keep" entries collapse into the table — one line each, no per-signal breakdown.
- Only "swap" recommendations get the full signal breakdown.
- Move detailed reasoning into the file's body; don't repeat it in summary.
