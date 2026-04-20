// Generic recurring loop driver. Pure module — no Tauri, no IPC, no React.
// Used by the shell-level schedulers to run two independent cadences
// (fetch + notify) with different next-run policies. See Q29 / Phase 19.

export interface ScheduleLoopConfig {
  /** Pure function: given `now`, return the next wall-clock time to fire. */
  readonly nextRunAt: (now: Date) => Date;
  /** Called on each tick. Errors caught + routed to `onError` — loop survives. */
  readonly tick: () => Promise<void>;
  /** Error sink. Must not throw. */
  readonly onError: (err: unknown) => void;
}

export class ScheduleLoop {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly cfg: ScheduleLoopConfig) {}

  start(): void {
    this.stopped = false;
    this.schedule(new Date());
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(from: Date): void {
    if (this.stopped) return;
    const next = this.cfg.nextRunAt(from);
    const delay = Math.max(0, next.getTime() - from.getTime());
    this.timer = setTimeout(() => {
      void this.runTickAndReschedule();
    }, delay);
  }

  private async runTickAndReschedule(): Promise<void> {
    if (this.stopped) return;
    try {
      await this.cfg.tick();
    } catch (err) {
      this.cfg.onError(err);
    }
    this.schedule(new Date());
  }
}
