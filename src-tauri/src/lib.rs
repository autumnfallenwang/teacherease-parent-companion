mod keychain;
mod migrations;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_log::{Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let log_level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };

    let mut log_targets = vec![
        Target::new(TargetKind::LogDir {
            file_name: Some("app.log".into()),
        }),
        Target::new(TargetKind::Webview),
    ];

    if cfg!(debug_assertions) {
        log_targets.push(Target::new(TargetKind::Stdout));
    }

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log_level)
                .targets(log_targets)
                .max_file_size(2_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
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
        .setup(|app| {
            let app_data = app
                .path()
                .app_data_dir()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|_| "unknown".to_string());
            let app_log = app
                .path()
                .app_log_dir()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|_| "unknown".to_string());

            log::info!(
                "TeacherEase Parent Companion v{}",
                env!("CARGO_PKG_VERSION")
            );
            log::info!("data dir: {}", app_data);
            log::info!("log dir: {}", app_log);
            log::info!(
                "build: {}",
                if cfg!(debug_assertions) {
                    "debug"
                } else {
                    "release"
                }
            );

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
