use crate::database;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use zip::{ZipArchive, ZipWriter, write::SimpleFileOptions};

const MAX_ZIP_SIZE: usize = 100 * 1024 * 1024;
const MAX_EXPANDED_SIZE: u64 = 512 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
struct FileRecord {
    size: u64,
    sha256: String,
}

#[derive(Serialize, Deserialize)]
struct Manifest {
    format: String,
    version: u32,
    files: BTreeMap<String, FileRecord>,
}

#[derive(Serialize)]
pub struct Summary {
    pub persons: usize,
    pub relationships: usize,
    pub media: usize,
}

fn hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn create(path: &Path) -> Result<Vec<u8>, String> {
    let tree = database::load_tree(path)?.ok_or("Архив ещё не сохранён.")?;
    verify_tree_media(path, &tree)?;
    let temporary = tempfile::tempdir().map_err(|error| error.to_string())?;
    let snapshot_path = temporary.path().join("archive.sqlite3");
    let connection = database::open(path)?;
    connection
        .execute("VACUUM INTO ?1", [snapshot_path.to_string_lossy().as_ref()])
        .map_err(|error| error.to_string())?;
    drop(connection);

    let mut files = BTreeMap::new();
    files.insert(
        "archive.sqlite3".to_string(),
        std::fs::read(snapshot_path).map_err(|error| error.to_string())?,
    );
    let media_dir = path.parent().ok_or("Нет каталога архива.")?.join("media");
    for entry in std::fs::read_dir(media_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_file()
        {
            files.insert(
                format!("media/{}", entry.file_name().to_string_lossy()),
                std::fs::read(entry.path()).map_err(|error| error.to_string())?,
            );
        }
    }
    if files.values().map(|bytes| bytes.len() as u64).sum::<u64>() > MAX_EXPANDED_SIZE {
        return Err("Архив превышает лимит 512 МБ.".into());
    }
    let manifest = Manifest {
        format: "genedek-local-backup".into(),
        version: 1,
        files: files
            .iter()
            .map(|(name, bytes)| {
                (
                    name.clone(),
                    FileRecord {
                        size: bytes.len() as u64,
                        sha256: hash(bytes),
                    },
                )
            })
            .collect(),
    };
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    writer
        .start_file("manifest.json", options)
        .map_err(|error| error.to_string())?;
    writer
        .write_all(&serde_json::to_vec(&manifest).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    for (name, bytes) in files {
        writer
            .start_file(name, options)
            .map_err(|error| error.to_string())?;
        writer
            .write_all(&bytes)
            .map_err(|error| error.to_string())?;
    }
    let bytes = writer
        .finish()
        .map_err(|error| error.to_string())?
        .into_inner();
    if bytes.len() > MAX_ZIP_SIZE {
        return Err("ZIP превышает лимит 100 МБ.".into());
    }
    Ok(bytes)
}

fn inspect_tree(bytes: &[u8]) -> Result<(tempfile::TempDir, Value), String> {
    if bytes.len() > MAX_ZIP_SIZE {
        return Err("ZIP превышает лимит 100 МБ.".into());
    }
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("Некорректный ZIP: {error}"))?;
    if archive.len() > 10_000 {
        return Err("Слишком много файлов в ZIP.".into());
    }
    let manifest: Manifest = {
        let file = archive
            .by_name("manifest.json")
            .map_err(|error| error.to_string())?;
        if file.size() > 2 * 1024 * 1024 {
            return Err("Слишком большой манифест.".into());
        }
        serde_json::from_reader(file.take(2 * 1024 * 1024)).map_err(|error| error.to_string())?
    };
    if manifest.format != "genedek-local-backup"
        || manifest.version != 1
        || !manifest.files.contains_key("archive.sqlite3")
    {
        return Err("Неподдерживаемый формат резервной копии.".into());
    }
    let staging = tempfile::tempdir().map_err(|error| error.to_string())?;
    std::fs::create_dir(staging.path().join("media")).map_err(|error| error.to_string())?;
    let mut seen = HashSet::new();
    let mut total = 0u64;
    for index in 0..archive.len() {
        let file = archive.by_index(index).map_err(|error| error.to_string())?;
        let name = file.name().to_string();
        if !seen.insert(name.clone()) {
            return Err("Повторяющиеся имена файлов в ZIP.".into());
        }
        if name == "manifest.json" {
            continue;
        }
        if file.enclosed_name().is_none() || file.is_dir() || file.is_symlink() {
            return Err("Недопустимый путь в ZIP.".into());
        }
        let valid_name = name == "archive.sqlite3"
            || name.strip_prefix("media/").is_some_and(|tail| {
                !tail.is_empty()
                    && tail
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || c == b'.' || c == b'-' || c == b'_')
            });
        if !valid_name {
            return Err("Недопустимый файл в ZIP.".into());
        }
        let record = manifest
            .files
            .get(&name)
            .ok_or("Файл отсутствует в манифесте.")?;
        total = total
            .checked_add(file.size())
            .ok_or("Некорректный размер ZIP.")?;
        if total > MAX_EXPANDED_SIZE || file.size() != record.size {
            return Err("Некорректный размер файла в ZIP.".into());
        }
        let mut content = Vec::new();
        file.take(record.size + 1)
            .read_to_end(&mut content)
            .map_err(|error| error.to_string())?;
        if content.len() as u64 != record.size || hash(&content) != record.sha256 {
            return Err(format!("Контрольная сумма файла {name} не совпадает."));
        }
        std::fs::write(staging.path().join(name), content).map_err(|error| error.to_string())?;
    }
    if seen.len() != manifest.files.len() + 1 {
        return Err("Резервная копия неполна.".into());
    }
    let path = staging.path().join("archive.sqlite3");
    let connection =
        rusqlite::Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|error| error.to_string())?;
    let version: u32 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    let integrity: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if version != 3 || integrity != "ok" {
        return Err("Неподдерживаемая или повреждённая SQLite-база.".into());
    }
    if connection
        .prepare("PRAGMA foreign_key_check")
        .map_err(|error| error.to_string())?
        .query([])
        .map_err(|error| error.to_string())?
        .next()
        .map_err(|error| error.to_string())?
        .is_some()
    {
        return Err("Нарушена целостность ссылок SQLite.".into());
    }
    drop(connection);
    let tree = database::load_tree(&path)?.ok_or("База не содержит дерева.")?;
    verify_tree_media(&path, &tree)?;
    Ok((staging, tree))
}

