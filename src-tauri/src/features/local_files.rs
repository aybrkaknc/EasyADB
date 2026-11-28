//! Folders of the PC, for the window that picks what to upload and where to download.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult, ErrorCode};
use crate::features::transfer;
use crate::state::blocking;
use crate::tasks::TaskHandle;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LocalEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    /// Hidden or a system file, which Explorer does not show.
    pub is_hidden: bool,
    pub size: f64,
    /// Unix seconds.
    pub modified: f64,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LocalPlace {
    /// `downloads`, `desktop`, `documents`, `pictures` or `drive`.
    pub kind: String,
    pub path: String,
}

#[cfg(windows)]
fn is_hidden(meta: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const HIDDEN_OR_SYSTEM: u32 = 0x2 | 0x4;
    meta.file_attributes() & HIDDEN_OR_SYSTEM != 0
}

#[cfg(not(windows))]
fn is_hidden(_meta: &fs::Metadata) -> bool {
    false
}

pub fn list(dir: &Path) -> AppResult<Vec<LocalEntry>> {
    if !dir.is_absolute() {
        return Err(AppError::new(
            ErrorCode::InvalidPath,
            dir.display().to_string(),
        ));
    }
    let entries = fs::read_dir(dir)?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let own = entry.metadata().ok()?;
            let path = entry.path();
            // What a link points to decides whether it opens like a folder.
            let target = fs::metadata(&path).ok()?;
            let name = entry.file_name().to_string_lossy().into_owned();
            Some(LocalEntry {
                is_hidden: is_hidden(&own) || name.starts_with('.'),
                name,
                path: path.display().to_string(),
                is_dir: target.is_dir(),
                size: target.len() as f64,
                modified: target
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map_or(0.0, |d| d.as_secs() as f64),
            })
        })
        .collect();
    Ok(entries)
}

#[tauri::command]
#[specta::specta]
pub async fn list_local(path: String) -> AppResult<Vec<LocalEntry>> {
    blocking(move || list(Path::new(&path))).await
}

/// The known folders and the drives of this PC. The downloads folder comes first.
#[tauri::command]
#[specta::specta]
pub async fn local_places(app: AppHandle) -> AppResult<Vec<LocalPlace>> {
    let resolver = app.path();
    let known: [(&str, Option<PathBuf>); 4] = [
        ("downloads", resolver.download_dir().ok()),
        ("desktop", resolver.desktop_dir().ok()),
        ("documents", resolver.document_dir().ok()),
        ("pictures", resolver.picture_dir().ok()),
    ];
    blocking(move || {
        let drives =
            ('A'..='Z').map(|letter| ("drive", Some(PathBuf::from(format!("{letter}:\\")))));
        Ok(known
            .into_iter()
            .chain(drives)
            .filter_map(|(kind, path)| {
                let path = path.filter(|p| p.is_dir())?;
                Some(LocalPlace {
                    kind: kind.into(),
                    path: path.display().to_string(),
                })
            })
            .collect())
    })
    .await
}

fn make_dir(parent: &Path, name: &str) -> AppResult<String> {
    let name = name.trim();
    if !parent.is_absolute() || name.is_empty() || name == ".." || name.contains(['/', '\\', ':']) {
        return Err(AppError::new(ErrorCode::InvalidPath, name));
    }
    let path = parent.join(name);
    fs::create_dir(&path)?;
    Ok(path.display().to_string())
}

/// Makes a folder in `parent` and returns its path.
#[tauri::command]
#[specta::specta]
pub async fn make_local_dir(parent: String, name: String) -> AppResult<String> {
    blocking(move || make_dir(Path::new(&parent), &name)).await
}

/// The bytes of a file, or of everything in a folder.
#[tauri::command]
#[specta::specta]
pub async fn local_size(path: String) -> AppResult<f64> {
    blocking(move || {
        let items = transfer::scan(&[path], "/", &TaskHandle::default())?;
        Ok(items
            .iter()
            .flat_map(|i| &i.files)
            .map(|f| f.size)
            .sum::<u64>() as f64)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_folders_and_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();
        fs::write(dir.path().join(".secret"), b"12").unwrap();
        let mut entries = list(dir.path()).unwrap();
        entries.sort_by(|a, b| a.name.cmp(&b.name));
        assert_eq!(entries.len(), 2);
        assert!(entries[0].is_hidden && entries[0].size == 2.0);
        assert!(entries[1].is_dir && !entries[1].is_hidden);
        assert!(list(Path::new("relative")).is_err());
    }

    #[test]
    fn makes_only_a_folder_directly_inside() {
        let dir = tempfile::tempdir().unwrap();
        assert!(make_dir(dir.path(), "new").is_ok());
        assert!(dir.path().join("new").is_dir());
        for bad in ["", "..", "a\\b", "a/b", "C:x"] {
            assert!(make_dir(dir.path(), bad).is_err(), "{bad}");
        }
    }
}
