//! Restores one backup folder onto a device.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use specta::Type;

use super::crypto::{self, Key};
use super::manifest::{self, BackupFile, FileKind, Manifest};
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
    pub password: Option<String>,
    pub verify_hash: bool,
}

/// Deletes the temporary folder when dropped.
struct TempDir(PathBuf);

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn temp_dir(package: &str) -> AppResult<TempDir> {
    let mut suffix = [0u8; 4];
    getrandom::fill(&mut suffix).map_err(|e| AppError::new(ErrorCode::Internal, e.to_string()))?;
    let dir = std::env::temp_dir().join(format!(
        "easyadb-restore-{package}-{}",
        crypto::to_hex(&suffix)
    ));
    fs::create_dir_all(&dir)?;
    Ok(TempDir(dir))
}

pub fn restore(
    device: Device,
    dir: &Path,
    options: &RestoreOptions,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<()> {
    let manifest = manifest::read(dir)?;
    shell::validate_package(&manifest.package)?;
    let key = match &manifest.encryption {
        Some(info) => {
            let password = options.password.as_deref().unwrap_or_default();
            Some(crypto::open_key(password, info)?)
        }
        None => None,
    };
    let wants = |f: &&BackupFile| match f.kind {
        FileKind::Apk => true,
        FileKind::Obb => options.restore_obb,
        FileKind::Data => options.restore_data,
    };
    let selected: Vec<&BackupFile> = manifest.files.iter().filter(wants).collect();
    if selected.iter().any(|f| f.kind == FileKind::Data) && !device::check_root(device) {
        return Err(AppError::new(ErrorCode::RootRequired, manifest.package));
    }

    let temp = temp_dir(&manifest.package)?;
    let local = prepare(
        &manifest,
        &selected,
        dir,
        &temp.0,
        key.as_ref(),
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

    if let Some(tar) = path_of(FileKind::Data).first() {
        reporter.progress("data", &manifest.package, 0.0, 1.0);
        restore_data(device, &manifest.package, tar)?;
    }
    Ok(())
}

/// Returns a plaintext local path for each selected file, decrypting or verifying as needed.
#[allow(clippy::too_many_arguments)]
fn prepare(
    manifest: &Manifest,
    files: &[&BackupFile],
    dir: &Path,
    temp: &Path,
    key: Option<&Key>,
    verify_hash: bool,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<Vec<PathBuf>> {
    let total: f64 = files.iter().map(|f| f.size as f64).sum();
    let mut done = 0.0;
    let mut local = Vec::new();
    for (index, file) in files.iter().enumerate() {
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
        if key.is_some() {
            let dest = temp.join(format!("{index}-{}", file.name));
            transfer::unpack(&stored, &dest, key, file.size, sha, task, &mut on_bytes)?;
            local.push(dest);
        } else {
            transfer::verify_in_place(&stored, file.size, sha, task, &mut on_bytes)?;
            local.push(stored);
        }
    }
    Ok(local)
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
}
