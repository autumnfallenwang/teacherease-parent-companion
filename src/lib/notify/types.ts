// Notify pipeline contract (Q20 / P6). Pure types module — no Tauri, no IPC.
//
// Each delivery channel (OS today, email in Phase 11) implements `NotifyChannel`
// and gets fanned out by `NotifyRouter`. `NotifyEvent` is a closed discriminated
// union — channels exhaustively match in their `send()` switch so a new event
// branch won't compile without every channel handling it.

export type NotifyEvent =
  | {
      readonly type: "gradesAttention";
      readonly childName: string;
      readonly attentionCount: number;
      readonly missingCount: number;
    }
  | {
      readonly type: "newHomework";
      readonly childName: string;
      readonly isoDate: string;
      readonly subjectCount: number;
    }
  | {
      readonly type: "fetchFailed";
      readonly childName: string;
      readonly source: string;
      readonly error: string;
    };

export interface NotifyChannel {
  /** Stored in log lines; convention: lowercase — `"os"` | (future) `"email"`. */
  readonly name: string;
  /** Channel-level gate: OS permission, SMTP configured, per-event user toggle (P7). */
  isEnabled(event: NotifyEvent): Promise<boolean>;
  /** Deliver the event. Throws on failure — router catches and logs. */
  send(event: NotifyEvent): Promise<void>;
}

export interface NotifyRouterDeps {
  log: (message: string) => Promise<void>;
  logWarning: (message: string) => Promise<void>;
}
