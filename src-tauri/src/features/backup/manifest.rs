//! On-disk backup format: one folder per backup with a versioned `manifest.json`.
//!
//! ```text
//! <root>/<package>_<YYYYMMDD-HHMMSS>/
//!   manifest.json
//!   apk/base.apk, apk/split_*.apk
//!   obb/<files>
//!   data.tar            (root only; data.tar.zst in v2)
//!   data_de.tar[.zst]   (extras written by EasyAndroid)
//!   data_ext.tar[.zst]  (extras written by EasyAndroid)
//! ```
//!
//! Format 1 is plain. Format 2 (EasyAndroid) only differs in zstd archives. EasyADB writes
//! format 1 and reads both. See `docs/specs/EASYANDROID_INTEROP.md`.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::adb::shell;
use crate::error::{AppError, AppResult, ErrorCode};

/// Format EasyADB writes.
pub const FORMAT_VERSION: u32 = 1;
/// Newest format EasyADB reads (zstd archives).
pub const MAX_FORMAT_VERSION: u32 = 2;
pub const MANIFEST: &str = "manifest.json";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FileKind {
    Apk,
    Obb,
    Data,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub kind: FileKind,
    /// Path inside the backup folder, using `/`.
    pub stored: String,
    /// Original file name on the device.
    pub name: String,
    pub size: u64,
    pub sha256: String,
}

