use std::{fs, io::Write, path::PathBuf};
use tauri::Manager;

fn slot_path(app: &tauri::AppHandle, slot: &str) -> Result<PathBuf, String> {
    if slot.is_empty() || slot.len() > 64 || !slot.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return Err("Invalid save slot".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("saves");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{slot}.json")))
}

#[tauri::command]
fn save_game(app: tauri::AppHandle, slot: String, text: String) -> Result<(), String> {
    if text.len() > 16 * 1024 * 1024 { return Err("Save exceeds 16 MiB".into()); }
    let destination = slot_path(&app, &slot)?;
    let temporary = destination.with_extension("json.tmp");
    let mut file = fs::File::create(&temporary).map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    drop(file);
    fs::rename(&temporary, &destination).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_game(app: tauri::AppHandle, slot: String) -> Result<Option<String>, String> {
    let path = slot_path(&app, &slot)?;
    if !path.exists() { return Ok(None); }
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 16 * 1024 * 1024 { return Err("Save exceeds 16 MiB".into()); }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_game, load_game])
        .run(tauri::generate_context!())
        .expect("error running Haven desktop shell");
}
