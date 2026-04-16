use keyring::Entry;

const SERVICE: &str = "teacherease-parent-companion";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| format!("Keychain error: {e}"))
}

#[tauri::command]
pub fn keychain_set(key: String, password: String) -> Result<(), String> {
    log::info!("keychain_set key={}", &key);
    entry(&key)?.set_password(&password).map_err(|e| {
        log::error!("keychain_set failed key={} err={}", &key, e);
        format!("Failed to store credential: {e}")
    })
}

#[tauri::command]
pub fn keychain_get(key: String) -> Result<Option<String>, String> {
    log::debug!("keychain_get key={}", &key);
    match entry(&key)?.get_password() {
        Ok(pw) => {
            log::debug!("keychain_get key={} found=true", &key);
            Ok(Some(pw))
        }
        Err(keyring::Error::NoEntry) => {
            log::debug!("keychain_get key={} found=false", &key);
            Ok(None)
        }
        Err(e) => {
            log::error!("keychain_get failed key={} err={}", &key, e);
            Err(format!("Failed to read credential: {e}"))
        }
    }
}

#[tauri::command]
pub fn keychain_delete(key: String) -> Result<(), String> {
    log::info!("keychain_delete key={}", &key);
    match entry(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => {
            log::error!("keychain_delete failed key={} err={}", &key, e);
            Err(format!("Failed to delete credential: {e}"))
        }
    }
}
