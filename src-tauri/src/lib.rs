mod json_log;
mod keychain;
mod log_commands;
mod migrations;

use std::path::PathBuf;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

fn default_log_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("dev.autumnfallenwang.teacherease-parent-companion")
        .join("logs")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let is_debug = cfg!(debug_assertions);
    let log_level = if is_debug {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };

    // Initialize JSON file logger BEFORE Tauri builder — so all plugin
    // initialization is captured. File at appDataDir/logs/app.log.
    let log_path = default_log_dir().join("app.log");
    json_log::JsonFileLogger::new(
        log_path.clone(),
        if is_debug {
            log::Level::Debug
        } else {
            log::Level::Info
        },
        is_debug,
    )
    .init(log_level);

    log::info!("app_version={}", env!("CARGO_PKG_VERSION"));
    log::info!("log_file={}", log_path.display());
    log::info!("build={}", if is_debug { "debug" } else { "release" });

    tauri::Builder::default()
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
            log_commands::log_info,
            log_commands::log_warn,
            log_commands::log_error,
        ])
        .setup(move |app| {
            let app_data = app
                .path()
                .app_data_dir()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|_| "unknown".to_string());
            log::info!("data_dir={}", app_data);

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