/// Archives next to `files` that EasyAndroid writes and EasyADB's own readers do not know.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExtraKind {
    DeviceData,
    ExternalData,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ExtraFile {
    pub kind: ExtraKind,
    pub stored: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AppOp {
    pub op: String,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSnapshot {
    pub model: String,
    pub serial: String,
    pub android_version: String,
    pub sdk: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format_version: u32,
    pub app_version: String,
    pub package: String,
    pub label: Option<String>,
    pub version_name: Option<String>,
    pub created_at: String,
    pub device: DeviceSnapshot,
    pub files: Vec<BackupFile>,
    /// Runtime permissions of the app at backup time.
    #[serde(default)]
    pub permissions: Vec<PermissionGrant>,
    #[serde(default)]
    pub extras: Vec<ExtraFile>,
    /// Special app access (`cmd appops`) the user had set.
    #[serde(default)]
    pub app_ops: Vec<AppOp>,
    /// The app was exempt from battery optimization.
    #[serde(default)]
    pub battery_exempt: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PermissionGrant {
    pub name: String,
    pub granted: bool,
}

impl Manifest {
    pub fn has(&self, kind: FileKind) -> bool {
        self.files.iter().any(|f| f.kind == kind)
    }

    /// App data in any form: the private archive or an extra one.
    pub fn has_data(&self) -> bool {
        self.has(FileKind::Data) || !self.extras.is_empty()
    }

    pub fn total_bytes(&self) -> u64 {
        self.files.iter().map(|f| f.size).sum::<u64>()
            + self.extras.iter().map(|f| f.size).sum::<u64>()
    }
}

pub fn read(dir: &Path) -> AppResult<Manifest> {
    let text = fs::read_to_string(dir.join(MANIFEST))
        .map_err(|e| AppError::new(ErrorCode::BackupInvalid, e.to_string()))?;
    let manifest: Manifest = serde_json::from_str(&text)
        .map_err(|e| AppError::new(ErrorCode::BackupInvalid, e.to_string()))?;
    if !(FORMAT_VERSION..=MAX_FORMAT_VERSION).contains(&manifest.format_version) {
        return Err(AppError::new(
            ErrorCode::BackupInvalid,
            format!("unsupported format version {}", manifest.format_version),
        ));
    }
    shell::validate_package(&manifest.package)?;
    for stored in manifest
        .files
        .iter()
        .map(|f| &f.stored)
        .chain(manifest.extras.iter().map(|f| &f.stored))
    {
        safe_relative(stored)?;
    }
    Ok(manifest)
}

pub fn write(dir: &Path, manifest: &Manifest) -> AppResult<()> {
    fs::write(dir.join(MANIFEST), serde_json::to_vec_pretty(manifest)?)?;
    Ok(())
}

/// Rejects stored paths that could escape the backup folder.
pub fn safe_relative(stored: &str) -> AppResult<PathBuf> {
    let path = Path::new(stored);
    let ok = !stored.is_empty()
        && !stored.contains('\\')
        && path
            .components()
            .all(|c| matches!(c, std::path::Component::Normal(_)));
    if ok {
        Ok(path.to_path_buf())
    } else {
        Err(AppError::new(ErrorCode::InvalidPath, stored))
    }
}

/// Resolves a backup id (folder name) inside `root`.
pub fn resolve(root: &Path, id: &str) -> AppResult<PathBuf> {
    let single = Path::new(id).components().count() == 1;
    if !single || id.contains(['/', '\\']) || id == "." || id == ".." {
        return Err(AppError::new(ErrorCode::InvalidPath, id));
    }
    let dir = root.join(id);
    if dir.join(MANIFEST).is_file() {
        Ok(dir)
    } else {
        Err(AppError::new(ErrorCode::NotFound, id))
    }
}

pub fn folder_name(package: &str, time: &chrono::DateTime<chrono::Local>) -> String {
    format!("{package}_{}", time.format("%Y%m%d-%H%M%S"))
}

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub id: String,
    pub path: String,
    pub package: String,
    pub label: Option<String>,
    pub version_name: Option<String>,
    pub created_at: String,
    pub total_bytes: f64,
    pub has_obb: bool,
    pub has_data: bool,
    /// Number of runtime permissions that were granted when the backup was made.
    pub permission_count: u32,
    pub device_model: String,
}

/// Lists valid backups under `root`, newest first. Invalid folders are skipped.
pub fn list(root: &Path) -> Vec<BackupSummary> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut backups: Vec<BackupSummary> = entries
        .flatten()
        .filter(|e| e.path().is_dir())
        .filter_map(|e| {
            let manifest = read(&e.path()).ok()?;
            Some(BackupSummary {
                id: e.file_name().to_string_lossy().into_owned(),
                path: e.path().display().to_string(),
                has_obb: manifest.has(FileKind::Obb),
                has_data: manifest.has_data(),
                permission_count: manifest.permissions.iter().filter(|p| p.granted).count() as u32,
                total_bytes: manifest.total_bytes() as f64,
                device_model: manifest.device.model,
                package: manifest.package,
                label: manifest.label,
                version_name: manifest.version_name,
                created_at: manifest.created_at,
            })
        })
        .collect();
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    backups
}

#[cfg(test)]
pub fn sample(package: &str) -> Manifest {
    Manifest {
        format_version: FORMAT_VERSION,
        app_version: "test".into(),
        package: package.into(),
        label: None,
        version_name: Some("1.0".into()),
        created_at: "2026-01-01T00:00:00+03:00".into(),
        device: DeviceSnapshot::default(),
        files: vec![BackupFile {
            kind: FileKind::Apk,
            stored: "apk/base.apk".into(),
            name: "base.apk".into(),
            size: 3,
            sha256: String::new(),
        }],
        permissions: vec![],
        extras: vec![],
        app_ops: vec![],
        battery_exempt: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_reads_and_lists() {
        let root = tempfile::tempdir().unwrap();
        for (id, created) in [("com.a_1", "2026-01-01"), ("com.b_2", "2026-02-01")] {
            let dir = root.path().join(id);
            fs::create_dir_all(&dir).unwrap();
            let mut m = sample(id.split('_').next().unwrap());
            m.created_at = created.into();
            write(&dir, &m).unwrap();
        }
        fs::create_dir_all(root.path().join("not-a-backup")).unwrap();

        let list = list(root.path());
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].package, "com.b");
        assert_eq!(read(&root.path().join("com.a_1")).unwrap().total_bytes(), 3);
    }

    #[test]
    fn rejects_unsafe_paths() {
        assert!(safe_relative("apk/base.apk").is_ok());
        for bad in ["../evil", "/abs", "apk/../../x", "C:\\x", "apk\\x", ""] {
            assert!(safe_relative(bad).is_err(), "{bad}");
        }
        let root = tempfile::tempdir().unwrap();
        for bad in ["..", "a/b", "a\\b", "."] {
            assert_eq!(
                resolve(root.path(), bad).unwrap_err().code,
                ErrorCode::InvalidPath,
                "{bad}"
            );
        }
        assert_eq!(
            resolve(root.path(), "missing").unwrap_err().code,
            ErrorCode::NotFound
        );
    }

    const EASYANDROID: &str = r#"{
        "formatVersion": 2,
        "appVersion": "0.1.0",
        "package": "com.example.app",
        "label": "Example",
        "versionName": "1.2",
        "createdAt": "2026-11-23T10:00:00.123+03:00",
        "device": { "model": "POCO F4", "serial": "abc", "androidVersion": "15", "sdk": 35 },
        "files": [
            { "kind": "apk", "stored": "apk/base.apk", "name": "base.apk", "size": 3, "sha256": "aa" },
            { "kind": "data", "stored": "data.tar.zst", "name": "data.tar.zst", "size": 9, "sha256": "bb" }
        ],
        "permissions": [{ "name": "android.permission.CAMERA", "granted": true }],
        "extras": [
            { "kind": "device_data", "stored": "data_de.tar.zst", "size": 4, "sha256": "cc" },
            { "kind": "external_data", "stored": "data_ext.tar.zst", "size": 5, "sha256": "dd" }
        ],
        "appOps": [{ "op": "SYSTEM_ALERT_WINDOW", "mode": "allow" }],
        "batteryExempt": true
    }"#;

    #[test]
    fn reads_an_easyandroid_manifest() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(MANIFEST), EASYANDROID).unwrap();
        let m = read(dir.path()).unwrap();
        assert_eq!(m.format_version, 2);
        assert_eq!(m.extras.len(), 2);
        assert_eq!(m.extras[0].kind, ExtraKind::DeviceData);
        assert_eq!(m.app_ops[0].op, "SYSTEM_ALERT_WINDOW");
        assert!(m.battery_exempt && m.has_data());
        assert_eq!(m.total_bytes(), 3 + 9 + 4 + 5);
    }

    #[test]
    fn rejects_unsafe_extra_paths_and_bad_packages() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join(MANIFEST),
            EASYANDROID.replace("data_de.tar.zst", "../evil.tar"),
        )
        .unwrap();
        assert_eq!(read(dir.path()).unwrap_err().code, ErrorCode::InvalidPath);
        fs::write(
            dir.path().join(MANIFEST),
            EASYANDROID.replace("com.example.app", "com.a; reboot"),
        )
        .unwrap();
        assert_eq!(read(dir.path()).unwrap_err().code, ErrorCode::InvalidInput);
    }

    #[test]
    fn rejects_unknown_format_version() {
        let dir = tempfile::tempdir().unwrap();
        let mut m = sample("com.a");
        m.format_version = 99;
        write(dir.path(), &m).unwrap();
        assert_eq!(read(dir.path()).unwrap_err().code, ErrorCode::BackupInvalid);
    }
}
