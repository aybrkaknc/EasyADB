//! File backups made by EasyAndroid (`files.json`): messages, call logs, wallpapers, folders.
//!
//! EasyADB only copies and checks them, and writes the folder kind itself when it streams
//! folders from the phone. Restoring them is EasyAndroid's job. See
//! `docs/specs/EASYANDROID_INTEROP.md`.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use super::manifest::{self, DeviceSnapshot};
use crate::error::{AppError, AppResult, ErrorCode};

pub const FILES_MANIFEST: &str = "files.json";
pub const FORMAT: &str = "easyandroid-files";
/// The top of shared storage; folder backups are taken from here.
pub const STORAGE: &str = "/storage/emulated/0";

/// Folders that a folder backup never takes: apps and the backups themselves.
const SKIPPED: [&str; 2] = ["Android", "EasyAndroid"];

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Media,
    Folders,
    Wallpaper,
    Calls,
    Messages,
}

impl Kind {
    /// Start of the backup folder name.
    pub fn prefix(self) -> &'static str {
        match self {
            Kind::Media => "media",
            Kind::Folders => "folders",
            Kind::Wallpaper => "wallpaper",
            Kind::Calls => "calls",
            Kind::Messages => "messages",
        }
    }

    /// The one place and the files of the fixed kinds. `None` for folders and media.
    fn place(self) -> Option<(&'static str, Vec<String>)> {
        fn database(name: &str) -> Vec<String> {
            ["", "-wal", "-shm", "-journal"]
                .iter()
                .map(|suffix| format!("{name}{suffix}"))
                .collect()
        }
        match self {
            Kind::Wallpaper => Some((
                "/data/system/users/0",
                [
                    "wallpaper",
                    "wallpaper_orig",
                    "wallpaper_lock",
                    "wallpaper_lock_orig",
                    "wallpaper_info.xml",
                ]
                .map(String::from)
                .to_vec(),
            )),
            Kind::Calls => Some((
                "/data/data/com.android.providers.contacts/databases",
                database("calllog.db"),
            )),
            Kind::Messages => Some((
                "/data/user_de/0/com.android.providers.telephony/databases",
                database("mmssms.db"),
            )),
            Kind::Media | Kind::Folders => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Item {
    pub parent: String,
    pub names: Vec<String>,
    pub stored: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileSet {
    pub format: String,
    pub version: u32,
    pub kind: Kind,
    pub app_version: String,
    pub created_at: String,
    pub device: DeviceSnapshot,
    pub items: Vec<Item>,
}

impl FileSet {
    pub fn total_bytes(&self) -> u64 {
        self.items.iter().map(|i| i.size).sum()
    }
}

/// A single folder name that a folder backup may take.
pub fn is_choosable(name: &str) -> bool {
    !name.is_empty()
        && name != "."
        && name != ".."
        && !name.starts_with('.')
        && !SKIPPED.contains(&name)
        && !name
            .chars()
            .any(|c| c == '/' || c == '\\' || c.is_control())
}

fn allowed(kind: Kind, parent: &str, names: &[String]) -> bool {
    if names.is_empty() {
        return false;
    }
    match kind.place() {
        None => parent == STORAGE && names.iter().all(|n| is_choosable(n)),
        Some((place, files)) => parent == place && names.iter().all(|n| files.contains(n)),
    }
}

/// Parses and checks `files.json` text, wherever it was read from. Backups may come from
/// anywhere and EasyAndroid extracts them as root, so only known places are accepted.
pub fn parse(text: &str) -> AppResult<FileSet> {
    let set: FileSet = serde_json::from_str(text)
        .map_err(|e| AppError::new(ErrorCode::BackupInvalid, e.to_string()))?;
    if set.format != FORMAT || set.version != 1 || set.items.is_empty() {
        return Err(AppError::new(ErrorCode::BackupInvalid, set.format));
    }
    for item in &set.items {
        manifest::safe_relative(&item.stored)?;
        if !allowed(set.kind, &item.parent, &item.names) {
            return Err(AppError::new(ErrorCode::BackupInvalid, item.parent.clone()));
        }
    }
    Ok(set)
}

pub fn read(dir: &Path) -> AppResult<FileSet> {
    let text = fs::read_to_string(dir.join(FILES_MANIFEST))
        .map_err(|e| AppError::new(ErrorCode::BackupInvalid, e.to_string()))?;
    parse(&text)
}

/// The new `files.json` for folders EasyADB streamed from the phone.
pub fn for_folders(
    now: &chrono::DateTime<chrono::Local>,
    device: DeviceSnapshot,
    items: Vec<Item>,
) -> FileSet {
    FileSet {
        format: FORMAT.into(),
        version: 1,
        kind: Kind::Folders,
        app_version: env!("CARGO_PKG_VERSION").into(),
        created_at: now.to_rfc3339(),
        device,
        items,
    }
}

pub fn write(dir: &Path, set: &FileSet) -> AppResult<()> {
    fs::write(dir.join(FILES_MANIFEST), serde_json::to_vec_pretty(set)?)?;
    Ok(())
}

pub fn folder_name(kind: Kind, time: &chrono::DateTime<chrono::Local>) -> String {
    format!("{}_{}", kind.prefix(), time.format("%Y%m%d-%H%M%S"))
}

/// Backup folders in `root` that hold a valid `files.json`, newest first.
#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileSetSummary {
    pub id: String,
    pub kind: Kind,
    pub created_at: String,
    pub total_bytes: f64,
    pub device_model: String,
}

pub fn list(root: &Path) -> Vec<FileSetSummary> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut found: Vec<FileSetSummary> = entries
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| {
            let set = read(&e.path()).ok()?;
            Some(FileSetSummary {
                id: e.file_name().to_string_lossy().into_owned(),
                kind: set.kind,
                total_bytes: set.total_bytes() as f64,
                device_model: set.device.model,
                created_at: set.created_at,
            })
        })
        .collect();
    found.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    const CALLS: &str = r#"{
        "format": "easyandroid-files", "version": 1, "kind": "calls", "appVersion": "0.1.0",
        "createdAt": "2026-11-25T05:41:28+03:00",
        "device": { "model": "POCO F4", "serial": "abc", "androidVersion": "15", "sdk": 35 },
        "items": [{
            "parent": "/data/data/com.android.providers.contacts/databases",
            "names": ["calllog.db", "calllog.db-wal"], "stored": "0.tar", "size": 7, "sha256": "aa"
        }]
    }"#;

    #[test]
    fn reads_an_easyandroid_file_set() {
        let set = parse(CALLS).unwrap();
        assert_eq!(set.kind, Kind::Calls);
        assert_eq!(set.total_bytes(), 7);
    }

    #[test]
    fn only_known_places_are_accepted() {
        let evil = CALLS.replace("com.android.providers.contacts", "com.evil");
        assert_eq!(parse(&evil).unwrap_err().code, ErrorCode::BackupInvalid);
        let name = CALLS.replace("calllog.db-wal", "shadow");
        assert!(parse(&name).is_err());
        let path = CALLS.replace("\"0.tar\"", "\"../0.tar\"");
        assert_eq!(parse(&path).unwrap_err().code, ErrorCode::InvalidPath);
        assert!(parse(&CALLS.replace("\"version\": 1", "\"version\": 2")).is_err());
    }

    #[test]
    fn folders_come_from_shared_storage_only() {
        let folders = CALLS
            .replace("\"calls\"", "\"folders\"")
            .replace(
                "/data/data/com.android.providers.contacts/databases",
                STORAGE,
            )
            .replace("[\"calllog.db\", \"calllog.db-wal\"]", "[\"DCIM\"]");
        assert_eq!(parse(&folders).unwrap().kind, Kind::Folders);
        for bad in ["Android", "EasyAndroid", ".hidden", "a/b", ".."] {
            let text = folders.replace("DCIM", bad);
            assert!(parse(&text).is_err(), "{bad}");
        }
    }

    #[test]
    fn folder_names_start_with_the_kind() {
        let time = chrono::Local::now();
        assert!(folder_name(Kind::Messages, &time).starts_with("messages_"));
        assert!(folder_name(Kind::Folders, &time).starts_with("folders_"));
    }

    #[test]
    fn lists_valid_file_sets_newest_first() {
        let root = tempfile::tempdir().unwrap();
        for (id, created) in [("calls_1", "2026-01-01"), ("calls_2", "2026-02-01")] {
            let dir = root.path().join(id);
            fs::create_dir_all(&dir).unwrap();
            fs::write(
                dir.join(FILES_MANIFEST),
                CALLS.replace("2026-11-25T05:41:28+03:00", created),
            )
            .unwrap();
        }
        fs::create_dir_all(root.path().join("broken")).unwrap();
        let found = list(root.path());
        assert_eq!(found.len(), 2);
        assert_eq!(found[0].id, "calls_2");
    }
}
