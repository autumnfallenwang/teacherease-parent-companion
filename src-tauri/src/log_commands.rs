use crate::default_log_dir;

#[tauri::command]
pub fn open_log_dir() -> Result<(), String> {
    let dir = default_log_dir();
    log::info!("open_log_dir: path={}", dir.display());
    open::that(&dir).map_err(|e| format!("Failed to open log directory: {e}"))
}
