mod backup;
mod database;

use serde_json::Value;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

struct DatabasePath(PathBuf, Mutex<()>);

#[tauri::command]
fn load_tree(state: State<'_, DatabasePath>) -> Result<Option<Value>, String> {
    let _guard = state.1.lock().map_err(|error| error.to_string())?;
    database::load_tree(&state.0)
}

#[tauri::command]
fn save_tree(tree: Value, state: State<'_, DatabasePath>) -> Result<(), String> {
    let _guard = state.1.lock().map_err(|error| error.to_string())?;
    database::save_tree(&state.0, &tree)
}

#[tauri::command]
fn save_archive_media(media: Value, state: State<'_, DatabasePath>) -> Result<(), String> {
    let _guard = state.1.lock().map_err(|error| error.to_string())?;
    database::save_archive_media(&state.0, &media)
}

#[tauri::command]
fn export_backup(destination: String, state: State<'_, DatabasePath>) -> Result<(), String> {
    let _guard = state.1.lock().map_err(|error| error.to_string())?;
    let destination = PathBuf::from(destination);
    if destination
        .extension()
        .and_then(|extension| extension.to_str())
        != Some("zip")
    {
        return Err("Выберите файл с расширением .zip.".into());
    }
    let bytes = backup::create(&state.0)?;
    let parent = destination
        .parent()
        .ok_or("Некорректный путь резервной копии.")?;
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    std::io::Write::write_all(&mut file, &bytes).map_err(|error| error.to_string())?;
    file.as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    file.persist(destination)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn inspect_backup(bytes: Vec<u8>) -> Result<backup::Summary, String> {
    backup::inspect(&bytes)
}

#[tauri::command]
fn restore_backup(bytes: Vec<u8>, state: State<'_, DatabasePath>) -> Result<String, String> {
    let _guard = state.1.lock().map_err(|error| error.to_string())?;
    backup::restore(&state.0, &bytes).map(|path| path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let database_path = data_dir.join("family-archive.sqlite3");
            database::open(&database_path).map_err(std::io::Error::other)?;
            app.manage(DatabasePath(database_path, Mutex::new(())));
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_tree,
            save_tree,
            save_archive_media,
            export_backup,
            inspect_backup,
            restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
