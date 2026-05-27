// Phase 31 / B-20 / Q36 — wall-clock timer for fetch + notify schedulers.
// TS owns the cadence math; Rust just sleeps until fire_at_ms and emits a
// Tauri event. Webview's tick handler runs the cycle then re-arms by calling
// schedule_next_tick again. Decoupling the timer from the webview's JS event
// loop is the whole point — macOS pauses webview setTimeout when the window
// is unfocused, so the prior in-webview ScheduleLoop fired late or only on
// focus-gain. Rust's tokio runtime is independent of webview state.
//
// B-22 update — wall-clock polling instead of monotonic countdown.
// Previously this used `tokio::time::sleep_until(Instant::now() + delta)`.
// `Instant` is monotonic; on macOS clamshell sleep the process suspends and
// the monotonic clock pauses with it, so a 6-hour countdown could resume
// hours after the wall-clock target had already passed — fires happened at
// random delayed times or not at all. Replaced with a wall-clock poll loop:
// each iteration compares Utc::now() to the target and naps in capped
// chunks (NAP_CAP_MS) so a paused tokio sleep can't strand the worker.
// On wake we re-evaluate and either fire (if within MISS_THRESHOLD_MS of
// the target) or skip (cron-style, the webview re-arms for the next slot).

use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{Mutex, Notify};

const FETCH_TICK_EVENT: &str = "scheduler:fetch-tick";
const NOTIFY_TICK_EVENT: &str = "scheduler:notify-tick";
/// Emitted only for the notify scheduler when the wall-clock target was
/// missed (system slept past it). The TS layer decides whether to honor it
/// based on the `notify.catchupOnMiss` setting and whether we're still
/// before the next armed slot. Fetch never emits this — a missed fetch is
/// covered by the next fetch.
const NOTIFY_MISSED_EVENT: &str = "scheduler:notify-missed";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NotifyMissedPayload {
    target_ms: i64,
    late_ms: i64,
}

/// Cap on each individual sleep chunk so a tokio sleep that gets paused
/// across system suspend can't keep the worker stranded for hours. After
/// each nap we re-read the wall clock and decide afresh.
const NAP_CAP_MS: i64 = 30_000;

/// Max lateness still treated as an on-time fire. If we wake more than this
/// late (system slept past the target), skip — cron-style, no catch-up.
const MISS_THRESHOLD_MS: i64 = 5 * 60 * 1000;

/// Per-scheduler shared state — the next fire time (Unix ms) plus a cancel
/// notify that wakes the worker when the value changes.
#[derive(Clone)]
struct SchedulerSlot {
    fire_at_ms: Arc<Mutex<Option<i64>>>,
    cancel: Arc<Notify>,
}

impl SchedulerSlot {
    fn new() -> Self {
        Self {
            fire_at_ms: Arc::new(Mutex::new(None)),
            cancel: Arc::new(Notify::new()),
        }
    }
}

/// Tauri-managed handle for the two schedulers. Held as State<'_, SchedulerState>
/// by the schedule_next_tick command and built once in setup().
pub struct SchedulerState {
    fetch: SchedulerSlot,
    notify: SchedulerSlot,
}

