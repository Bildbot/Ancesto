use base64::{Engine, engine::general_purpose::STANDARD};
use rusqlite::{Connection, params};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

pub fn open(path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    migrate(&connection)?;
    Ok(connection)
}

pub fn migrate(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS tree_snapshot (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                last_modified INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tree_metadata (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                tree_name TEXT NOT NULL,
                description TEXT,
                version INTEGER NOT NULL,
                last_modified INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS persons (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS relationships (
                id TEXT PRIMARY KEY,
                person1_id TEXT NOT NULL REFERENCES persons(id),
                person2_id TEXT NOT NULL REFERENCES persons(id),
                relationship_type TEXT NOT NULL,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS media (
                id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS media_attachments (
                person_id TEXT NOT NULL REFERENCES persons(id),
                media_id TEXT NOT NULL REFERENCES media(id),
                PRIMARY KEY (person_id, media_id)
            );
            CREATE TABLE IF NOT EXISTS face_tags (
                id TEXT PRIMARY KEY,
                media_id TEXT NOT NULL REFERENCES media(id),
                person_id TEXT REFERENCES persons(id),
                payload TEXT NOT NULL
            );
            PRAGMA user_version = 3;
            ",
        )
        .map_err(|error| error.to_string())
}

#[cfg(test)]
pub fn load_snapshot(connection: &Connection) -> Result<Option<Value>, String> {
    let mut statement = connection
        .prepare("SELECT payload FROM tree_snapshot WHERE id = 1")
        .map_err(|error| error.to_string())?;
    let mut rows = statement.query([]).map_err(|error| error.to_string())?;
    let Some(row) = rows.next().map_err(|error| error.to_string())? else {
        return Ok(None);
    };
    let payload: String = row.get(0).map_err(|error| error.to_string())?;
    serde_json::from_str(&payload)
        .map(Some)
        .map_err(|error| error.to_string())
}

pub fn load_tree(path: &Path) -> Result<Option<Value>, String> {
    let connection = open(path)?;
    let Some(mut tree) = load_normalized_tree(&connection)? else {
        return Ok(None);
    };
    hydrate_media(&mut tree, &media_directory(path))?;
    Ok(Some(tree))
}

pub fn save_tree(path: &Path, tree: &Value) -> Result<(), String> {
    let mut stored_tree = tree.clone();
    externalize_media(&mut stored_tree, &media_directory(path))?;
    let mut connection = open(path)?;
    save_snapshot(&mut connection, &stored_tree)?;
    // Cleanup happens only after commit, and uses the committed media table.
    cleanup_media(&connection, &media_directory(path))?;
    Ok(())
}

pub fn save_snapshot(connection: &mut Connection, tree: &Value) -> Result<(), String> {
    let last_modified = tree
        .get("lastModified")
        .and_then(Value::as_i64)
        .ok_or_else(|| "Tree data must include a numeric lastModified value.".to_string())?;
    let payload = serde_json::to_string(tree).map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "
            INSERT INTO tree_snapshot (id, payload, last_modified)
            VALUES (1, ?1, ?2)
            ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, last_modified = excluded.last_modified
            ",
            params![payload, last_modified],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "
            INSERT INTO tree_metadata (id, tree_name, description, version, last_modified)
            VALUES (1, ?1, ?2, ?3, ?4)
            ON CONFLICT(id) DO UPDATE SET
              tree_name = excluded.tree_name,
              description = excluded.description,
              version = excluded.version,
              last_modified = excluded.last_modified
            ",
            params![
                tree.get("treeName")
                    .and_then(Value::as_str)
                    .unwrap_or("Моё семейное древо"),
                tree.get("description").and_then(Value::as_str),
                tree.get("version").and_then(Value::as_i64).unwrap_or(1),
                last_modified,
            ],
        )
        .map_err(|error| error.to_string())?;
    project_tree(&transaction, tree)?;
    transaction.commit().map_err(|error| error.to_string())
}

fn load_normalized_tree(connection: &Connection) -> Result<Option<Value>, String> {
    let mut metadata_statement = connection
        .prepare(
            "SELECT tree_name, description, version, last_modified FROM tree_metadata WHERE id = 1",
        )
        .map_err(|error| error.to_string())?;
    let mut metadata_rows = metadata_statement
        .query([])
        .map_err(|error| error.to_string())?;
    let Some(metadata) = metadata_rows.next().map_err(|error| error.to_string())? else {
        return Ok(None);
    };
    let tree_name: String = metadata.get(0).map_err(|error| error.to_string())?;
    let description: Option<String> = metadata.get(1).map_err(|error| error.to_string())?;
    let version: i64 = metadata.get(2).map_err(|error| error.to_string())?;
    let last_modified: i64 = metadata.get(3).map_err(|error| error.to_string())?;

    let mut media = HashMap::new();
    let mut media_statement = connection
        .prepare("SELECT id, payload FROM media ORDER BY id")
        .map_err(|error| error.to_string())?;
    let mut media_rows = media_statement
        .query([])
        .map_err(|error| error.to_string())?;
    while let Some(row) = media_rows.next().map_err(|error| error.to_string())? {
        let id: String = row.get(0).map_err(|error| error.to_string())?;
        let payload: String = row.get(1).map_err(|error| error.to_string())?;
        let mut item =
            serde_json::from_str::<Value>(&payload).map_err(|error| error.to_string())?;
        if item.get("faces").is_some() {
            item["faces"] = Value::Array(Vec::new());
        }
        media.insert(id, item);
    }

    let mut face_statement = connection
        .prepare("SELECT media_id, payload FROM face_tags ORDER BY id")
        .map_err(|error| error.to_string())?;
    let mut face_rows = face_statement
        .query([])
        .map_err(|error| error.to_string())?;
    while let Some(row) = face_rows.next().map_err(|error| error.to_string())? {
        let media_id: String = row.get(0).map_err(|error| error.to_string())?;
        let payload: String = row.get(1).map_err(|error| error.to_string())?;
        if let Some(media_item) = media.get_mut(&media_id) {
            if !media_item["faces"].is_array() {
                media_item["faces"] = Value::Array(Vec::new());
            }
            media_item["faces"]
                .as_array_mut()
                .unwrap()
                .push(serde_json::from_str(&payload).map_err(|error| error.to_string())?);
        }
    }

    let mut attachments: HashMap<String, Vec<String>> = HashMap::new();
    let mut attachment_statement = connection
        .prepare("SELECT person_id, media_id FROM media_attachments ORDER BY person_id, media_id")
        .map_err(|error| error.to_string())?;
    let mut attachment_rows = attachment_statement
        .query([])
        .map_err(|error| error.to_string())?;
    while let Some(row) = attachment_rows.next().map_err(|error| error.to_string())? {
        let person_id: String = row.get(0).map_err(|error| error.to_string())?;
        let media_id: String = row.get(1).map_err(|error| error.to_string())?;
        attachments.entry(person_id).or_default().push(media_id);
    }

    let mut persons = Vec::new();
    let mut person_statement = connection
        .prepare("SELECT id, payload FROM persons ORDER BY id")
        .map_err(|error| error.to_string())?;
    let mut person_rows = person_statement
        .query([])
        .map_err(|error| error.to_string())?;
    while let Some(row) = person_rows.next().map_err(|error| error.to_string())? {
        let id: String = row.get(0).map_err(|error| error.to_string())?;
        let payload: String = row.get(1).map_err(|error| error.to_string())?;
        let mut person: Value =
            serde_json::from_str(&payload).map_err(|error| error.to_string())?;
        person["mediaFiles"] = Value::Array(
            attachments
                .remove(&id)
                .unwrap_or_default()
                .into_iter()
                .filter_map(|media_id| media.get(&media_id).cloned())
                .collect(),
        );
        persons.push(person);
    }

    let mut relationships: Vec<Value> = Vec::new();
    let mut relationship_statement = connection
        .prepare("SELECT payload FROM relationships ORDER BY id")
        .map_err(|error| error.to_string())?;
    let mut relationship_rows = relationship_statement
        .query([])
        .map_err(|error| error.to_string())?;
    while let Some(row) = relationship_rows
        .next()
        .map_err(|error| error.to_string())?
    {
        let payload: String = row.get(0).map_err(|error| error.to_string())?;
        relationships.push(serde_json::from_str(&payload).map_err(|error| error.to_string())?);
    }

    let mut tree = serde_json::json!({
        "treeName": tree_name,
        "persons": persons,
        "relationships": relationships,
        "mediaArchive": media.into_values().collect::<Vec<_>>(),
        "version": version,
        "lastModified": last_modified,
    });
    if let Some(description) = description {
        tree["description"] = Value::String(description);
    }
    Ok(Some(tree))
}

fn project_tree(transaction: &rusqlite::Transaction<'_>, tree: &Value) -> Result<(), String> {
    let persons = tree
        .get("persons")
        .and_then(Value::as_array)
        .ok_or_else(|| "Tree data must include persons.".to_string())?;
    let relationships = tree
        .get("relationships")
        .and_then(Value::as_array)
        .ok_or_else(|| "Tree data must include relationships.".to_string())?;

    transaction
        .execute_batch(
            "
            DELETE FROM face_tags;
            DELETE FROM media_attachments;
            DELETE FROM relationships;
            DELETE FROM media;
            DELETE FROM persons;
            ",
        )
        .map_err(|error| error.to_string())?;

    let mut person_ids = HashSet::new();
    for person in persons {
        let id = required_string(person, "id", "person")?;
        person_ids.insert(id.to_string());
        transaction
            .execute(
                "INSERT INTO persons (id, payload) VALUES (?1, ?2)",
                params![id, serialize(person)?],
            )
            .map_err(|error| error.to_string())?;
    }

    let mut media_ids = HashSet::new();
    for person in persons {
        let person_id = required_string(person, "id", "person")?;
        for media in person
            .get("mediaFiles")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let media_id = insert_media(transaction, media, &person_ids, &mut media_ids)?;
            transaction
                .execute(
                    "INSERT OR IGNORE INTO media_attachments (person_id, media_id) VALUES (?1, ?2)",
                    params![person_id, media_id],
                )
                .map_err(|error| error.to_string())?;
        }
    }

    for media in tree
        .get("mediaArchive")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        insert_media(transaction, media, &person_ids, &mut media_ids)?;
    }

    for relationship in relationships {
        let id = required_string(relationship, "id", "relationship")?;
        let person1_id = required_string(relationship, "person1Id", "relationship")?;
        let person2_id = required_string(relationship, "person2Id", "relationship")?;
        let relationship_type = required_string(relationship, "type", "relationship")?;
        transaction
            .execute(
                "INSERT INTO relationships (id, person1_id, person2_id, relationship_type, payload) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, person1_id, person2_id, relationship_type, serialize(relationship)?],
            )
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn insert_media(
    transaction: &rusqlite::Transaction<'_>,
    media: &Value,
    person_ids: &HashSet<String>,
    media_ids: &mut HashSet<String>,
) -> Result<String, String> {
    let media_id = required_string(media, "id", "media")?.to_string();
    if media_ids.insert(media_id.clone()) {
        transaction
            .execute(
                "INSERT INTO media (id, payload) VALUES (?1, ?2)",
                params![media_id, serialize(media)?],
            )
            .map_err(|error| error.to_string())?;

        for person_id in media
            .get("manualPersonIds")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
        {
            if !person_ids.contains(person_id) {
                return Err(format!(
                    "Manual media attachment references missing person {person_id}."
                ));
            }
            transaction
                .execute(
                    "INSERT OR IGNORE INTO media_attachments (person_id, media_id) VALUES (?1, ?2)",
                    params![person_id, media_id],
                )
                .map_err(|error| error.to_string())?;
        }

        for face in media
            .get("faces")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let face_id = required_string(face, "id", "face tag")?;
            let person_id = face.get("personId").and_then(Value::as_str);
            if person_id.is_some_and(|id| !person_ids.contains(id)) {
                return Err("Face tag references a missing person.".to_string());
            }
            transaction
                .execute(
                    "INSERT INTO face_tags (id, media_id, person_id, payload) VALUES (?1, ?2, ?3, ?4)",
                    params![face_id, media_id, person_id, serialize(face)?],
                )
                .map_err(|error| error.to_string())?;
        }
    }

    Ok(media_id)
}

fn required_string<'a>(value: &'a Value, field: &str, entity: &str) -> Result<&'a str, String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{entity} must include a string {field}."))
}

