//! Creates one backup folder for one package.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use specta::Type;

use super::appops;
use super::manifest::{self, BackupFile, DeviceSnapshot, ExtraFile, ExtraKind, FileKind, Manifest};
use super::permissions::parse_runtime_permissions;
use super::transfer;
use crate::adb::parse::parse_pm_path;
use crate::adb::{Device, shell};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::features::{debloat, device, packages};
use crate::tasks::{Reporter, TaskHandle};

#[derive(Debug, Clone, PartialEq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BackupOptions {
    pub include_obb: bool,
    pub include_data: bool,
    /// `Android/data` on shared storage. Needs root, like the private data.
    #[serde(default)]
    pub include_external: bool,
}

/// Packages whose process must keep running while the backup is made.
fn keeps_running(package: &str) -> bool {
    package == device::EASYANDROID_PACKAGE || debloat::is_protected(package)
}

/// App data archives: where they come from, how they are named and where they go in the manifest.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Layer {
    Private,
    DeviceProtected,
    External,
}

impl Layer {
    fn parent(self) -> &'static str {
        match self {
            Layer::Private => "/data/data",
            Layer::DeviceProtected => "/data/user_de/0",
            Layer::External => "/data/media/0/Android/data",
        }
    }

    fn stored(self) -> &'static str {
        match self {
            Layer::Private => "data.tar",
            Layer::DeviceProtected => "data_de.tar",
            Layer::External => "data_ext.tar",
        }
    }
}

/// `tar` script for one data layer. The caches are rebuilt by the app and only add size.
fn tar_script(layer: Layer, package: &str) -> String {
    let excludes = ["cache", "code_cache", "lib"]
        .map(|dir| format!("--exclude {package}/{dir}"))
        .join(" ");
    format!(
        "tar -cf - -C {} {excludes} {package}",
        shell::quote(layer.parent())
    )
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
    /// Data archives that were requested, exist on the phone and could not be read.
    pub data_failed: Vec<String>,
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
    let result = fill(job, package, options, &apks, &dir).and_then(|filled| {
        let Filled {
            files,
            extras,
            data_skipped,
            data_failed,
        } = filled;
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
            extras,
            app_ops,
            battery_exempt,
        };
        manifest::write(&dir, &manifest).map(|_| (data_skipped, data_failed))
    });
    match result {
        Ok((data_skipped, data_failed)) => Ok(Created {
            dir,
            data_skipped,
            data_failed,
        }),
        Err(err) => {
            let _ = fs::remove_dir_all(&dir);
            Err(err)
        }
    }
}

struct Filled {
    files: Vec<BackupFile>,
    extras: Vec<ExtraFile>,
    data_skipped: bool,
    data_failed: Vec<String>,
}

fn fill(
    job: &Job,
    package: &str,
    options: &BackupOptions,
    apks: &[String],
    dir: &Path,
) -> AppResult<Filled> {
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
                    name: String,
                    checked: bool|
     -> AppResult<BackupFile> {
        let dest = dir.join(&stored);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut on_bytes = |n: u64| {
            done += n as f64;
            job.reporter.progress(stage, package, done, total.max(done));
        };
        let fetch = if checked {
            transfer::pull_checked
        } else {
            transfer::pull
        };
        let (bytes, sha) = fetch(job.device, &script, &dest, job.task, &mut on_bytes)?;
        Ok(BackupFile {
            kind,
            stored,
            name,
            size: bytes,
            sha256: sha,
        })
    };

    for remote in apks {
        let name = file_name(remote)?;
        let script = format!("cat {}", shell::quote(remote));
        let apk = pull(
            FileKind::Apk,
            "apk",
            script,
            format!("apk/{name}"),
            name,
            false,
        )?;
        if apk.size == 0 {
            return Err(AppError::new(
                ErrorCode::AdbFailed,
                format!("empty APK: {remote}"),
            ));
        }
        files.push(apk);
    }

    if options.include_obb {
        for remote in obb_files(job.device, package) {
            let name = file_name(&remote)?;
            let script = format!("cat {}", shell::quote(&remote));
            files.push(pull(
                FileKind::Obb,
                "obb",
                script,
                format!("obb/{name}"),
                name,
                false,
            )?);
        }
    }

    let mut extras = Vec::new();
    let mut data_skipped = false;
    let mut data_failed = Vec::new();
    let layers: Vec<Layer> = [
        (options.include_data, Layer::Private),
        (options.include_data, Layer::DeviceProtected),
        (options.include_external, Layer::External),
    ]
    .into_iter()
    .filter_map(|(wanted, layer)| wanted.then_some(layer))
    .collect();
    if package == device::EASYANDROID_PACKAGE {
        // The app that runs the job cannot be stopped, so its data would not be consistent.
        data_skipped = !layers.is_empty();
    } else if !layers.is_empty() && !job.has_root {
        // No root: do not even try, so the device is not asked for root once per app.
        data_skipped = true;
    } else if !layers.is_empty() {
        // The data is only consistent while the app is stopped.
        if !keeps_running(package) {
            let _ = job
                .device
                .shell(&["am", "force-stop", "--user", "0", package]);
        }
        for layer in layers {
            job.task.check()?;
            let source = format!("{}/{package}", layer.parent());
            // Not every app has a device-protected or external folder.
            if job
                .device
                .su(&format!("[ -d {} ]", shell::quote(&source)))
                .is_err()
            {
                if layer == Layer::Private {
                    data_skipped = true;
                }
                continue;
            }
            let stored = layer.stored();
            let script = shell::join(&["su", "-c", &tar_script(layer, package)]);
            let pulled = pull(
                FileKind::Data,
                "data",
                script,
                stored.into(),
                stored.into(),
                true,
            );
            let file = match pulled {
                Ok(file) if file.size > 0 => file,
                Err(err) if err.code == ErrorCode::Cancelled => return Err(err),
                // Unreadable or cut off: keep the app, drop this archive and say so.
                other => {
                    let _ = fs::remove_file(dir.join(stored));
                    data_skipped = true;
                    data_failed.push(match other {
                        Err(err) => format!("{stored}: {}", err.detail),
                        Ok(_) => stored.to_string(),
                    });
                    continue;
                }
            };
            // Only the private archive is a `data` file; the others are extras.
            match layer {
                Layer::Private => files.push(file),
                Layer::DeviceProtected | Layer::External => extras.push(ExtraFile {
                    kind: if layer == Layer::External {
                        ExtraKind::ExternalData
                    } else {
                        ExtraKind::DeviceData
                    },
                    stored: file.stored,
                    size: file.size,
                    sha256: file.sha256,
                }),
            }
        }
    }
    Ok(Filled {
        files,
        extras,
        data_skipped,
        data_failed,
    })
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
