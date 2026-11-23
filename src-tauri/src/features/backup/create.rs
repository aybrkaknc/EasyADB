//! Creates one backup folder for one package.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use specta::Type;

use super::appops;
use super::manifest::{self, BackupFile, DeviceSnapshot, FileKind, Manifest};
use super::permissions::parse_runtime_permissions;
use super::transfer;
use crate::adb::parse::parse_pm_path;
use crate::adb::{Device, shell};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::features::{device, packages};
use crate::tasks::{Reporter, TaskHandle};

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BackupOptions {
    pub include_obb: bool,
    pub include_data: bool,
}

pub struct Job<'a> {
    pub device: Device<'a>,
    pub root: &'a Path,
    pub task: &'a TaskHandle,
    pub reporter: &'a Reporter,
    pub snapshot: &'a DeviceSnapshot,
    /// Root was checked once for this job; without it app data is never read.
    pub has_root: bool,
}

fn file_name(remote: &str) -> AppResult<String> {
    let name = remote.rsplit('/').next().unwrap_or_default();
    manifest::safe_relative(name)?;
    Ok(name.to_string())
}

fn version_name(dump: &str) -> Option<String> {
    dump.lines()
        .find_map(|line| line.trim().strip_prefix("versionName="))
        .map(|v| v.trim().to_string())
}

fn obb_files(device: Device, package: &str) -> Vec<String> {
    let dir = format!("/sdcard/Android/obb/{package}");
    device
        .script(&format!("find {} -type f 2>/dev/null", shell::quote(&dir)))
        .map(|out| {
            out.lines()
                .map(str::trim)
                .filter(|l| !l.is_empty())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

pub fn snapshot(device: Device) -> DeviceSnapshot {
    match device::details(device) {
        Ok(d) => DeviceSnapshot {
            model: d.model,
            serial: d.serial,
            android_version: d.android_version,
            sdk: d.sdk,
        },
        Err(_) => DeviceSnapshot {
            serial: device.serial().to_string(),
            ..Default::default()
        },
    }
}

/// The new backup folder, and whether app data was requested but could not be backed up
/// (no root, or the root prompt was denied). The app itself is still backed up in that case.
pub struct Created {
    pub dir: PathBuf,
    pub data_skipped: bool,
}

/// Backs up one package.
pub fn create(job: &Job, package: &str, options: &BackupOptions) -> AppResult<Created> {
    shell::validate_package(package)?;
    let apks = parse_pm_path(&job.device.shell(&["pm", "path", package])?);
    if apks.is_empty() {
        return Err(AppError::new(ErrorCode::NotFound, package));
    }
    // Permissions and version are best effort: a backup without them is still useful.
    let dump = job
        .device
        .shell(&["dumpsys", "package", package])
        .unwrap_or_default();
    let app_ops = job
        .device
        .shell(&["cmd", "appops", "get", "--user", "0", package])
        .map(|out| appops::parse_app_ops(&out))
        .unwrap_or_default();
    let battery_exempt = job
        .device
        .shell(&["dumpsys", "deviceidle", "whitelist"])
        .is_ok_and(|out| appops::is_battery_exempt(&out, package));

    let now = chrono::Local::now();
    let dir = job.root.join(manifest::folder_name(package, &now));
    fs::create_dir_all(dir.join("apk"))?;
    let result = fill(job, package, options, &apks, &dir).and_then(|(files, data_skipped)| {
        let manifest = Manifest {
            format_version: manifest::FORMAT_VERSION,
            app_version: env!("CARGO_PKG_VERSION").into(),
            package: package.into(),
            label: packages::label_for(package),
            version_name: version_name(&dump),
            created_at: now.to_rfc3339(),
            device: job.snapshot.clone(),
            files,
            permissions: parse_runtime_permissions(&dump),
            extras: Vec::new(),
            app_ops,
            battery_exempt,
        };
        manifest::write(&dir, &manifest).map(|_| data_skipped)
    });
    match result {
        Ok(data_skipped) => Ok(Created { dir, data_skipped }),
        Err(err) => {
            let _ = fs::remove_dir_all(&dir);
            Err(err)
        }
    }
}

fn fill(
    job: &Job,
    package: &str,
    options: &BackupOptions,
    apks: &[String],
    dir: &Path,
) -> AppResult<(Vec<BackupFile>, bool)> {
    let sizes = packages::app_sizes(job.device, &[package.to_string()])?;
    let size = sizes.first();
    let mut total = size.map(|s| s.apk_bytes).unwrap_or(0.0);
    if options.include_obb {
        total += size.map(|s| s.obb_bytes).unwrap_or(0.0);
    }
    let mut done = 0.0;
    let mut files = Vec::new();

    let mut pull = |kind: FileKind,
                    stage: &str,
                    script: String,
                    stored: String,
                    name: String|
     -> AppResult<u64> {
        let dest = dir.join(&stored);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut on_bytes = |n: u64| {
            done += n as f64;
            job.reporter.progress(stage, package, done, total.max(done));
        };
        let (bytes, sha) = transfer::pull(job.device, &script, &dest, job.task, &mut on_bytes)?;
        files.push(BackupFile {
            kind,
            stored,
            name,
            size: bytes,
            sha256: sha,
        });
        Ok(bytes)
    };

    for remote in apks {
        let name = file_name(remote)?;
        let script = format!("cat {}", shell::quote(remote));
        if pull(FileKind::Apk, "apk", script, format!("apk/{name}"), name)? == 0 {
            return Err(AppError::new(
                ErrorCode::AdbFailed,
                format!("empty APK: {remote}"),
            ));
        }
    }

    if options.include_obb {
        for remote in obb_files(job.device, package) {
            let name = file_name(&remote)?;
            let script = format!("cat {}", shell::quote(&remote));
            pull(FileKind::Obb, "obb", script, format!("obb/{name}"), name)?;
        }
    }

    let mut data_skipped = false;
    if options.include_data && !job.has_root {
        // No root: do not even try, so the device is not asked for root once per app.
        data_skipped = true;
    } else if options.include_data {
        let tar = format!("tar -cf - -C /data/data {package} 2>/dev/null");
        let script = shell::join(&["su", "-c", &tar]);
        let pulled = pull(
            FileKind::Data,
            "data",
            script,
            "data.tar".into(),
            "data.tar".into(),
        );
        match pulled {
            Ok(bytes) if bytes > 0 => {}
            Err(err) if err.code == ErrorCode::Cancelled => return Err(err),
            // No root, root denied or an empty archive: keep the app, drop the data.
            other => {
                if other.is_ok() {
                    files.pop();
                }
                let _ = fs::remove_file(dir.join("data.tar"));
                data_skipped = true;
            }
        }
    }
    Ok((files, data_skipped))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_safe_file_names() {
        assert_eq!(
            file_name("/data/app/~~x==/com.a-1/base.apk").unwrap(),
            "base.apk"
        );
        assert_eq!(
            file_name("/sdcard/Android/obb/com.a/main.1.com.a.obb").unwrap(),
            "main.1.com.a.obb"
        );
        assert!(file_name("/data/app/..").is_err());
    }

    #[test]
    fn reads_version_name() {
        assert_eq!(
            version_name("  userId=1\n    versionName=2.5.1\n  other").as_deref(),
            Some("2.5.1")
        );
        assert_eq!(version_name(""), None);
    }
}
