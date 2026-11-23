//! Restores one backup folder onto a device.
//!
//! The app is always installed. Permissions and data are optional extras: a failure
//! there never undoes the install, it is reported back instead.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use super::manifest::{self, BackupFile, FileKind, Manifest};
use super::permissions::is_valid_permission;
use super::transfer;
use crate::adb::{Device, shell};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::features::device;
use crate::tasks::{Reporter, TaskHandle};

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOptions {
    pub restore_obb: bool,
    pub restore_data: bool,
    pub restore_permissions: bool,
    pub verify_hash: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum DataStatus {
    NotRequested,
    Restored,
    /// There is no root, or the root prompt on the device was denied.
    NoRoot,
    Failed,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RestoreReport {
    pub data: DataStatus,
    /// Error text when `data` is `Failed`.
    pub detail: Option<String>,
    pub permissions_granted: u32,
    pub permissions_total: u32,
}

pub fn restore(
    device: Device,
    dir: &Path,
    options: &RestoreOptions,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<RestoreReport> {
    let manifest = manifest::read(dir)?;
    shell::validate_package(&manifest.package)?;
    let wants = |f: &&BackupFile| match f.kind {
        FileKind::Apk => true,
        FileKind::Obb => options.restore_obb,
        FileKind::Data => options.restore_data,
    };
    let selected: Vec<&BackupFile> = manifest.files.iter().filter(wants).collect();
    let local = verify(
        &manifest,
        &selected,
        dir,
        options.verify_hash,
        task,
        reporter,
    )?;
    let path_of = |kind: FileKind| -> Vec<&PathBuf> {
        selected
            .iter()
            .zip(&local)
            .filter(|(f, _)| f.kind == kind)
            .map(|(_, p)| p)
            .collect()
    };

    task.check()?;
    reporter.progress("install", &manifest.package, 0.0, 1.0);
    install(device, &path_of(FileKind::Apk))?;

    let obb = path_of(FileKind::Obb);
    if !obb.is_empty() {
        reporter.progress("obb", &manifest.package, 0.0, 1.0);
        let target = format!("/sdcard/Android/obb/{}", manifest.package);
        device.shell(&["mkdir", "-p", &target])?;
        for (file, path) in selected
            .iter()
            .zip(&local)
            .filter(|(f, _)| f.kind == FileKind::Obb)
        {
            task.check()?;
            device.adb(&[
                "push",
                &path.display().to_string(),
                &format!("{target}/{}", file.name),
            ])?;
        }
    }

    let (permissions_granted, permissions_total) = if options.restore_permissions {
        reporter.progress("permissions", &manifest.package, 0.0, 1.0);
        grant_permissions(device, &manifest)
    } else {
        (0, 0)
    };

    let (data, detail) = match path_of(FileKind::Data).first() {
        None => (DataStatus::NotRequested, None),
        Some(tar) => {
            task.check()?;
            reporter.progress("data", &manifest.package, 0.0, 1.0);
            if !device::check_root(device) {
                (DataStatus::NoRoot, None)
            } else {
                match restore_data(device, &manifest.package, tar) {
                    Ok(()) => (DataStatus::Restored, None),
                    Err(err) => (DataStatus::Failed, Some(err.detail)),
                }
            }
        }
    };
    Ok(RestoreReport {
        data,
        detail,
        permissions_granted,
        permissions_total,
    })
}

/// Checks every selected file in the backup folder and returns their paths.
fn verify(
    manifest: &Manifest,
    files: &[&BackupFile],
    dir: &Path,
    verify_hash: bool,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<Vec<PathBuf>> {
    let total: f64 = files.iter().map(|f| f.size as f64).sum();
    let mut done = 0.0;
    let mut paths = Vec::new();
    for file in files {
        let stored = dir.join(manifest::safe_relative(&file.stored)?);
        if !stored.is_file() {
            return Err(AppError::new(
                ErrorCode::IntegrityFailed,
                file.stored.clone(),
            ));
        }
        let sha = verify_hash.then_some(file.sha256.as_str());
        let mut on_bytes = |n: u64| {
            done += n as f64;
            reporter.progress("verify", &manifest.package, done, total);
        };
        transfer::verify_in_place(&stored, file.size, sha, task, &mut on_bytes)?;
        paths.push(stored);
    }
    Ok(paths)
}

fn install(device: Device, apks: &[&PathBuf]) -> AppResult<()> {
    let paths: Vec<String> = apks.iter().map(|p| p.display().to_string()).collect();
    let mut args = vec![
        if paths.len() > 1 {
            "install-multiple"
        } else {
            "install"
        },
        "-r",
    ];
    args.extend(paths.iter().map(String::as_str));
    let out = device.adb_raw(&args)?;
    let text = format!("{}{}", out.stdout, out.stderr);
    if out.success && text.contains("Success") {
        Ok(())
    } else {
        Err(AppError::new(ErrorCode::InstallFailed, text.trim()))
    }
}

/// Grants the runtime permissions that were granted at backup time.
/// Returns (granted, wanted). Permissions the new system no longer knows are skipped.
fn grant_permissions(device: Device, manifest: &Manifest) -> (u32, u32) {
    let wanted: Vec<&str> = manifest
        .permissions
        .iter()
        .filter(|p| p.granted && is_valid_permission(&p.name))
        .map(|p| p.name.as_str())
        .collect();
    let granted = wanted
        .iter()
        .filter(|name| {
            device
                .shell(&["pm", "grant", &manifest.package, name])
                .is_ok()
        })
        .count();
    (granted as u32, wanted.len() as u32)
}

fn restore_data(device: Device, package: &str, tar: &Path) -> AppResult<()> {
    let remote = format!("/data/local/tmp/easyadb-{package}.tar");
    device.adb(&["push", &tar.display().to_string(), &remote])?;
    let data = format!("/data/data/{package}");
    let script = format!(
        "am force-stop {package}; tar -xf {remote} -C /data/data && \
         chown -R $(stat -c %u:%g {data}) {data} && restorecon -R {data}; \
         status=$?; rm -f {remote}; exit $status"
    );
    device.su(&script).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adb::fake::FakeAdb;
    use crate::features::backup::manifest::PermissionGrant;

    #[test]
    fn installs_single_and_split_apks() {
        let fake = FakeAdb::new().on("install", "Performing Streamed Install\nSuccess\n");
        let a = PathBuf::from("C:/b/base.apk");
        let b = PathBuf::from("C:/b/split.apk");
        install(Device::new(&fake, "X"), &[&a]).unwrap();
        install(Device::new(&fake, "X"), &[&a, &b]).unwrap();
        let calls = fake.calls();
        assert_eq!(calls[0], "-s X install -r C:/b/base.apk");
        assert_eq!(
            calls[1],
            "-s X install-multiple -r C:/b/base.apk C:/b/split.apk"
        );
    }

    #[test]
    fn reports_install_failure() {
        let fake = FakeAdb::new().on("install", "Failure [INSTALL_FAILED_VERSION_DOWNGRADE]\n");
        let a = PathBuf::from("base.apk");
        let err = install(Device::new(&fake, "X"), &[&a]).unwrap_err();
        assert_eq!(err.code, ErrorCode::InstallFailed);
        assert!(err.detail.contains("DOWNGRADE"));
    }

    #[test]
    fn grants_only_valid_granted_permissions() {
        let fake = FakeAdb::new()
            .on("grant com.a android.permission.CAMERA", "")
            .on_fail("grant com.a android.permission.GONE", "Unknown permission");
        let mut manifest = manifest::sample("com.a");
        manifest.permissions = ["CAMERA", "GONE", "MIC"]
            .iter()
            .map(|n| PermissionGrant {
                name: format!("android.permission.{n}"),
                granted: *n != "MIC",
            })
            .chain([PermissionGrant {
                name: "bad name; reboot".into(),
                granted: true,
            }])
            .collect();
        let (granted, wanted) = grant_permissions(Device::new(&fake, "X"), &manifest);
        assert_eq!((granted, wanted), (1, 2));
        assert_eq!(
            fake.calls()[0],
            "-s X shell pm grant com.a android.permission.CAMERA"
        );
    }
}
