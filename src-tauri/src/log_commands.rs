#[tauri::command]
pub fn log_info(message: String) {
    log::info!("[webview] {}", message);
}

#[tauri::command]
pub fn log_warn(message: String) {
    log::warn!("[webview] {}", message);
}

#[tauri::command]
pub fn log_error(message: String) {
    log::error!("[webview] {}", message);
}