fn verify_tree_media(path: &Path, tree: &Value) -> Result<(), String> {
    for media in tree
        .get("mediaArchive")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if let Some(file_name) = media
            .get("dataUrl")
            .and_then(Value::as_str)
            .and_then(|url| url.strip_prefix("app-media://"))
        {
            database::read_media(path, file_name)?;
        }
    }
    Ok(())
}

pub fn inspect(bytes: &[u8]) -> Result<Summary, String> {
    let (_staging, tree) = inspect_tree(bytes)?;
    Ok(Summary {
        persons: tree["persons"]
            .as_array()
            .ok_or("Нет списка персон.")?
            .len(),
        relationships: tree["relationships"]
            .as_array()
            .ok_or("Нет списка связей.")?
            .len(),
        media: tree["mediaArchive"]
            .as_array()
            .ok_or("Нет медиаархива.")?
            .len(),
    })
}

pub fn restore(path: &Path, bytes: &[u8]) -> Result<PathBuf, String> {
    let (_staging, tree) = inspect_tree(bytes)?;
    let rollback = create(path)?;
    let rollback_dir = path.parent().ok_or("Нет каталога архива.")?.join("backups");
    std::fs::create_dir_all(&rollback_dir).map_err(|error| error.to_string())?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let rollback_path = rollback_dir.join(format!("before-restore-{timestamp}.zip"));
    std::fs::write(&rollback_path, rollback).map_err(|error| error.to_string())?;
    database::save_tree(path, &tree)?;
    Ok(rollback_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database;
    use serde_json::json;

    fn rewrite_zip(bytes: &[u8], omit: Option<&str>, replace: Option<(&str, &[u8])>) -> Vec<u8> {
        let mut source = ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut target = ZipWriter::new(Cursor::new(Vec::new()));
        for index in 0..source.len() {
            let mut file = source.by_index(index).unwrap();
            let name = file.name().to_string();
            if omit == Some(name.as_str()) {
                continue;
            }
            let mut content = Vec::new();
            file.read_to_end(&mut content).unwrap();
            if let Some((replace_name, replacement)) = replace
                && name == replace_name
            {
                content = replacement.to_vec();
            }
            target
                .start_file(name, SimpleFileOptions::default())
                .unwrap();
            target.write_all(&content).unwrap();
        }
        target.finish().unwrap().into_inner()
    }

    #[test]
    fn rejects_incomplete_and_tampered_backups_without_replacing_tree() {
        let source = tempfile::tempdir().unwrap();
        let path = source.path().join("archive.sqlite3");
        let tree = json!({"treeName":"Source", "version":1,"lastModified":1,"persons":[],"relationships":[],
            "mediaArchive":[{"id":"photo","dataUrl":"data:text/plain;base64,WA==","mimeType":"text/plain"}]});
        database::save_tree(&path, &tree).unwrap();
        let bytes = create(&path).unwrap();
        let archive = ZipArchive::new(Cursor::new(&bytes)).unwrap();
        let media_name = archive
            .file_names()
            .find(|name| name.starts_with("media/"))
            .unwrap()
            .to_string();
        let missing = rewrite_zip(&bytes, Some(&media_name), None);
        assert!(restore(&path, &missing).is_err());
        let tampered = rewrite_zip(&bytes, None, Some((&media_name, b"Y")));
        assert!(
            restore(&path, &tampered)
                .unwrap_err()
                .contains("Контрольная сумма")
        );
        let mut archive = ZipArchive::new(Cursor::new(&bytes)).unwrap();
        let mut manifest: Value =
            serde_json::from_reader(archive.by_name("manifest.json").unwrap()).unwrap();
        manifest["version"] = json!(999);
        let manifest_bytes = serde_json::to_vec(&manifest).unwrap();
        let unsupported = rewrite_zip(&bytes, None, Some(("manifest.json", &manifest_bytes)));
        assert!(
            restore(&path, &unsupported)
                .unwrap_err()
                .contains("Неподдерживаемый формат")
        );
        assert_eq!(
            database::load_tree(&path).unwrap().unwrap()["treeName"],
            tree["treeName"]
        );
        assert!(!source.path().join("backups").exists());
    }

    #[test]
    fn backup_round_trip_and_rejected_restore_preserve_current_data() {
        let source = tempfile::tempdir().unwrap();
        let target = tempfile::tempdir().unwrap();
        let source_path = source.path().join("family-archive.sqlite3");
        let target_path = target.path().join("family-archive.sqlite3");
        let tree = json!({"treeName":"Source", "version":1,"lastModified":1,"persons":[],"relationships":[],
            "mediaArchive":[{"id":"photo","dataUrl":"data:text/plain;base64,WA==","mimeType":"text/plain"}]});
        let old = json!({"treeName":"Old", "version":1,"lastModified":1,"persons":[],"relationships":[],"mediaArchive":[]});
        database::save_tree(&source_path, &tree).unwrap();
        database::save_tree(&target_path, &old).unwrap();
        let bytes = create(&source_path).unwrap();
        assert_eq!(inspect(&bytes).unwrap().media, 1);
        assert!(restore(&target_path, b"broken zip").is_err());
        assert_eq!(
            database::load_tree(&target_path).unwrap(),
            Some(old.clone())
        );
        let rollback = restore(&target_path, &bytes).unwrap();
        let restored = database::load_tree(&target_path).unwrap().unwrap();
        assert_eq!(restored["treeName"], tree["treeName"]);
        assert!(
            restored["mediaArchive"][0]["dataUrl"]
                .as_str()
                .unwrap()
                .starts_with("app-media://")
        );
        let rollback_bytes = std::fs::read(rollback).unwrap();
        assert_eq!(inspect_tree(&rollback_bytes).unwrap().1["treeName"], "Old");
    }
}
