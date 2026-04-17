# Notify pipeline proposal (2026-04-17)

Route domain events through a common `NotifyRouter` so each channel (OS notification today, email next, future channels) is a pluggable module with its own enable-check and formatting. Companion to `fetch-pipeline-proposal.md`.

Status: **proposal, not yet scheduled.**

## Why now

Two call sites exist today — `notifyNeedsAttention()` and `notifyNewHomework()` in `src/lib/ipc.ts`. Both follow the same pattern: permission check → build title/body → `sendNotification()`. Phase 9 (email, Q4) will add a second delivery channel. Two forces push toward a dispatcher:

1. **Without a router**, every notification-worthy event becomes N call sites (one per channel) — `notifyNeedsAttention_os`, `notifyNeedsAttention_email`, etc.
2. **User preferences** (Q4 decided email is opt-in per channel) need a place to be consulted. Right now there's nowhere to hang "email me about missing assignments, don't OS-popup." The `settings` table exists and is empty — this gives it a first real job.

Early stage is the right time — before email lands and locks the shape.

## Relationship to the fetch pipeline

The two form a clean layered design:

```
FetchSource.run()           (fetch-pipeline-proposal.md)
  ↓ writes domain rows to DB
  ↓ emits NotifyEvent via ctx.notify.dispatch(event)
NotifyRouter                 (this doc)
  ↓ for each enabled channel:
Channel                      (OS today, email next, ...)
  ↓ sends
```

Where the fetch pipeline is **many sources → one DB**, the notify pipeline is **one event → many channels** — the dual shape. Today's notifications live in `handleRefresh`; they'd move into the source modules once both refactors land.

## What this proposal is NOT

- **Not a message queue.** Events fire synchronously during `run()`. No retries, no persistence, no at-least-once delivery. If a channel fails, we log and move on.
- **Not a subscription system.** Channels are a hardcoded set in code. No dynamic (de)registration.
- **Not a template engine.** Each channel formats in its own module — TS string concatenation, no Handlebars/MJML yet. Email's HTML template from the ref repo will land when Phase 9 actually needs it.
- **Not a cross-process bus.** All in-process in the frontend webview, dispatching to Tauri plugins.

## Proposed design

### Module layout

```
src/lib/notify/
  types.ts          # NotifyEvent union, NotifyChannel interface
  router.ts         # NotifyRouter.dispatch(event)
  os-channel.ts     # wraps current notification-plugin sendNotification
  email-channel.ts  # Phase 9 — BYO SMTP
```

### Events (sketch)

```ts
export type NotifyEvent =
  | {
      type: "gradesAttention";
      childName: string;
      attentionCount: number;
      missingCount: number;
    }
  | {
      type: "newHomework";
      childName: string;
      isoDate: string;        // YYYY-MM-DD
      subjectCount: number;
    }
  | {
      type: "fetchFailed";    // new — wasn't surfaced before
      childName: string;
      source: string;         // "teacherease" | "homework" | ...
      error: string;
    };
```

Adding a new event type = adding a union branch + (optionally) handling it in each channel. The TS compiler flags any channel that hasn't updated its `send()` switch, so channels can't silently drop new event types.

### Channel contract (sketch)

```ts
export interface NotifyChannel {
  readonly name: "os" | "email";
  /** Channel-level gate: OS permission, SMTP configured, per-event-type user toggle. */
  isEnabled(event: NotifyEvent): Promise<boolean>;
  /** Throws on delivery failure. Router catches and logs. */
  send(event: NotifyEvent): Promise<void>;
}
```

### Router (sketch)

```ts
export class NotifyRouter {
  constructor(private readonly channels: readonly NotifyChannel[]) {}

  async dispatch(event: NotifyEvent): Promise<void> {
    for (const ch of this.channels) {
      if (!(await ch.isEnabled(event))) continue;
      try {
        await ch.send(event);
        await log(`notify: ${ch.name} ${event.type} sent`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        await logWarning(`notify: ${ch.name} ${event.type} failed — ${msg}`);
      }
    }
  }
}
```

Sequential dispatch (not parallel) — simpler logs, and there are only ever a handful of channels.

### User preferences in `settings`

First real use of the `settings` key/value table:

| Key | Value | Default |
|---|---|---|
| `notify.gradesAttention.os` | `"1"` / `"0"` | `"1"` |
| `notify.gradesAttention.email` | `"1"` / `"0"` | `"0"` (email off until configured) |
| `notify.newHomework.os` | `"1"` / `"0"` | `"1"` |
| `notify.newHomework.email` | `"1"` / `"0"` | `"0"` |
| `notify.fetchFailed.os` | `"1"` / `"0"` | `"0"` (noisy; opt-in) |

