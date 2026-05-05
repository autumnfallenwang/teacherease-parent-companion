// Phase 31 / B-20 / Q36 — wall-clock timer for fetch + notify schedulers.
// TS owns the cadence math; Rust just sleeps until fire_at_ms and emits a
// Tauri event. Webview's tick handler runs the cycle then re-arms by calling
// schedule_next_tick again. Decoupling the timer from the webview's JS event
// loop is the whole point — macOS pauses webview setTimeout when the window
// is unfocused, so the prior in-webview ScheduleLoop fired late or only on
// focus-gain. Rust's tokio runtime is independent of webview state.

use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{Mutex, Notify};
use tokio::time::{sleep_until, Instant};

const FETCH_TICK_EVENT: &str = "scheduler:fetch-tick";
const NOTIFY_TICK_EVENT: &str = "scheduler:notify-tick";

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
                Some(target_ms) => {
                    let now_ms = chrono::Utc::now().timestamp_millis();
                    let delta_ms = u64::try_from((target_ms - now_ms).max(0)).unwrap_or(0);
                    let deadline = Instant::now() + Duration::from_millis(delta_ms);

                    tokio::select! {
                        _ = sleep_until(deadline) => {
                            log::info!(
                                "scheduler-rust: {kind} fired target_ms={target_ms}",
                            );
                            if let Err(e) = app.emit(event_name, ()) {
                                log::error!(
                                    "scheduler-rust: emit {event_name} failed — {e}",
                                );
                            }
                            // Clear the slot so the next iteration waits on
                            // cancel.notified() until the webview re-arms.
                            *slot.fire_at_ms.lock().await = None;
                        }
                        _ = slot.cancel.notified() => {
                            log::debug!("scheduler-rust: {kind} sleep cancelled — re-reading target");
                        }
                    }
                }
            }
        }
    });
}
