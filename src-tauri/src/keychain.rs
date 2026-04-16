use keyring::Entry;

const SERVICE: &str = "teacherease-parent-companion";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| format!("Keychain error: {e}"))
}

#[tauri::command]
pub fn keychain_set(key: String, password: String) -> Result<(), String> {
    entry(&key)?
        .set_password(&password)
        .map_err(|e| format!("Failed to store credential: {e}"))
}

#[tauri::command]
pub fn keychain_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to read credential: {e}")),
    }
}

#[tauri::command]
pub fn keychain_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete credential: {e}")),
    }
}
