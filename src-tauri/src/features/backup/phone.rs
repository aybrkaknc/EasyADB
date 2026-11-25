//! Backups EasyAndroid made on the phone: find them, copy them to the PC, copy PC backups back
//! and remove the phone copies once the PC has them.
//!
//! The folders keep their format, so once they are on the PC they are ordinary backups.
//! See `docs/specs/EASYANDROID_INTEROP.md`.

use std::fs;
use std::path::Path;

use serde::Serialize;
use specta::Type;

use super::fileset::{self, FileSet, Kind};
use super::manifest::{self, Manifest};
use super::transfer;
use crate::adb::{Device, shell};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::features::{device, system_backup};
use crate::tasks::{Reporter, TaskHandle};

/// EasyAndroid's default backup folder.
pub const PHONE_ROOT: &str = "/sdcard/EasyAndroid/Backups";
const MARK: &str = "@@@@ ";

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PhoneBackup {
    pub id: String,
    /// The package, or the kind of a file backup.
    pub package: String,
    pub label: Option<String>,
    pub version_name: Option<String>,
    pub created_at: String,
    pub total_bytes: f64,
    /// Holds app data or system files. Root may be needed to read the files, and to restore them.
    pub needs_root: bool,
    /// A backup with this id is already in the PC backup folder.
    pub on_pc: bool,
    /// Set for file backups (messages, call logs, folders, wallpapers).
    pub file_kind: Option<Kind>,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PullOutcome {
    pub id: String,
    pub error: Option<AppError>,
}

/// One backup folder, read from its manifest.
enum Found {
    App(Manifest),
    Files(FileSet),
}

/// What a backup folder holds, whichever kind it is.
struct Parts {
    /// Name of the manifest file, written last.
    manifest: &'static str,
    /// `stored` path, size and SHA-256 of every file.
    files: Vec<(String, u64, String)>,
    needs_root: bool,
}

impl Found {
    fn parse(file: &str, text: &str) -> AppResult<Self> {
        if file == fileset::FILES_MANIFEST {
            fileset::parse(text).map(Found::Files)
        } else {
            manifest::parse(text).map(Found::App)
        }
    }

    fn parts(&self) -> Parts {
        match self {
            Found::App(m) => Parts {
                manifest: manifest::MANIFEST,
                files: m
                    .files
                    .iter()
                    .map(|f| (f.stored.clone(), f.size, f.sha256.clone()))
                    .chain(
                        m.extras
                            .iter()
                            .map(|f| (f.stored.clone(), f.size, f.sha256.clone())),
                    )
                    .collect(),
                needs_root: m.has_data(),
            },
            Found::Files(set) => Parts {
                manifest: fileset::FILES_MANIFEST,
                files: set
                    .items
                    .iter()
                    .map(|i| (i.stored.clone(), i.size, i.sha256.clone()))
                    .collect(),
                // They are written by root and the folders are not readable by the shell.
                needs_root: true,
            },
        }
    }
}

/// Backup folder names are `<package>_<date>-<time>`; anything else is not one of ours.
pub fn is_id(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
        && name != "."
        && name != ".."
}

/// One manifest found on the phone: folder name, manifest file name and text.
type Listed = (String, String, String);

/// Every manifest on the phone in one adb call.
fn read_manifests(device: Device) -> Vec<Listed> {
    let script = format!(
        "for f in {PHONE_ROOT}/*/manifest.json {PHONE_ROOT}/*/files.json; do echo \"{MARK}$f\"; cat \"$f\"; echo; done 2>/dev/null"
    );
    device
        .script(&script)
        .map(|out| split_manifests(&out))
        .unwrap_or_default()
}

fn split_manifests(out: &str) -> Vec<Listed> {
    out.split(MARK)
        .skip(1)
        .filter_map(|chunk| {
            let (path, text) = chunk.split_once('\n')?;
            let mut parts = path.trim().rsplit('/');
            let file = parts.next()?;
            let id = parts.next()?;
            let known = file == manifest::MANIFEST || file == fileset::FILES_MANIFEST;
            (known && is_id(id)).then(|| (id.to_string(), file.to_string(), text.to_string()))
        })
        .collect()
}

/// Backups on the phone, newest first. A phone without EasyAndroid backups gives an empty list.
pub fn list(device: Device, local_root: &Path) -> Vec<PhoneBackup> {
    let mut found: Vec<PhoneBackup> = read_manifests(device)
        .into_iter()
        .filter_map(|(id, file, text)| {
            let on_pc = local_root.join(&id).join(&file).is_file();
            Some(match Found::parse(&file, &text).ok()? {
                Found::App(m) => PhoneBackup {
                    on_pc,
                    needs_root: m.has_data(),
                    total_bytes: m.total_bytes() as f64,
                    id,
                    package: m.package,
                    label: m.label,
                    version_name: m.version_name,
                    created_at: m.created_at,
                    file_kind: None,
                },
                Found::Files(set) => PhoneBackup {
                    on_pc,
                    needs_root: true,
                    total_bytes: set.total_bytes() as f64,
                    id,
                    package: set.kind.prefix().to_string(),
                    label: None,
                    version_name: None,
                    created_at: set.created_at,
                    file_kind: Some(set.kind),
                },
            })
        })
        .collect();
    found.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    found
}

/// System snapshot files on the phone that are not on the PC yet.
pub fn list_system(device: Device, local_root: &Path) -> Vec<String> {
    device
        .script(&format!("ls -1 {PHONE_ROOT} 2>/dev/null"))
        .map(|out| {
            out.lines()
                .map(str::trim)
                .filter(|name| system_backup::is_file_name(name))
                .filter(|name| !local_root.join(name).exists())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

/// Copies one system snapshot next to the backups. A file that is not a snapshot is removed again.
fn pull_system(
    device: Device,
    root: &Path,
    name: &str,
    use_root: bool,
    task: &TaskHandle,
) -> AppResult<()> {
    if !system_backup::is_file_name(name) {
        return Err(AppError::new(ErrorCode::InvalidPath, name));
    }
    let dest = root.join(name);
    if dest.exists() {
        return Err(AppError::new(
            ErrorCode::Io,
            format!("{name} already exists"),
        ));
    }
    let plain = format!("cat {}", shell::quote(&format!("{PHONE_ROOT}/{name}")));
    let mut ignore = |_: u64| {};
    let first = transfer::pull(device, &plain, &dest, task, &mut ignore);
    let got = match first {
        Err(e) if e.code == ErrorCode::Cancelled => Err(e),
        Ok(v) if v.0 > 0 => Ok(v),
        other if use_root => transfer::pull(
            device,
            &shell::join(&["su", "-c", &plain]),
            &dest,
            task,
            &mut ignore,
        )
        .or_else(|err| other.and(Err(err))),
        other => other,
    };
    let checked = got.and_then(|(bytes, _)| {
        if bytes == 0 {
            return Err(AppError::new(ErrorCode::BackupInvalid, name));
        }
        system_backup::parse(&fs::read_to_string(&dest)?).map(|_| ())
    });
    if checked.is_err() {
        let _ = fs::remove_file(&dest);
    }
    checked
}

/// Copies the chosen backups into `root`. Root is only asked for when a backup holds app data
/// or files written by root, and only used for files the plain shell cannot read.
pub fn pull(
    device: Device,
    root: &Path,
    ids: &[String],
    system: &[String],
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<Vec<PullOutcome>> {
    let on_phone = read_manifests(device);
    let chosen: Vec<(&String, AppResult<(String, Found)>)> = ids
        .iter()
        .map(|id| {
            let found = on_phone
                .iter()
                .find(|(name, _, _)| name == id)
                .ok_or_else(|| AppError::new(ErrorCode::NotFound, id.clone()))
                .and_then(|(_, file, text)| Ok((text.clone(), Found::parse(file, text)?)));
            (id, found)
        })
        .collect();
    // System snapshots are written by root too, so root is asked for them as well.
    let needs_root = !system.is_empty()
        || chosen
            .iter()
            .any(|(_, f)| f.as_ref().is_ok_and(|(_, found)| found.parts().needs_root));
    let use_root = needs_root && device::check_root(device);

    let mut outcomes = Vec::new();
    for (id, found) in chosen {
        if task.is_cancelled() {
            break;
        }
        let error = found
            .and_then(|(text, found)| {
                pull_one(device, root, id, &text, &found, use_root, task, reporter)
            })
            .err();
        outcomes.push(PullOutcome {
            id: id.clone(),
            error,
        });
    }
    for name in system {
        if task.is_cancelled() {
            break;
        }
        reporter.progress("pull", name, 0.0, 0.0);
        outcomes.push(PullOutcome {
            id: name.clone(),
            error: pull_system(device, root, name, use_root, task).err(),
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
    found: &Found,
    use_root: bool,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<()> {
    let dir = root.join(id);
    if dir.exists() {
        return Err(AppError::new(ErrorCode::Io, format!("{id} already exists")));
    }
    let parts = found.parts();
    let total: u64 = parts.files.iter().map(|(_, size, _)| *size).sum();
    crate::diskspace::ensure(root, total)?;
    fs::create_dir_all(&dir)?;
    let result = copy_files(device, &dir, id, &parts, use_root, task, reporter)
        // The manifest comes last, so an interrupted copy is never listed as a backup.
        .and_then(|_| Ok(fs::write(dir.join(parts.manifest), text)?));
    if result.is_err() {
        let _ = fs::remove_dir_all(&dir);
    }
    result
}

fn copy_files(
    device: Device,
    dir: &Path,
    id: &str,
    parts: &Parts,
    use_root: bool,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<()> {
    let total: f64 = parts.files.iter().map(|(_, size, _)| *size as f64).sum();
    let mut done = 0.0;
    for (stored, size, sha) in &parts.files {
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
            Ok(v) if v.0 == *size => Ok(v),
            Err(e) if e.code == ErrorCode::Cancelled => return Err(e),
            // Files written by root may not be readable by the plain shell.
            other if use_root => {
                fetch(&shell::join(&["su", "-c", &plain])).or_else(|err| other.and(Err(err)))
            }
            other => other,
        };
        let (bytes, hash) = got?;
        let bad_hash = !sha.is_empty() && !sha.eq_ignore_ascii_case(&hash);
        if bytes != *size || bad_hash {
            return Err(AppError::new(ErrorCode::IntegrityFailed, stored.clone()));
        }
    }
    Ok(())
}

/// Reads the manifest of the PC copy: its text and what it describes.
fn read_local(root: &Path, id: &str) -> AppResult<(String, Found)> {
    if !is_id(id) {
        return Err(AppError::new(ErrorCode::InvalidPath, id));
    }
    let dir = root.join(id);
    for file in [manifest::MANIFEST, fileset::FILES_MANIFEST] {
        if let Ok(text) = fs::read_to_string(dir.join(file)) {
            let found = Found::parse(file, &text)?;
            return Ok((text, found));
        }
    }
    Err(AppError::new(ErrorCode::NotFound, id))
}

/// Removes backups from the phone, but only those whose PC copy is the same and intact:
/// the manifest matches byte for byte and every file matches its size and SHA-256.
pub fn delete_on_phone(
    device: Device,
    root: &Path,
    ids: &[String],
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<Vec<PullOutcome>> {
    let on_phone = read_manifests(device);
    let mut outcomes = Vec::new();
    for id in ids {
        task.check()?;
        let error = delete_one(device, root, id, &on_phone, task, reporter).err();
        outcomes.push(PullOutcome {
            id: id.clone(),
            error,
        });
    }
    Ok(outcomes)
}

fn delete_one(
    device: Device,
    root: &Path,
    id: &str,
    on_phone: &[Listed],
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<()> {
    let (_, _, remote_text) = on_phone
        .iter()
        .find(|(name, _, _)| name == id)
        .ok_or_else(|| AppError::new(ErrorCode::NotFound, id))?;
    let (local_text, found) = read_local(root, id)?;
    if local_text.trim() != remote_text.trim() {
        return Err(AppError::new(ErrorCode::IntegrityFailed, id));
    }
    let parts = found.parts();
    let total: f64 = parts.files.iter().map(|(_, s, _)| *s as f64).sum();
    let mut done = 0.0;
    for (stored, size, sha) in &parts.files {
        let path = root.join(id).join(manifest::safe_relative(stored)?);
        let mut on_bytes = |n: u64| {
            done += n as f64;
            reporter.progress("verify", id, done, total.max(done));
        };
        transfer::verify_in_place(&path, *size, Some(sha), task, &mut on_bytes)?;
    }
    remove_on_phone(device, id)
}

/// `rm -rf` of one backup folder. The name is checked by [`is_id`] first.
fn remove_on_phone(device: Device, id: &str) -> AppResult<()> {
    if !is_id(id) {
        return Err(AppError::new(ErrorCode::InvalidPath, id));
    }
    let dir = format!("{PHONE_ROOT}/{id}");
    let gone = || device.script(&format!("[ ! -e {dir} ]")).is_ok();
    let _ = device.script(&format!("rm -rf {dir}"));
    if !gone() {
        // Folders written by root may not be removable by the plain shell.
        let _ = device.su(&format!("rm -rf {dir}"));
    }
    if gone() {
        Ok(())
    } else {
        Err(AppError::new(ErrorCode::AdbFailed, dir))
    }
}

/// SHA-256 of a file on the phone.
fn remote_sha(device: Device, path: &str) -> AppResult<String> {
    let out = device.script(&format!("sha256sum {}", shell::quote(path)))?;
    out.split_whitespace()
        .next()
        .map(str::to_lowercase)
        .ok_or_else(|| AppError::new(ErrorCode::AdbFailed, path))
}

/// Copies a PC backup into the phone's backup folder, so that EasyAndroid can restore it.
/// Every file is checked on the phone and the manifest goes last. Never overwrites.
pub fn push(
    device: Device,
    root: &Path,
    id: &str,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<()> {
    let (_, found) = read_local(root, id)?;
    let parts = found.parts();
    let remote = format!("{PHONE_ROOT}/{id}");
    if device.script(&format!("[ -e {remote} ]")).is_ok() {
        return Err(AppError::new(
            ErrorCode::Io,
            format!("{id} already on phone"),
        ));
    }
    device.script(&format!("mkdir -p {remote}"))?;
    let result = push_files(device, root, id, &remote, &parts, task, reporter);
    if result.is_err() {
        let _ = remove_on_phone(device, id);
    }
    result
}

fn push_files(
    device: Device,
    root: &Path,
    id: &str,
    remote: &str,
    parts: &Parts,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<()> {
    let total: f64 = parts.files.iter().map(|(_, s, _)| *s as f64).sum();
    let mut done = 0.0;
    let dir = root.join(id);
    let names = parts
        .files
        .iter()
        .map(|(stored, _, sha)| (stored.as_str(), sha.to_lowercase()))
        .chain([(parts.manifest, String::new())]);
    for (stored, sha) in names {
        task.check()?;
        let local = dir.join(manifest::safe_relative(stored)?);
        let target = format!("{remote}/{stored}");
        if let Some((parent, _)) = target.rsplit_once('/') {
            device.script(&format!("mkdir -p {}", shell::quote(parent)))?;
        }
        let want = if sha.is_empty() {
            transfer::hash_file(&local, task)?
        } else {
            sha
        };
        device.adb(&["push", &local.display().to_string(), &target])?;
        if remote_sha(device, &target)? != want {
            return Err(AppError::new(ErrorCode::IntegrityFailed, stored));
        }
        done += fs::metadata(&local)?.len() as f64;
        reporter.progress("push", id, done, total.max(done));
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

    fn files_json(created: &str) -> String {
        format!(
            r#"{{"format":"easyandroid-files","version":1,"kind":"messages","appVersion":"x","createdAt":"{created}","device":{{"model":"M","serial":"s","androidVersion":"15","sdk":35}},"items":[{{"parent":"/data/user_de/0/com.android.providers.telephony/databases","names":["mmssms.db"],"stored":"0.tar","size":5,"sha256":"cc"}}]}}"#
        )
    }

    fn phone_output() -> String {
        format!(
            "{MARK}{PHONE_ROOT}/com.a_20260101-100000/manifest.json\n{}\n\
             {MARK}{PHONE_ROOT}/com.b_20260201-100000/manifest.json\n{}\n\
             {MARK}{PHONE_ROOT}/broken_1/manifest.json\nnot json\n\
             {MARK}{PHONE_ROOT}/messages_20260301-100000/files.json\n{}\n\
             {MARK}{PHONE_ROOT}/*/manifest.json\n\
             {MARK}{PHONE_ROOT}/*/files.json\n",
            manifest_json("com.a", "2026-01-01T10:00:00+03:00", false),
            manifest_json("com.b", "2026-02-01T10:00:00+03:00", true),
            files_json("2026-03-01T10:00:00+03:00"),
        )
    }

    #[test]
    fn lists_valid_backups_newest_first() {
        let fake = FakeAdb::new().on("manifest.json", &phone_output());
        let root = tempfile::tempdir().unwrap();
        let backups = list(Device::new(&fake, "X"), root.path());
        let ids: Vec<&str> = backups.iter().map(|b| b.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "messages_20260301-100000",
                "com.b_20260201-100000",
                "com.a_20260101-100000"
            ]
        );
        assert_eq!(backups[0].file_kind, Some(Kind::Messages));
        assert!(backups[0].needs_root && backups[1].needs_root && !backups[2].needs_root);
        assert_eq!(backups[2].total_bytes, 3.0);
    }

    #[test]
    fn marks_backups_that_are_already_on_the_pc() {
        let fake = FakeAdb::new().on("manifest.json", &phone_output());
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("com.a_20260101-100000");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(manifest::MANIFEST), "{}").unwrap();
        let sets = root.path().join("messages_20260301-100000");
        fs::create_dir_all(&sets).unwrap();
        fs::write(sets.join(fileset::FILES_MANIFEST), "{}").unwrap();
        let backups = list(Device::new(&fake, "X"), root.path());
        assert!(backups.iter().any(|b| b.package == "com.a" && b.on_pc));
        assert!(backups.iter().any(|b| b.package == "com.b" && !b.on_pc));
        assert!(backups.iter().any(|b| b.file_kind.is_some() && b.on_pc));
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
        let found = Found::App(manifest::parse(&manifest_json("com.a", "2026", false)).unwrap());
        let fake = FakeAdb::new();
        let err = pull_one(
            Device::new(&fake, "X"),
            root.path(),
            "com.a_1",
            "{}",
            &found,
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
            &[],
            &TaskHandle::default(),
            &Reporter::silent(),
        )
        .unwrap();
        assert_eq!(
            outcomes[0].error.as_ref().unwrap().code,
            ErrorCode::NotFound
        );
    }

    #[test]
    fn lists_system_snapshots_missing_on_the_pc() {
        let fake = FakeAdb::new().on(
            "ls -1",
            "com.a_1\nsystem_20260101-100000.json\nsystem_20260202-100000.json\nnotes.txt\n",
        );
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("system_20260101-100000.json"), "{}").unwrap();
        assert_eq!(
            list_system(Device::new(&fake, "X"), root.path()),
            ["system_20260202-100000.json"]
        );
    }

    #[test]
    fn refuses_system_names_that_are_not_snapshots() {
        let fake = FakeAdb::new();
        let root = tempfile::tempdir().unwrap();
        for bad in ["../system_1.json", "system_1.txt", "other.json"] {
            let err = pull_system(
                Device::new(&fake, "X"),
                root.path(),
                bad,
                false,
                &TaskHandle::default(),
            )
            .unwrap_err();
            assert_eq!(err.code, ErrorCode::InvalidPath, "{bad}");
        }
    }

    const ABC_SHA: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    /// A PC copy of `messages_1` whose one file has `content` and is described by `sha`.
    fn local_file_set(root: &Path, content: &[u8], sha: &str) -> String {
        let text = files_json("2026-03-01T10:00:00+03:00")
            .replace("\"size\":5", &format!("\"size\":{}", content.len()))
            .replace("\"sha256\":\"cc\"", &format!("\"sha256\":\"{sha}\""));
        let dir = root.join("messages_1");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("0.tar"), content).unwrap();
        fs::write(dir.join(fileset::FILES_MANIFEST), &text).unwrap();
        text
    }

    fn phone_with(text: &str) -> Vec<Listed> {
        vec![(
            "messages_1".into(),
            fileset::FILES_MANIFEST.into(),
            text.into(),
        )]
    }

    #[test]
    fn deletes_on_the_phone_only_what_the_pc_has_intact() {
        let root = tempfile::tempdir().unwrap();
        let text = local_file_set(root.path(), b"abc", ABC_SHA);
        let fake = FakeAdb::new().on("shell", "");
        delete_one(
            Device::new(&fake, "X"),
            root.path(),
            "messages_1",
            &phone_with(&text),
            &TaskHandle::default(),
            &Reporter::silent(),
        )
        .unwrap();
        let calls = fake.calls().join("\n");
        assert!(calls.contains("rm -rf /sdcard/EasyAndroid/Backups/messages_1"));
    }

    #[test]
    fn keeps_the_phone_copy_when_the_pc_copy_is_not_the_same() {
        let root = tempfile::tempdir().unwrap();
        let text = local_file_set(root.path(), b"abc", ABC_SHA);
        let fake = FakeAdb::new().on("shell", "");
        let other = text.replace("2026-03-01", "2026-03-02");
        let err = delete_one(
            Device::new(&fake, "X"),
            root.path(),
            "messages_1",
            &phone_with(&other),
            &TaskHandle::default(),
            &Reporter::silent(),
        )
        .unwrap_err();
        assert_eq!(err.code, ErrorCode::IntegrityFailed);
        assert!(!fake.calls().iter().any(|c| c.contains("rm -rf")));
    }

    #[test]
    fn keeps_the_phone_copy_when_a_file_on_the_pc_is_damaged() {
        let root = tempfile::tempdir().unwrap();
        let text = local_file_set(root.path(), b"abd", ABC_SHA);
        let fake = FakeAdb::new().on("shell", "");
        let err = delete_one(
            Device::new(&fake, "X"),
            root.path(),
            "messages_1",
            &phone_with(&text),
            &TaskHandle::default(),
            &Reporter::silent(),
        )
        .unwrap_err();
        assert_eq!(err.code, ErrorCode::IntegrityFailed);
        assert!(!fake.calls().iter().any(|c| c.contains("rm -rf")));
    }

    #[test]
    fn refuses_to_delete_names_that_are_not_backup_folders() {
        let fake = FakeAdb::new();
        for bad in ["", "..", "a/b", "*", "a b"] {
            assert!(
                remove_on_phone(Device::new(&fake, "X"), bad).is_err(),
                "{bad}"
            );
        }
        assert!(fake.calls().is_empty());
    }

    #[test]
    fn never_pushes_over_a_backup_that_is_already_on_the_phone() {
        let root = tempfile::tempdir().unwrap();
        local_file_set(root.path(), b"abc", ABC_SHA);
        let fake = FakeAdb::new().on("shell", "");
        let err = push(
            Device::new(&fake, "X"),
            root.path(),
            "messages_1",
            &TaskHandle::default(),
            &Reporter::silent(),
        )
        .unwrap_err();
        assert_eq!(err.code, ErrorCode::Io);
        assert!(!fake.calls().iter().any(|c| c.contains("push")));
    }
}
