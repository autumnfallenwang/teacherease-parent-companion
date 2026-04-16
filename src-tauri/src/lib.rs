mod json_log;
mod keychain;
mod migrations;

use std::path::PathBuf;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_log::{Target, TargetKind};

fn log_dir(app: &tauri::App) -> PathBuf {
    app.path()
        .app_log_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let is_debug = cfg!(debug_assertions);
    let log_level = if is_debug {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };

    tauri::Builder::default()
        // tauri-plugin-log: still needed for the JS → Rust IPC bridge
        // (attachConsole, info/warn/error from TS). Targets: webview only.
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log_level)
                .targets(vec![Target::new(TargetKind::Webview)])
                .build(),
        )
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
        .invoke_handler(tauri::generate_handler![
            keychain::keychain_set,
            keychain::keychain_get,
            keychain::keychain_delete,
        ])
        .setup(move |app| {
            // JSON file logger — ELK-ready, one line per event
            let json_path = log_dir(app).join("app.log");
            let json_logger = json_log::JsonFileLogger::new(
                json_path.clone(),
                if is_debug {
                    log::Level::Debug
                } else {
                    log::Level::Info
                },
                is_debug, // stdout in dev only
            );
            // Set as the global logger (log crate). tauri-plugin-log
            // handles the webview bridge separately.
            if log::set_boxed_logger(Box::new(json_logger)).is_ok() {
                log::set_max_level(log_level);
            }

            let app_data = app
                .path()
                .app_data_dir()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|_| "unknown".to_string());

            log::info!("app_version={}", env!("CARGO_PKG_VERSION"));
            log::info!("data_dir={}", app_data);
            log::info!("log_file={}", json_path.display());
            log::info!("build={}", if is_debug { "debug" } else { "release" });

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
