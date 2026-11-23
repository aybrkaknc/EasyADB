//! Backups EasyAndroid made on the phone: find them and copy them to the PC.
//!
//! The folders keep their format, so once they are on the PC they are ordinary backups.
//! See `docs/specs/EASYANDROID_INTEROP.md`.

use std::fs;
use std::path::Path;

use serde::Serialize;
use specta::Type;

use super::manifest::{self, Manifest};
use super::transfer;
use crate::adb::{Device, shell};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::features::device;
use crate::tasks::{Reporter, TaskHandle};

/// EasyAndroid's default backup folder.
pub const PHONE_ROOT: &str = "/sdcard/EasyAndroid/Backups";
const MARK: &str = "@@@@ ";

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PhoneBackup {
    pub id: String,
    pub package: String,
    pub label: Option<String>,
    pub version_name: Option<String>,
    pub created_at: String,
    pub total_bytes: f64,
    /// Holds app data. Root may be needed to read the files, and to restore them.
    pub needs_root: bool,
    /// A backup with this id is already in the PC backup folder.
    pub on_pc: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PullOutcome {
    pub id: String,
    pub error: Option<AppError>,
}

/// Backup folder names are `<package>_<date>-<time>`; anything else is not one of ours.
fn is_id(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
        && name != "."
        && name != ".."
}

/// Reads every manifest on the phone in one adb call. Returns (folder name, manifest text).
fn read_manifests(device: Device) -> Vec<(String, String)> {
    let script = format!(
        "for f in {PHONE_ROOT}/*/manifest.json; do echo \"{MARK}$f\"; cat \"$f\"; echo; done 2>/dev/null"
    );
    device
        .script(&script)
        .map(|out| split_manifests(&out))
        .unwrap_or_default()
}

fn split_manifests(out: &str) -> Vec<(String, String)> {
    out.split(MARK)
        .skip(1)
        .filter_map(|chunk| {
            let (path, text) = chunk.split_once('\n')?;
            let id = path.trim().rsplit('/').nth(1)?;
            is_id(id).then(|| (id.to_string(), text.to_string()))
        })
        .collect()
}

/// Backups on the phone, newest first. A phone without EasyAndroid backups gives an empty list.
pub fn list(device: Device, local_root: &Path) -> Vec<PhoneBackup> {
    let mut found: Vec<PhoneBackup> = read_manifests(device)
        .into_iter()
        .filter_map(|(id, text)| {
            let manifest = manifest::parse(&text).ok()?;
            Some(PhoneBackup {
                on_pc: local_root.join(&id).join(manifest::MANIFEST).is_file(),
                needs_root: manifest.has_data(),
                total_bytes: manifest.total_bytes() as f64,
                id,
                package: manifest.package,
                label: manifest.label,
                version_name: manifest.version_name,
                created_at: manifest.created_at,
            })
        })
        .collect();
    found.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    found
}

/// Copies the chosen backups into `root`. Root is only asked for when a backup holds app data,
/// and only used for files the plain shell cannot read.
pub fn pull(
    device: Device,
    root: &Path,
    ids: &[String],
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<Vec<PullOutcome>> {
    let on_phone = read_manifests(device);
    let chosen: Vec<(&String, AppResult<Manifest>)> = ids
        .iter()
        .map(|id| {
            let manifest = on_phone
                .iter()
                .find(|(name, _)| name == id)
                .ok_or_else(|| AppError::new(ErrorCode::NotFound, id.clone()))
                .and_then(|(_, text)| manifest::parse(text));
            (id, manifest)
        })
        .collect();
    let needs_root = chosen
        .iter()
        .any(|(_, m)| m.as_ref().is_ok_and(Manifest::has_data));
    let use_root = needs_root && device::check_root(device);

    let mut outcomes = Vec::new();
    for (id, manifest) in chosen {
        if task.is_cancelled() {
            break;
        }
        let text = on_phone
            .iter()
            .find(|(name, _)| name == id)
            .map(|(_, text)| text.as_str())
            .unwrap_or_default();
        let error = manifest
            .and_then(|m| pull_one(device, root, id, text, &m, use_root, task, reporter))
            .err();
        outcomes.push(PullOutcome {
            id: id.clone(),
            error,
        });
    }
    if task.is_cancelled() {
        Err(AppError::cancelled())
    } else {
        Ok(outcomes)
    }
}

#[allow(clippy::too_many_arguments)]
fn pull_one(
    device: Device,
    root: &Path,
    id: &str,
    text: &str,
    manifest: &Manifest,
    use_root: bool,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<()> {
    let dir = root.join(id);
    if dir.exists() {
        return Err(AppError::new(ErrorCode::Io, format!("{id} already exists")));
    }
    fs::create_dir_all(&dir)?;
    let result = copy_files(device, &dir, id, manifest, use_root, task, reporter)
        // The manifest comes last, so an interrupted copy is never listed as a backup.
        .and_then(|_| Ok(fs::write(dir.join(manifest::MANIFEST), text)?));
    if result.is_err() {
        let _ = fs::remove_dir_all(&dir);
    }
    result
}

fn copy_files(
    device: Device,
    dir: &Path,
    id: &str,
    manifest: &Manifest,
    use_root: bool,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<()> {
    let items: Vec<(&str, u64, &str)> = manifest
        .files
        .iter()
        .map(|f| (f.stored.as_str(), f.size, f.sha256.as_str()))
        .chain(
            manifest
                .extras
                .iter()
                .map(|f| (f.stored.as_str(), f.size, f.sha256.as_str())),
        )
        .collect();
    let total: f64 = items.iter().map(|(_, size, _)| *size as f64).sum();
    let mut done = 0.0;
    for (stored, size, sha) in items {
        task.check()?;
        let dest = dir.join(manifest::safe_relative(stored)?);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }
        let plain = format!(
            "cat {}",
            shell::quote(&format!("{PHONE_ROOT}/{id}/{stored}"))
        );
        let mut on_bytes = |n: u64| {
            done += n as f64;
            reporter.progress("pull", id, done, total.max(done));
        };
        let mut fetch = |script: &str| transfer::pull(device, script, &dest, task, &mut on_bytes);
        let got = match fetch(&plain) {
            Ok(v) if v.0 == size => Ok(v),
            Err(e) if e.code == ErrorCode::Cancelled => return Err(e),
            // Files written by root may not be readable by the plain shell.
            other if use_root => {
                fetch(&shell::join(&["su", "-c", &plain])).or_else(|err| other.and(Err(err)))
            }
            other => other,
        };
        let (bytes, hash) = got?;
        let bad_hash = !sha.is_empty() && !sha.eq_ignore_ascii_case(&hash);
        if bytes != size || bad_hash {
            return Err(AppError::new(ErrorCode::IntegrityFailed, stored));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adb::fake::FakeAdb;

    fn manifest_json(package: &str, created: &str, data: bool) -> String {
        let data = if data {
            r#",{"kind":"data","stored":"data.tar","name":"data.tar","size":9,"sha256":"bb"}"#
        } else {
            ""
        };
        format!(
            r#"{{"formatVersion":1,"appVersion":"x","package":"{package}","createdAt":"{created}","device":{{"model":"M","serial":"s","androidVersion":"15","sdk":35}},"files":[{{"kind":"apk","stored":"apk/base.apk","name":"base.apk","size":3,"sha256":"aa"}}{data}]}}"#
        )
    }

    fn phone_output() -> String {
        format!(
            "{MARK}{PHONE_ROOT}/com.a_20260101-100000/manifest.json\n{}\n\
             {MARK}{PHONE_ROOT}/com.b_20260201-100000/manifest.json\n{}\n\
             {MARK}{PHONE_ROOT}/broken_1/manifest.json\nnot json\n\
             {MARK}{PHONE_ROOT}/*/manifest.json\n",
            manifest_json("com.a", "2026-01-01T10:00:00+03:00", false),
            manifest_json("com.b", "2026-02-01T10:00:00+03:00", true),
        )
    }

    #[test]
    fn lists_valid_backups_newest_first() {
        let fake = FakeAdb::new().on("manifest.json", &phone_output());
        let root = tempfile::tempdir().unwrap();
        let backups = list(Device::new(&fake, "X"), root.path());
        let ids: Vec<&str> = backups.iter().map(|b| b.id.as_str()).collect();
        assert_eq!(ids, ["com.b_20260201-100000", "com.a_20260101-100000"]);
        assert!(backups[0].needs_root && !backups[1].needs_root);
        assert_eq!(backups[1].total_bytes, 3.0);
    }

    #[test]
    fn marks_backups_that_are_already_on_the_pc() {
        let fake = FakeAdb::new().on("manifest.json", &phone_output());
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("com.a_20260101-100000");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(manifest::MANIFEST), "{}").unwrap();
        let backups = list(Device::new(&fake, "X"), root.path());
        assert!(backups.iter().any(|b| b.package == "com.a" && b.on_pc));
        assert!(backups.iter().any(|b| b.package == "com.b" && !b.on_pc));
    }

    #[test]
    fn a_phone_without_backups_gives_an_empty_list() {
        let fake = FakeAdb::new().on_fail("manifest.json", "no such directory");
        let root = tempfile::tempdir().unwrap();
        assert!(list(Device::new(&fake, "X"), root.path()).is_empty());
    }

    #[test]
    fn only_plain_folder_names_are_accepted() {
        assert!(is_id("com.example_20260101-120000"));
        for bad in ["", "..", ".", "a/b", "a b", "a;b", "*", "a\\b", "a:b"] {
            assert!(!is_id(bad), "{bad}");
        }
    }

    #[test]
    fn refuses_to_overwrite_an_existing_backup() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("com.a_1")).unwrap();
        let manifest = manifest::parse(&manifest_json("com.a", "2026", false)).unwrap();
        let fake = FakeAdb::new();
        let err = pull_one(
            Device::new(&fake, "X"),
            root.path(),
            "com.a_1",
            "{}",
            &manifest,
            false,
            &TaskHandle::default(),
            &Reporter::silent(),
        )
        .unwrap_err();
        assert_eq!(err.code, ErrorCode::Io);
        assert!(root.path().join("com.a_1").is_dir());
    }

    #[test]
    fn pulling_an_unknown_backup_is_reported() {
        let fake = FakeAdb::new().on("manifest.json", &phone_output());
        let root = tempfile::tempdir().unwrap();
        let outcomes = pull(
            Device::new(&fake, "X"),
            root.path(),
            &["nope_1".to_string()],
            &TaskHandle::default(),
            &Reporter::silent(),
        )
        .unwrap();
        assert_eq!(
            outcomes[0].error.as_ref().unwrap().code,
            ErrorCode::NotFound
        );
    }
}