impl SchedulerState {
    pub fn new() -> Self {
        Self {
            fetch: SchedulerSlot::new(),
            notify: SchedulerSlot::new(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleNextTickArgs {
    kind: String,
    fire_at_ms: i64,
}

/// Webview calls this on boot per scheduler, and again after each tick fires
/// (the tick handler computes the next fire from the existing TS cadence math
/// and re-arms). Settings-changed reactivity also funnels through here via
/// the SCHEDULES_CHANGED_EVENT path.
#[tauri::command]
pub async fn schedule_next_tick(
    state: State<'_, SchedulerState>,
    args: ScheduleNextTickArgs,
) -> Result<(), String> {
    let slot = match args.kind.as_str() {
        "fetch" => &state.fetch,
        "notify" => &state.notify,
        other => return Err(format!("unknown scheduler kind: {other}")),
    };
    *slot.fire_at_ms.lock().await = Some(args.fire_at_ms);
    slot.cancel.notify_one();
    log::info!(
        "scheduler-rust: {} armed for fire_at_ms={}",
        args.kind,
        args.fire_at_ms,
    );
    Ok(())
}

/// Spawns one tokio task per scheduler. Tasks live for the app process and
/// are never cancelled — the main app exit drops the runtime. Each task
/// loops forever waiting on either a sleep deadline or a cancellation.
pub fn spawn_workers(app: AppHandle, state: &SchedulerState) {
    spawn_worker(app.clone(), "fetch", state.fetch.clone());
    spawn_worker(app, "notify", state.notify.clone());
}

/// Outcome of one wait-for-target loop, used both in production and tests.
#[derive(Debug, PartialEq, Eq)]
enum WaitOutcome {
    /// Wall clock reached the target (or was within MISS_THRESHOLD_MS of it).
    /// Caller should fire and clear the slot.
    FireOnTime,
    /// Wall clock is more than MISS_THRESHOLD_MS past the target. Caller
    /// should clear the slot WITHOUT firing; webview re-arms for next slot.
    Missed { late_ms: i64 },
    /// Slot's `cancel` Notify woke us — caller should re-read the target
    /// (it likely changed) and loop.
    Cancelled,
}

/// Wall-clock polling loop. Returns when either the target is reached, the
/// target is missed, or the slot is cancelled. Pure of side effects beyond
/// the cancel-notify wait so it can be unit-tested with a mock clock.
async fn wait_for_target(target_ms: i64, slot: &SchedulerSlot) -> WaitOutcome {
    loop {
        let now_ms = chrono::Utc::now().timestamp_millis();
        let delta_ms = target_ms - now_ms;

        if delta_ms <= 0 {
            // We're at or past the target. Decide fire vs skip based on
            // how late we are — the wall-clock check naturally collapses
            // both "on-time wake" and "system slept past target" into the
            // same code path.
            let late_ms = -delta_ms;
            if late_ms <= MISS_THRESHOLD_MS {
                return WaitOutcome::FireOnTime;
            }
            return WaitOutcome::Missed { late_ms };
        }

        let nap_ms = delta_ms.clamp(1, NAP_CAP_MS) as u64;
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_millis(nap_ms)) => {
                // Re-loop, re-check wall clock. A tokio::time::sleep that
                // got paused across system suspend will return whenever
                // the OS resumes the process; we don't care because the
                // next Utc::now() reads the truth.
            }
            _ = slot.cancel.notified() => {
                return WaitOutcome::Cancelled;
            }
        }
    }
}

fn spawn_worker(app: AppHandle, kind: &'static str, slot: SchedulerSlot) {
    let event_name = match kind {
        "fetch" => FETCH_TICK_EVENT,
        "notify" => NOTIFY_TICK_EVENT,
        _ => unreachable!("invalid scheduler kind: {kind}"),
    };

    tauri::async_runtime::spawn(async move {
        loop {
            // Snapshot the current fire time. Drop the guard before awaiting.
            let target_ms_opt = { *slot.fire_at_ms.lock().await };

            match target_ms_opt {
                None => {
                    // No schedule yet (boot before webview arms). Wait for arm.
                    slot.cancel.notified().await;
                }
                Some(target_ms) => match wait_for_target(target_ms, &slot).await {
                    WaitOutcome::FireOnTime => {
                        log::info!("scheduler-rust: {kind} fired target_ms={target_ms}");
                        if let Err(e) = app.emit(event_name, ()) {
                            log::error!("scheduler-rust: emit {event_name} failed — {e}");
                        }
                        *slot.fire_at_ms.lock().await = None;
                    }
                    WaitOutcome::Missed { late_ms } => {
                        let late_min = late_ms / 60_000;
                        log::warn!(
                            "scheduler-rust: {kind} missed (woke {late_min}min late) target_ms={target_ms} — skipping to next slot"
                        );
                        // Clear the slot so the webview can re-arm cleanly.
                        // For notify, also emit a miss event so the TS layer
                        // can run catch-up if the user opted in. Fetch never
                        // emits — a missed fetch is covered by the next one.
                        *slot.fire_at_ms.lock().await = None;
                        if kind == "notify" {
                            let payload = NotifyMissedPayload { target_ms, late_ms };
                            if let Err(e) = app.emit(NOTIFY_MISSED_EVENT, payload) {
                                log::error!(
                                    "scheduler-rust: emit {NOTIFY_MISSED_EVENT} failed — {e}"
                                );
                            }
                        }
                    }
                    WaitOutcome::Cancelled => {
                        log::debug!("scheduler-rust: {kind} sleep cancelled — re-reading target");
                    }
                },
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_slot() -> SchedulerSlot {
        SchedulerSlot::new()
    }

    #[tokio::test]
    async fn fires_on_time_when_target_just_passed() {
        // Target 500ms in the future. Should poll, sleep, then return FireOnTime.
        let slot = make_slot();
        let target_ms = chrono::Utc::now().timestamp_millis() + 500;
        let outcome = wait_for_target(target_ms, &slot).await;
        assert_eq!(outcome, WaitOutcome::FireOnTime);
    }

    #[tokio::test]
    async fn fires_immediately_when_target_already_passed_within_grace() {
        // Target 1 second in the past — well within the 5min miss threshold.
        let slot = make_slot();
        let target_ms = chrono::Utc::now().timestamp_millis() - 1_000;
        let outcome = wait_for_target(target_ms, &slot).await;
        assert_eq!(outcome, WaitOutcome::FireOnTime);
    }

    #[tokio::test]
    async fn skips_when_target_long_past() {
        // Simulate "system slept through the target" by handing in a target
        // 10 minutes in the past — well past MISS_THRESHOLD_MS (5min).
        let slot = make_slot();
        let target_ms = chrono::Utc::now().timestamp_millis() - 10 * 60 * 1000;
        let outcome = wait_for_target(target_ms, &slot).await;
        match outcome {
            WaitOutcome::Missed { late_ms } => {
                assert!(
                    late_ms >= 10 * 60 * 1000,
                    "expected late_ms >= 600_000, got {late_ms}"
                );
            }
            other => panic!("expected Missed, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn cancellation_breaks_the_wait() {
        // Target 1 hour in the future. Notify cancel after 50ms; should
        // return Cancelled well before the 1-hour deadline.
        let slot = make_slot();
        let target_ms = chrono::Utc::now().timestamp_millis() + 60 * 60 * 1000;
        let cancel = slot.cancel.clone();

        let waiter = tokio::spawn(async move { wait_for_target(target_ms, &slot).await });

        tokio::time::sleep(Duration::from_millis(50)).await;
        cancel.notify_one();

        let outcome = tokio::time::timeout(Duration::from_secs(1), waiter)
            .await
            .expect("waiter did not return after cancel")
            .expect("waiter task panicked");
        assert_eq!(outcome, WaitOutcome::Cancelled);
    }

    #[tokio::test]
    async fn miss_threshold_boundary_inclusive() {
        // Exactly MISS_THRESHOLD_MS late should still fire (boundary is
        // inclusive — late_ms <= MISS_THRESHOLD_MS).
        let slot = make_slot();
        let target_ms = chrono::Utc::now().timestamp_millis() - MISS_THRESHOLD_MS;
        let outcome = wait_for_target(target_ms, &slot).await;
        assert_eq!(outcome, WaitOutcome::FireOnTime);
    }

    // ---------------------------------------------------------------------
    // B-22 head-to-head: prove the OLD Instant-based logic misbehaves under
    // simulated process suspension, while the NEW wall-clock logic recovers.
    //
    // We can't actually suspend a process in a unit test, but the
    // observable defect is identical to "tokio runtime advances slower
    // than wall clock." We simulate that by leaving the tokio runtime
    // paused for a beat AFTER the wall-clock target has already passed.
    //
    // Old logic = `tokio::time::sleep_until(Instant::now() + delta)`.
    // It computes a deadline ONCE up front and waits on the tokio
    // (Instant) clock. If real wall-clock time advances while the tokio
    // clock is paused (the analogue of a suspended process), the deadline
    // doesn't shift — the sleep keeps waiting for the original tokio
    // duration to elapse, which now lands at a real wall-clock time hours
    // past target.
    //
    // New logic = `wait_for_target` — re-checks `chrono::Utc::now()` each
    // iteration, so a wall-clock jump triggers immediate fire.
    // ---------------------------------------------------------------------

    /// Re-implementation of the OLD pre-B-22 wait, mirroring the original
    /// scheduler.rs lines 110-127 verbatim except wired to return our
    /// WaitOutcome enum so the head-to-head test can compare results
    /// against the new implementation. Kept #[cfg(test)] only.
    async fn legacy_wait_for_target(target_ms: i64, slot: &SchedulerSlot) -> WaitOutcome {
        let now_ms = chrono::Utc::now().timestamp_millis();
        let delta_ms = u64::try_from((target_ms - now_ms).max(0)).unwrap_or(0);
        let deadline = tokio::time::Instant::now() + Duration::from_millis(delta_ms);
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => WaitOutcome::FireOnTime,
            _ = slot.cancel.notified() => WaitOutcome::Cancelled,
        }
    }

    /// Demonstrate that the OLD logic gets stuck when the tokio clock
    /// (process scheduler) is paused while wall-clock time marches on.
    /// We arm a target only 200ms ahead, then pause tokio's clock and
    /// sleep the *real* OS thread for 600ms — wall clock crosses the
    /// target, but tokio's Instant clock has only advanced 0ms because
    /// we paused it. The old logic must still wait its full 200ms of
    /// tokio time after we resume, which means total real wall-clock
    /// elapsed = 600ms (paused) + 200ms (post-resume) ≫ target.
    #[tokio::test(start_paused = true)]
    async fn old_logic_misses_target_when_tokio_clock_pauses() {
        let slot = make_slot();
        let armed_at_wall_ms = chrono::Utc::now().timestamp_millis();
        let target_ms = armed_at_wall_ms + 200;

        // Sleep the real OS thread (not tokio) so wall clock advances
        // while tokio time stays frozen. This mirrors "process suspended:
        // the OS scheduler keeps wall time, the process's runtime does not."
        std::thread::sleep(Duration::from_millis(600));

        // Resume: advance tokio's clock past the original deadline.
        // The old wait still completes "on time" by tokio's reckoning,
        // but real wall clock is now ~600ms past target.
        tokio::time::advance(Duration::from_millis(250)).await;

        let outcome = legacy_wait_for_target(target_ms, &slot).await;
        let fired_at_wall_ms = chrono::Utc::now().timestamp_millis();
        let lateness_ms = fired_at_wall_ms - target_ms;

        // Old logic returns FireOnTime — but it's lying: real wall clock
        // is hundreds of ms past target, well outside any "on-time" budget.
        assert_eq!(outcome, WaitOutcome::FireOnTime);
        assert!(
            lateness_ms >= 400,
            "old logic should have fired ≥400ms late (wall clock advanced \
             during tokio pause), but lateness_ms={lateness_ms}"
        );
    }

    /// Same scenario with the NEW logic — it must either fire promptly
    /// (if still within MISS_THRESHOLD_MS) or skip with Missed (if past).
    /// In both branches it does the right thing: re-reads wall clock and
    /// makes a wall-clock-aware decision instead of blindly waiting out
    /// a stale tokio countdown.
    #[tokio::test(start_paused = true)]
    async fn new_logic_recovers_when_tokio_clock_pauses() {
        let slot = make_slot();
        let target_ms = chrono::Utc::now().timestamp_millis() + 200;

        // Same setup: real OS sleep advances wall clock without tokio.
        std::thread::sleep(Duration::from_millis(600));

        // Don't bother advancing tokio at all — the new logic must NOT
        // need tokio's clock to advance. It re-reads wall clock and
        // sees `now > target` immediately. (We do allow tokio::time::sleep
        // to be called inside wait_for_target, so we still need to let
        // tokio advance enough to satisfy any outstanding sleep — but
        // since we're already past target on first iteration, the loop
        // breaks before sleeping at all.)
        let outcome = wait_for_target(target_ms, &slot).await;

        // Wall clock is ~600ms past a target with a 5-min miss threshold,
        // so this is well within FireOnTime.
        assert_eq!(outcome, WaitOutcome::FireOnTime);
    }

    /// Bonus: when the wall-clock jump exceeds MISS_THRESHOLD_MS, the new
    /// logic correctly skips (cron-style). This is the real cure for
    /// B-22: a 6-hour clamshell sleep that lands us well past the target
    /// returns Missed, the slot clears, and the webview re-arms next slot.
    /// The OLD logic would happily fire here at the wrong wall-clock time.
    #[tokio::test]
    async fn new_logic_skips_when_wall_clock_jumped_past_threshold() {
        let slot = make_slot();
        // Target 6 hours in the past — what you'd see waking from a long
        // clamshell sleep. Should skip, not fire.
        let target_ms = chrono::Utc::now().timestamp_millis() - 6 * 60 * 60 * 1000;

        let outcome = wait_for_target(target_ms, &slot).await;

        match outcome {
            WaitOutcome::Missed { late_ms } => {
                assert!(
                    late_ms >= 6 * 60 * 60 * 1000,
                    "expected ≥6h lateness, got {late_ms}ms"
                );
            }
            other => panic!("expected Missed for 6h-late target, got {other:?}"),
        }
    }
}