Naming: `notify.{eventType}.{channelName}`. Channels query this via a small `getSettingBool(key, default)` helper.

Each channel's `isEnabled(event)` becomes:

```ts
async isEnabled(event) {
  if (!(await this.channelAvailable())) return false;  // OS permission / SMTP configured
  return getSettingBool(`notify.${event.type}.${this.name}`, this.defaultEnabledFor(event.type));
}
```

## Channel-specific behavior

### OS channel

- Wraps the existing `ensureNotificationPermission()` + `sendNotification()` flow.
- Formats one title + one body per event — same as today's `notifyNeedsAttention` / `notifyNewHomework`.
- `channelAvailable()` = permission granted.

### Email channel (Phase 9)

- Reads SMTP host/port/user/from/to from `settings`; password from OS keychain (`smtp-main`).
- Builds HTML via a per-event template in `email-channel.ts` (simple template literals, no engine).
- `channelAvailable()` = all SMTP settings present + keychain has `smtp-main`.
- Outside scope of this proposal: the SMTP client, template HTML, tutorial for Gmail App Password (those are Phase 9 Q4 scope).

## Step-by-step refactor

1. **`NotifyEvent` union + `NotifyChannel` interface** — `src/lib/notify/types.ts`.
2. **`OSChannel`** — `src/lib/notify/os-channel.ts`. Port `notifyNeedsAttention` + `notifyNewHomework` formatting into one `send(event)` switch.
3. **`NotifyRouter`** — `src/lib/notify/router.ts`.
4. **Settings helper** — `getSettingBool(key, default)` in `ipc.ts`, populates defaults on first read.
5. **Wire the router into the fetch runner** — `FetchContext.notify: NotifyRouter`. Each source calls `ctx.notify.dispatch(...)`.
6. **Replace call sites** — `notifyNeedsAttention(...)` becomes `ctx.notify.dispatch({ type: "gradesAttention", ... })`. `notifyNewHomework(...)` similarly.
7. **Delete the old `notifyNeedsAttention` / `notifyNewHomework`** from `ipc.ts` once all call sites are migrated.
8. **Add a new `fetchFailed` emission** — the runner already has the error; emit a `NotifyEvent` from the catch block in the fetch runner.
9. **Settings UI** — later. For v1, defaults are fine; advanced users can toggle via direct `settings` table edits. A proper UI lands alongside Phase 9 email setup.

Estimated scope: ~1 day before email, ~2 days if bundled with Phase 9 email work.

## Open questions

1. **Emit order.** Should the router dispatch events in the order channels were constructed, or give email a different ordering than OS? *Lean:* constructor order is fine — it's deterministic and explicit.
2. **Aggregation window.** Today `notifyNewHomework` only fires when `maxDate` advances — effectively its own dedup. Do we keep that as a source-level decision, or push it into the router? *Lean:* keep it in the source. The router is a dumb dispatcher; "did something actually change?" is domain logic.
3. **Failure reporting.** If the OS channel fails, does the user see anything in the UI? *Lean:* no — log warning only, same as today. Notifications are best-effort.
4. **Per-child muting.** Should a parent be able to mute notifications for one child (e.g. a college-age kid who doesn't need parental monitoring) while keeping them for the younger one? *Lean:* not in v1; the `notify.*` keys are app-wide. Add `notify.child.{id}.mute = "1"` later if asked.
5. **Test strategy.** The router is a perfect unit-test target (mock channels). Each channel's formatting is also testable independently. Out of scope for today's thin test-pattern, but easy to retrofit.

## Decision to make

- **Ship this bundled with the fetch pipeline refactor?** Pros: one clean architectural pass, both land together, email comes in clean. Cons: one bigger diff.
- **Ship before Phase 9 email?** Pros: email integration gets a ready-made home. Cons: extra work before the feature that justifies it exists.
- **Defer until Phase 9 actually starts?** Pros: no speculative abstraction. Cons: guaranteed "refactor while adding email" pain — the two changes conflict on every call site.

**Lean:** ship **together with the fetch pipeline refactor** (or immediately after). The two proposals together reshape `handleRefresh` into a clean `runner.runAll(child)` call with observability + notification dispatch both flowing through uniform pipelines. Doing them in one refactor window means touching each call site once.
