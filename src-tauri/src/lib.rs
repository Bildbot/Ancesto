mod backup;
mod database;

use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Manager, State};

struct DatabasePath(PathBuf, Mutex<()>);

fn copy_directory(source: &Path, destination: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(destination)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let target = destination.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

fn migrate_previous_app_data(data_dir: &Path) -> std::io::Result<()> {
    let Some(parent) = data_dir.parent() else {
        return Ok(());
    };
    let previous_dir = parent.join(concat!("com.bildbot.", "gene", "dek"));
    let previous_database = previous_dir.join("family-archive.sqlite3");
    let current_database = data_dir.join("family-archive.sqlite3");
    if previous_database.is_file() && !current_database.exists() {
        copy_directory(&previous_dir, data_dir)?;
    }
    Ok(())
}

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
fn inspect_backup(source: String) -> Result<backup::Summary, String> {
    let bytes = std::fs::read(source).map_err(|error| error.to_string())?;
    backup::inspect(&bytes)
}

#[tauri::command]
fn restore_backup(source: String, state: State<'_, DatabasePath>) -> Result<String, String> {
    let _guard = state.1.lock().map_err(|error| error.to_string())?;
    let bytes = std::fs::read(source).map_err(|error| error.to_string())?;
    backup::restore(&state.0, &bytes).map(|path| path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("app-media", |context, request, responder| {
            let file_name = request.uri().host().unwrap_or_default().to_string();
            let state = context.app_handle().state::<DatabasePath>();
            let result = state
                .1
                .lock()
                .map_err(|error| error.to_string())
                .and_then(|_guard| database::read_media(&state.0, &file_name));
            let response = match result {
                Ok((mime, bytes)) => tauri::http::Response::builder()
                    .header("Content-Type", mime)
                    .header("Cache-Control", "no-store")
                    .header("Access-Control-Allow-Origin", "*")
                    .body(bytes)
                    .unwrap(),
                Err(error) => tauri::http::Response::builder()
                    .status(404)
                    .header("Content-Type", "text/plain; charset=utf-8")
                    .body(error.into_bytes())
                    .unwrap(),
            };
            responder.respond(response);
        })
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            migrate_previous_app_data(&data_dir)?;
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

#[cfg(test)]
mod tests {
    use super::migrate_previous_app_data;

    #[test]
    fn migrates_existing_desktop_archive_to_new_app_directory() {
        let parent = tempfile::tempdir().unwrap();
        let old_dir = parent.path().join(concat!("com.bildbot.", "gene", "dek"));
        let new_dir = parent.path().join("app.ancesto.desktop");
        std::fs::create_dir_all(old_dir.join("media")).unwrap();
        std::fs::write(old_dir.join("family-archive.sqlite3"), b"archive").unwrap();
        std::fs::write(old_dir.join("media/photo.bin"), b"photo").unwrap();

        migrate_previous_app_data(&new_dir).unwrap();

        assert_eq!(
            std::fs::read(new_dir.join("family-archive.sqlite3")).unwrap(),
            b"archive"
        );
        assert_eq!(
            std::fs::read(new_dir.join("media/photo.bin")).unwrap(),
            b"photo"
        );
    }

    #[test]
    fn does_not_overwrite_existing_ancesto_archive() {
        let parent = tempfile::tempdir().unwrap();
        let old_dir = parent.path().join(concat!("com.bildbot.", "gene", "dek"));
        let new_dir = parent.path().join("app.ancesto.desktop");
        std::fs::create_dir_all(&old_dir).unwrap();
        std::fs::create_dir_all(&new_dir).unwrap();
        std::fs::write(old_dir.join("family-archive.sqlite3"), b"old").unwrap();
        std::fs::write(new_dir.join("family-archive.sqlite3"), b"new").unwrap();

        migrate_previous_app_data(&new_dir).unwrap();

        assert_eq!(
            std::fs::read(new_dir.join("family-archive.sqlite3")).unwrap(),
            b"new"
        );
    }
}