fn serialize(value: &Value) -> Result<String, String> {
    serde_json::to_string(value).map_err(|error| error.to_string())
}

fn media_directory(database_path: &Path) -> PathBuf {
    database_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("media")
}

fn externalize_media(tree: &mut Value, media_dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(media_dir).map_err(|error| error.to_string())?;
    visit_media(tree, &mut |media| {
        let Some(data_url) = media
            .get("dataUrl")
            .and_then(Value::as_str)
            .map(str::to_string)
        else {
            return Ok(());
        };
        if !data_url.starts_with("data:") {
            return Ok(());
        }
        required_string(media, "id", "media")?;
        let (header, payload) = data_url
            .split_once(',')
            .ok_or_else(|| "Invalid media data URL.".to_string())?;
        let mime_type = header
            .trim_start_matches("data:")
            .split(';')
            .next()
            .unwrap_or("application/octet-stream")
            .to_string();
        let bytes = if header.ends_with(";base64") {
            STANDARD
                .decode(payload)
                .map_err(|error| error.to_string())?
        } else {
            urlencoding::decode(payload)
                .map_err(|error| error.to_string())?
                .into_owned()
                .into_bytes()
        };
        let extension = match mime_type.as_str() {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/gif" => "gif",
            "image/webp" => "webp",
            "image/svg+xml" => "svg",
            "application/pdf" => "pdf",
            _ => "bin",
        };
        let checksum = sha256_hex(&bytes);
        let file_name = format!("{checksum}.{extension}");
        let file_path = media_dir.join(&file_name);
        // Content-addressed names never overwrite a different committed file.
        if !file_path.exists() {
            let temporary_path = file_path.with_extension("tmp");
            std::fs::write(&temporary_path, &bytes).map_err(|error| error.to_string())?;
            std::fs::rename(&temporary_path, &file_path).map_err(|error| error.to_string())?;
        } else {
            let existing = std::fs::read(&file_path).map_err(|error| error.to_string())?;
            if sha256_hex(&existing) != checksum {
                return Err(format!(
                    "Медиафайл {file_name} повреждён. Сохранение отменено."
                ));
            }
        }
        media["fileSize"] = Value::from(bytes.len() as u64);
        media["sha256"] = Value::String(checksum);
        media["dataUrl"] = Value::String(format!("app-media://{file_name}"));
        if media.get("mimeType").is_none() {
            media["mimeType"] = Value::String(mime_type);
        }
        Ok(())
    })
}

