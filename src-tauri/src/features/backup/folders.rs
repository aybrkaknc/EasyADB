//! Folders of the phone's shared storage, streamed straight into a backup on the PC.
//!
//! The result is the same `files.json` backup that EasyAndroid makes on the phone, so
//! EasyAndroid can restore it after it is sent back. See `docs/specs/EASYANDROID_INTEROP.md`.

use std::fs;
use std::path::Path;

use super::fileset::{self, Item, Kind, STORAGE};
use super::manifest::DeviceSnapshot;
use super::transfer;
use crate::adb::{Device, shell};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::tasks::{Reporter, TaskHandle};

/// Folder names that may be taken, without repeats. Anything else is refused as a whole.
pub fn check_names(names: &[String]) -> AppResult<Vec<String>> {
    let mut checked: Vec<String> = Vec::new();
    for name in names {
        if !fileset::is_choosable(name) {
            return Err(AppError::new(ErrorCode::InvalidPath, name.clone()));
        }
        if !checked.contains(name) {
            checked.push(name.clone());
        }
    }
    if checked.is_empty() {
        return Err(AppError::invalid_input("no folders"));
    }
    Ok(checked)
}

/// Bytes of the chosen folders, as `du` counts them.
pub fn estimate(device: Device, names: &[String]) -> u64 {
    let script = names
        .iter()
        .map(|n| {
            format!(
                "du -sk {} 2>/dev/null",
                shell::quote(&format!("{STORAGE}/{n}"))
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    device
        .script(&script)
        .map(|out| {
            out.lines()
                .filter_map(|l| l.split_whitespace().next()?.parse::<u64>().ok())
                .sum::<u64>()
                * 1024
        })
        .unwrap_or(0)
}

/// Streams each folder into `<root>/folders_<time>/<n>.tar` and writes `files.json` last.
/// Returns the new backup id. Nothing stays behind when the job fails or is cancelled.
pub fn stream(
    device: Device,
    root: &Path,
    names: &[String],
    snapshot: &DeviceSnapshot,
    has_root: bool,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<String> {
    let names = check_names(names)?;
    for name in &names {
        let source = shell::quote(&format!("{STORAGE}/{name}"));
        if device.script(&format!("[ -d {source} ]")).is_err() {
            return Err(AppError::new(ErrorCode::NotFound, name.clone()));
        }
    }
    let total = estimate(device, &names);
    crate::diskspace::ensure(root, total)?;

    let now = chrono::Local::now();
    let id = fileset::folder_name(Kind::Folders, &now);
    let dir = root.join(&id);
    if dir.exists() {
        return Err(AppError::new(ErrorCode::Io, format!("{id} already exists")));
    }
    fs::create_dir_all(&dir)?;
    let result = fill(device, &dir, &names, total, has_root, task, reporter).and_then(|items| {
        fileset::write(&dir, &fileset::for_folders(&now, snapshot.clone(), items))
    });
    if let Err(err) = result {
        let _ = fs::remove_dir_all(&dir);
        return Err(err);
    }
    Ok(id)
}

fn fill(
    device: Device,
    dir: &Path,
    names: &[String],
    total: u64,
    has_root: bool,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<Vec<Item>> {
    let mut done = 0.0;
    let mut items = Vec::new();
    for (index, name) in names.iter().enumerate() {
        task.check()?;
        let stored = format!("{index}.tar");
        let dest = dir.join(&stored);
        let tar = format!("tar -cf - -C {STORAGE} {}", shell::quote(name));
        let mut on_bytes = |n: u64| {
            done += n as f64;
            reporter.progress("files", name, done, (total as f64).max(done));
        };
        let first = transfer::pull_checked(device, &tar, &dest, task, &mut on_bytes);
        let (size, sha256) = match first {
            Err(e) if e.code == ErrorCode::Cancelled => return Err(e),
            // Some folders need root, for example when another app owns the files.
            Err(_) if has_root => transfer::pull_checked(
                device,
                &shell::join(&["su", "-c", &tar]),
                &dest,
                task,
                &mut on_bytes,
            )?,
            other => other?,
        };
        if size == 0 {
            return Err(AppError::new(ErrorCode::AdbFailed, name.clone()));
        }
        items.push(Item {
            parent: STORAGE.into(),
            names: vec![name.clone()],
            stored,
            size,
            sha256,
        });
    }
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn accepts_plain_folder_names_once() {
        assert_eq!(
            check_names(&names(&["DCIM", "Pictures", "DCIM"])).unwrap(),
            ["DCIM", "Pictures"]
        );
    }

    #[test]
    fn refuses_folders_a_backup_never_takes() {
        for bad in ["Android", "EasyAndroid", ".trash", "a/b", "..", ""] {
            assert!(check_names(&names(&["DCIM", bad])).is_err(), "{bad}");
        }
        assert!(check_names(&[]).is_err());
    }
}
