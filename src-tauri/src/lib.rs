mod keychain;
mod log_commands;
mod migrations;
mod scheduler;
mod smtp;

use std::path::PathBuf;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

pub(crate) fn default_log_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("dev.autumnfallenwang.teacherease-parent-companion")
        .join("logs")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let is_debug = cfg!(debug_assertions);

    // Phase 28 / D-21 — logging via tauri-plugin-log. Single sink at
    // <appDataDir>/logs/app.log via TargetKind::Folder, JSON line shape
    // preserved from the legacy json_log.rs ({"@timestamp", "level",
    // "logger", "message", "app"}). TPC_LOG_LEVEL env var overrides the
    // dev=Debug / prod=Info default for power-user debugging.
    let log_level = std::env::var("TPC_LOG_LEVEL")
        .ok()
        .and_then(|s| s.parse::<log::LevelFilter>().ok())
        .unwrap_or(if is_debug {
            log::LevelFilter::Debug
        } else {
            log::LevelFilter::Info
        });

    let log_dir = default_log_dir();

    let json_format = |out: tauri_plugin_log::fern::FormatCallback,
                       message: &std::fmt::Arguments,
                       record: &log::Record| {
        let ts = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let line = serde_json::json!({
            "@timestamp": ts,
            "level": record.level().to_string(),
            "logger": record.target(),
            "message": format!("{}", message),
            "app": "teacherease-parent-companion",
        });
        out.finish(format_args!("{}", line));
    };

    let mut log_builder = tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::Folder {
                path: log_dir.clone(),
                file_name: Some("app".to_string()),
            },
        ))
        .max_file_size(5 * 1024 * 1024)
        .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
        .level(log_level)
        .format(json_format);

    if is_debug {
        log_builder = log_builder
            .target(tauri_plugin_log::Target::new(
                tauri_plugin_log::TargetKind::Stdout,
            ))
            .target(tauri_plugin_log::Target::new(
                tauri_plugin_log::TargetKind::Webview,
            ));
    }

    tauri::Builder::default()
        .plugin(log_builder.build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:app.db", migrations::initial())
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("TeacherEase Parent Companion")
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            keychain::keychain_set,
            keychain::keychain_get,
            keychain::keychain_delete,
            log_commands::open_log_dir,
            scheduler::schedule_next_tick,
            smtp::send_email,
        ])
        .setup(move |app| {
            // Now that the logger is wired (registered as the first plugin
            // above), emit the startup INFO lines.
            log::info!("app_version={}", env!("CARGO_PKG_VERSION"));
            log::info!("log_file={}", log_dir.join("app.log").display());
            log::info!("build={}", if is_debug { "debug" } else { "release" });
            let app_data = app
                .path()
                .app_data_dir()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|_| "unknown".to_string());
            log::info!("data_dir={}", app_data);

            // Phase 31 / B-20 / Q36 — start the Rust scheduler workers (one
            // per cadence). The workers idle until the webview arms each
            // slot via the schedule_next_tick command. See scheduler.rs.
            let scheduler_state = scheduler::SchedulerState::new();
            scheduler::spawn_workers(app.handle().clone(), &scheduler_state);
            app.manage(scheduler_state);

            // System tray: Open / Refresh / Quit
            let open_i = MenuItem::with_id(app, "open", "Open", true, None::<&str>)?;
            let refresh_i = MenuItem::with_id(app, "refresh", "Refresh Now", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_i, &refresh_i, &quit_i])?;

            TrayIconBuilder::with_id("main-tray")
                .tooltip("TeacherEase Parent Companion")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "refresh" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                            let _ = w.emit("tray-refresh", ());
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