fn hydrate_media(tree: &mut Value, media_dir: &Path) -> Result<(), String> {
    visit_media(tree, &mut |media| {
        let Some(reference) = media.get("dataUrl").and_then(Value::as_str) else {
            return Ok(());
        };
        let Some(file_name) = reference.strip_prefix("app-media://") else {
            return Ok(());
        };
        if Path::new(file_name)
            .file_name()
            .and_then(|name| name.to_str())
            != Some(file_name)
        {
            return Err("Invalid media file reference.".to_string());
        }
        let bytes = std::fs::read(media_dir.join(file_name))
            .map_err(|error| format!("Не удалось прочитать медиафайл {file_name}: {error}"))?;
        let checksum = sha256_hex(&bytes);
        if media
            .get("sha256")
            .and_then(Value::as_str)
            .is_some_and(|expected| expected != checksum)
            || media
                .get("fileSize")
                .and_then(Value::as_u64)
                .is_some_and(|expected| expected != bytes.len() as u64)
        {
            return Err(format!(
                "Медиафайл {file_name} повреждён: контрольная сумма или размер не совпадают."
            ));
        }
        let mime_type = media
            .get("mimeType")
            .and_then(Value::as_str)
            .unwrap_or("application/octet-stream");
        media["dataUrl"] = Value::String(format!(
            "data:{mime_type};base64,{}",
            STANDARD.encode(bytes)
        ));
        // Internal file metadata stays in SQLite, not the UI/export contract.
        if let Some(object) = media.as_object_mut() {
            object.remove("sha256");
            object.remove("fileSize");
        }
        Ok(())
    })
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn cleanup_media(connection: &Connection, media_dir: &Path) -> Result<(), String> {
    let mut referenced = HashSet::new();
    let mut statement = connection
        .prepare("SELECT payload FROM media")
        .map_err(|error| error.to_string())?;
    let payloads = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    for payload in payloads {
        let item: Value = serde_json::from_str(&payload.map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        if let Some(name) = item
            .get("dataUrl")
            .and_then(Value::as_str)
            .and_then(|url| url.strip_prefix("app-media://"))
        {
            referenced.insert(name.to_string());
        }
    }
    for entry in std::fs::read_dir(media_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_file()
            && !referenced.contains(&entry.file_name().to_string_lossy().to_string())
        {
            std::fs::remove_file(entry.path()).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn visit_media(
    tree: &mut Value,
    operation: &mut dyn FnMut(&mut Value) -> Result<(), String>,
) -> Result<(), String> {
    if let Some(archive) = tree.get_mut("mediaArchive").and_then(Value::as_array_mut) {
        for media in archive {
            operation(media)?;
        }
    }
    if let Some(persons) = tree.get_mut("persons").and_then(Value::as_array_mut) {
        for person in persons {
            if let Some(media_files) = person.get_mut("mediaFiles").and_then(Value::as_array_mut) {
                for media in media_files {
                    operation(media)?;
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keeps_shared_content_until_the_last_archive_reference_is_removed() {
        let directory = std::env::temp_dir().join(format!("genedek-shared-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("archive.sqlite3");
        let mut tree = json!({"treeName":"Test", "version":1, "lastModified":1,
        "persons":[], "relationships":[], "mediaArchive":[
            {"id":"one", "dataUrl":"data:text/plain;base64,WA==", "mimeType":"text/plain"},
            {"id":"two", "dataUrl":"data:text/plain;base64,WA==", "mimeType":"text/plain"}
        ]});
        save_tree(&path, &tree).unwrap();
        assert_eq!(
            std::fs::read_dir(directory.join("media")).unwrap().count(),
            1
        );
        tree["mediaArchive"].as_array_mut().unwrap().remove(0);
        save_tree(&path, &tree).unwrap();
        assert_eq!(
            std::fs::read_dir(directory.join("media")).unwrap().count(),
            1
        );
        assert_eq!(load_tree(&path).unwrap(), Some(tree.clone()));
        tree["mediaArchive"] = json!([]);
        save_tree(&path, &tree).unwrap();
        assert_eq!(
            std::fs::read_dir(directory.join("media")).unwrap().count(),
            0
        );
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn reports_a_missing_media_file() {
        let directory =
            std::env::temp_dir().join(format!("genedek-missing-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("archive.sqlite3");
        let tree = json!({"treeName":"Test", "version":1, "lastModified":1,
        "persons":[], "relationships":[], "mediaArchive":[
            {"id":"one", "dataUrl":"data:text/plain;base64,WA==", "mimeType":"text/plain"}
        ]});
        save_tree(&path, &tree).unwrap();
        let file = std::fs::read_dir(directory.join("media"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        std::fs::remove_file(file).unwrap();
        assert!(
            load_tree(&path)
                .unwrap_err()
                .contains("Не удалось прочитать медиафайл")
        );
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn detects_corruption_and_preserves_archive_only_files_until_deleted() {
        let directory =
            std::env::temp_dir().join(format!("genedek-integrity-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("archive.sqlite3");
        let tree = json!({"treeName":"Test", "version":1, "lastModified":1,
        "persons":[], "relationships":[], "mediaArchive":[{
            "id":"shared", "dataUrl":"data:text/plain;base64,WA==", "mimeType":"text/plain"
        }]});
        save_tree(&path, &tree).unwrap();
        let connection = open(&path).unwrap();
        let stored = load_snapshot(&connection).unwrap().unwrap();
        let item = &stored["mediaArchive"][0];
        assert_eq!(item["fileSize"], 1);
        assert_eq!(item["sha256"].as_str().unwrap().len(), 64);
        let name = item["dataUrl"]
            .as_str()
            .unwrap()
            .strip_prefix("app-media://")
            .unwrap();
        let file = directory.join("media").join(name);
        assert!(file.exists());
        std::fs::write(&file, b"Y").unwrap();
        assert!(load_tree(&path).unwrap_err().contains("повреждён"));
        std::fs::write(&file, b"X").unwrap();

        let mut invalid = tree.clone();
        invalid["relationships"] =
            json!([{"id":"bad","person1Id":"missing","person2Id":"missing","type":"parent"}]);
        assert!(save_tree(&path, &invalid).is_err());
        assert!(file.exists());
        assert_eq!(load_tree(&path).unwrap(), Some(tree.clone()));

        let mut empty = tree;
        empty["mediaArchive"] = json!([]);
        save_tree(&path, &empty).unwrap();
        assert!(!file.exists());
        drop(connection);
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn saves_and_loads_a_tree_snapshot() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        let tree = json!({
            "treeName": "Тест",
            "lastModified": 1,
            "version": 1,
            "persons": [],
            "relationships": [],
            "mediaArchive": [{
                "id": "media-1",
                "dataUrl": "data:text/plain;base64,WA==",
                "mimeType": "text/plain"
            }]
        });

        save_snapshot(&mut connection, &tree).unwrap();

        assert_eq!(load_snapshot(&connection).unwrap(), Some(tree));
    }

    #[test]
    fn projects_tree_entities_into_normalized_tables() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        let tree = json!({
            "treeName": "Тест",
            "lastModified": 1,
            "persons": [{
                "id": "person-1",
                "mediaFiles": [{
                    "id": "media-1",
                    "manualPersonIds": ["person-1"],
                    "faces": [{ "id": "face-1", "mediaId": "media-1", "personId": "person-1" }]
                }]
            }],
            "relationships": [{
                "id": "relationship-1",
                "person1Id": "person-1",
                "person2Id": "person-1",
                "type": "custom"
            }],
            "mediaArchive": []
        });

        save_snapshot(&mut connection, &tree).unwrap();

        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM persons", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM relationships", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM media", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM media_attachments", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM face_tags", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }

    #[test]
    fn externalizes_media_and_hydrates_it_on_load() {
        let directory =
            std::env::temp_dir().join(format!("genedek-sqlite-test-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let database_path = directory.join("archive.sqlite3");
        let tree = json!({
            "treeName": "Тест",
            "lastModified": 1,
            "version": 1,
            "persons": [{
                "id": "person-1",
                "mediaFiles": [{
                    "id": "media-1",
                    "dataUrl": "data:text/plain;base64,WA==",
                    "mimeType": "text/plain"
                }]
            }],
            "relationships": [],
            "mediaArchive": [{
                "id": "media-1",
                "dataUrl": "data:text/plain;base64,WA==",
                "mimeType": "text/plain"
            }]
        });

        save_tree(&database_path, &tree).unwrap();
        let connection = open(&database_path).unwrap();
        let stored = load_snapshot(&connection).unwrap().unwrap();

        assert!(
            stored["persons"][0]["mediaFiles"][0]["dataUrl"]
                .as_str()
                .unwrap()
                .starts_with("app-media://")
        );
        assert_eq!(load_tree(&database_path).unwrap(), Some(tree));
        drop(connection);
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn loads_from_normalized_tables_without_a_snapshot() {
        let directory =
            std::env::temp_dir().join(format!("genedek-normalized-test-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let database_path = directory.join("archive.sqlite3");
        let tree = json!({
            "treeName": "Тест",
            "description": "Локальный архив",
            "version": 1,
            "lastModified": 1,
            "persons": [{
                "id": "person-1",
                "mediaFiles": [{
                    "id": "media-1",
                    "dataUrl": "data:text/plain;base64,WA==",
                    "mimeType": "text/plain"
                }]
            }],
            "relationships": [],
            "mediaArchive": [{
                "id": "media-1",
                "dataUrl": "data:text/plain;base64,WA==",
                "mimeType": "text/plain"
            }]
        });

        save_tree(&database_path, &tree).unwrap();
        let connection = open(&database_path).unwrap();
        connection.execute("DELETE FROM tree_snapshot", []).unwrap();
        drop(connection);

        assert_eq!(load_tree(&database_path).unwrap(), Some(tree));
        std::fs::remove_dir_all(directory).unwrap();
    }
}
