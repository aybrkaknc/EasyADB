//! Creates one backup folder for one package.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use specta::Type;

use super::crypto::{self, Key};
use super::manifest::{self, BackupFile, DeviceSnapshot, FileKind, Manifest};
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
    pub password: Option<String>,
}

pub struct Job<'a> {
    pub device: Device<'a>,
    pub root: &'a Path,
    pub task: &'a TaskHandle,
    pub reporter: &'a Reporter,
    pub snapshot: &'a DeviceSnapshot,
}

fn file_name(remote: &str) -> AppResult<String> {
    let name = remote.rsplit('/').next().unwrap_or_default();
    manifest::safe_relative(name)?;
    Ok(name.to_string())
}

fn version_name(device: Device, package: &str) -> Option<String> {
    let out = device.shell(&["dumpsys", "package", package]).ok()?;
    out.lines()
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

/// Backs up one package and returns the new backup folder.
pub fn create(job: &Job, package: &str, options: &BackupOptions) -> AppResult<PathBuf> {
    shell::validate_package(package)?;
    let apks = parse_pm_path(&job.device.shell(&["pm", "path", package])?);
    if apks.is_empty() {
        return Err(AppError::new(ErrorCode::NotFound, package));
    }
    let key = match options.password.as_deref().filter(|p| !p.is_empty()) {
        Some(password) => Some(crypto::new_key(password)?),
        None => None,
    };

    let now = chrono::Local::now();
    let dir = job.root.join(manifest::folder_name(package, &now));
    fs::create_dir_all(dir.join("apk"))?;
    let result = fill(
        job,
        package,
        options,
        &apks,
        key.as_ref().map(|k| &k.0),
        &dir,
    )
    .map(|files| Manifest {
        format_version: manifest::FORMAT_VERSION,
        app_version: env!("CARGO_PKG_VERSION").into(),
        package: package.into(),
        label: packages::label_for(package),
        version_name: version_name(job.device, package),
        created_at: now.to_rfc3339(),
        device: job.snapshot.clone(),
        files,
        encryption: key.map(|k| k.1),
    });
    match result.and_then(|m| manifest::write(&dir, &m)) {
        Ok(()) => Ok(dir),
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
    key: Option<&Key>,
    dir: &Path,
) -> AppResult<Vec<BackupFile>> {
    let sizes = packages::app_sizes(job.device, &[package.to_string()])?;
    let size = sizes.first();
    let mut total = size.map(|s| s.apk_bytes).unwrap_or(0.0);
    if options.include_obb {
        total += size.map(|s| s.obb_bytes).unwrap_or(0.0);
    }
    let mut done = 0.0;
    let suffix = if key.is_some() { ".enc" } else { "" };
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
        let (bytes, sha) =
            transfer::pull(job.device, &script, &dest, key, job.task, &mut on_bytes)?;
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
        if pull(
            FileKind::Apk,
            "apk",
            script,
            format!("apk/{name}{suffix}"),
            name,
        )? == 0
        {
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
            pull(
                FileKind::Obb,
                "obb",
                script,
                format!("obb/{name}{suffix}"),
                name,
            )?;
        }
    }

    if options.include_data {
        let tar = format!("tar -cf - -C /data/data {package} 2>/dev/null");
        let script = shell::join(&["su", "-c", &tar]);
        let bytes = pull(
            FileKind::Data,
            "data",
            script,
            format!("data.tar{suffix}"),
            "data.tar".into(),
        )?;
        if bytes == 0 {
            return Err(AppError::new(ErrorCode::RootRequired, package));
        }
    }
    Ok(files)
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
}
