//! Restores one backup folder onto a device.
//!
//! The app is always installed. Permissions and data are optional extras: a failure
//! there never undoes the install, it is reported back instead.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use super::manifest::{self, BackupFile, ExtraFile, ExtraKind, FileKind, Manifest};
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
    /// App data: the private archive and the extra archives written by EasyAndroid.
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

/// Where an app data archive is extracted on the device.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Layer {
    /// `/data/data`
    Private,
    /// `/data/user_de/0`
    DeviceProtected,
    /// `/data/media/0/Android/data`
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

    fn tag(self) -> &'static str {
        match self {
            Layer::Private => "data",
            Layer::DeviceProtected => "data_de",
            Layer::External => "data_ext",
        }
    }
}

/// A file listed in the manifest, whichever list it came from.
struct Item<'a> {
    stored: &'a str,
    size: u64,
    sha256: &'a str,
}

impl<'a> From<&'a BackupFile> for Item<'a> {
    fn from(f: &'a BackupFile) -> Self {
        Item {
            stored: &f.stored,
            size: f.size,
            sha256: &f.sha256,
        }
    }
}

impl<'a> From<&'a ExtraFile> for Item<'a> {
    fn from(f: &'a ExtraFile) -> Self {
        Item {
            stored: &f.stored,
            size: f.size,
            sha256: &f.sha256,
        }
    }
}

/// Removes a temporary file when it goes out of scope.
struct TempFile(PathBuf);

impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
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
    let files: Vec<&BackupFile> = manifest
        .files
        .iter()
        .filter(|f| match f.kind {
            FileKind::Apk => true,
            FileKind::Obb => options.restore_obb,
            FileKind::Data => options.restore_data,
        })
        .collect();
    let extras: Vec<&ExtraFile> = if options.restore_data {
        manifest.extras.iter().collect()
    } else {
        Vec::new()
    };
    let items: Vec<Item> = files
        .iter()
        .map(|f| Item::from(*f))
        .chain(extras.iter().map(|f| Item::from(*f)))
        .collect();
    let local = verify(&manifest, &items, dir, options.verify_hash, task, reporter)?;
    let (file_paths, extra_paths) = local.split_at(files.len());
    let path_of = |kind: FileKind| -> Vec<&PathBuf> {
        files
            .iter()
            .zip(file_paths)
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
        for (file, path) in files
            .iter()
            .zip(file_paths)
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

    let mut archives: Vec<(Layer, &str, &Path)> = Vec::new();
    if let Some((file, path)) = files
        .iter()
        .zip(file_paths)
        .find(|(f, _)| f.kind == FileKind::Data)
    {
        archives.push((Layer::Private, &file.stored, path));
    }
    for (extra, path) in extras.iter().zip(extra_paths) {
        let layer = match extra.kind {
            ExtraKind::DeviceData => Layer::DeviceProtected,
            ExtraKind::ExternalData => Layer::External,
        };
        archives.push((layer, &extra.stored, path));
    }

    let (data, detail) = if archives.is_empty() {
        (DataStatus::NotRequested, None)
    } else {
        task.check()?;
        reporter.progress("data", &manifest.package, 0.0, 1.0);
        if !device::check_root(device) {
            (DataStatus::NoRoot, None)
        } else {
            let sdk = device_sdk(device);
            let mut failed = Vec::new();
            for (layer, stored, path) in &archives {
                task.check()?;
                if let Err(err) =
                    restore_archive(device, &manifest.package, *layer, stored, path, sdk, task)
                {
                    if err.code == ErrorCode::Cancelled {
                        return Err(err);
                    }
                    failed.push(format!("{stored}: {}", err.detail));
                }
            }
            if failed.is_empty() {
                (DataStatus::Restored, None)
            } else {
                (DataStatus::Failed, Some(failed.join("; ")))
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
    items: &[Item],
    dir: &Path,
    verify_hash: bool,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<Vec<PathBuf>> {
    let total: f64 = items.iter().map(|f| f.size as f64).sum();
    let mut done = 0.0;
    let mut paths = Vec::new();
    for item in items {
        let stored = dir.join(manifest::safe_relative(item.stored)?);
        if !stored.is_file() {
            return Err(AppError::new(
                ErrorCode::IntegrityFailed,
                item.stored.to_string(),
            ));
        }
        let sha = verify_hash.then_some(item.sha256);
        let mut on_bytes = |n: u64| {
            done += n as f64;
            reporter.progress("verify", &manifest.package, done, total);
        };
        transfer::verify_in_place(&stored, item.size, sha, task, &mut on_bytes)?;
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

fn device_sdk(device: Device) -> u32 {
    device
        .shell(&["getprop", "ro.build.version.sdk"])
        .ok()
        .and_then(|out| out.trim().parse().ok())
        .unwrap_or(0)
}

/// Pushes one archive to the device and extracts it as root. Zstd archives are
/// decompressed here first, so the device needs no `zstd` program.
fn restore_archive(
    device: Device,
    package: &str,
    layer: Layer,
    stored: &str,
    local: &Path,
    sdk: u32,
    task: &TaskHandle,
) -> AppResult<()> {
    let name = format!("easyadb-{package}-{}", layer.tag());
    let (tar, _temp) = if stored.ends_with(".zst") {
        let temp = std::env::temp_dir().join(format!("{name}.tar"));
        transfer::decompress_zstd(local, &temp, task)?;
        (temp.clone(), Some(TempFile(temp)))
    } else {
        (local.to_path_buf(), None)
    };
    task.check()?;
    let remote = format!("/data/local/tmp/{name}.tar");
    device.adb(&["push", &tar.display().to_string(), &remote])?;
    device.su(&data_script(package, layer, &remote, sdk))?;
    Ok(())
}

/// The root script that replaces an app's data folder with an archive.
///
/// The owner, mode and SELinux label are read before extracting: the folder was made by
/// the installer for the app's current uid, which can differ from the uid in the archive.
fn data_script(package: &str, layer: Layer, remote: &str, sdk: u32) -> String {
    let parent = layer.parent();
    let target = format!("{parent}/{package}");
    let remote = shell::quote(remote);
    let prepare = match layer {
        Layer::External => format!("mkdir -p {target}"),
        _ => format!(
            "info=$(stat -c '%u:%g %a' {target}) && owner=${{info% *}} && mode=${{info#* }} && \
             label=$(ls -dZ {target} | cut -d' ' -f1)"
        ),
    };
    let finish = match layer {
        Layer::External => {
            // Since Android 11 the app owns its folder there; before that media_rw does.
            let owner = if sdk >= 30 {
                format!("$(stat -c %u /data/data/{package}):ext_data_rw")
            } else {
                "media_rw:media_rw".to_string()
            };
            format!("chown -hR {owner} {target} && restorecon -RF {target}")
        }
        _ => format!(
            "chown -hR $owner {target} && chmod $mode {target} && \
             case \"$label\" in u:object_r:*) chcon -hR \"$label\" {target};; \
             *) restorecon -RF {target};; esac"
        ),
    };
    let steps = [
        prepare,
        format!("am force-stop {package}"),
        format!("find {target} -mindepth 1 -maxdepth 1 ! -name lib -exec rm -rf {{}} +"),
        format!("tar -xf {remote} -C {parent}"),
        finish,
    ];
    format!(
        "({}); status=$?; rm -f {remote}; exit $status",
        steps.join(" && ")
    )
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

    #[test]
    fn reads_owner_before_extracting() {
        let script = data_script("com.a", Layer::Private, "/data/local/tmp/x.tar", 34);
        let stat = script.find("stat -c '%u:%g %a'").unwrap();
        let tar = script.find("tar -xf").unwrap();
        assert!(stat < tar, "{script}");
        assert!(script.contains("-C /data/data &&"));
        assert!(script.contains("chcon") && script.contains("restorecon"));
        assert!(script.ends_with("exit $status"));

        let de = data_script("com.a", Layer::DeviceProtected, "/data/local/tmp/x.tar", 34);
        assert!(de.contains("/data/user_de/0/com.a"));
    }

    #[test]
    fn external_data_belongs_to_the_app_on_new_android() {
        let new = data_script("com.a", Layer::External, "/data/local/tmp/x.tar", 34);
        assert!(new.contains("$(stat -c %u /data/data/com.a):ext_data_rw"));
        assert!(new.contains("mkdir -p /data/media/0/Android/data/com.a"));
        let old = data_script("com.a", Layer::External, "/data/local/tmp/x.tar", 29);
        assert!(old.contains("media_rw:media_rw"));
    }

    fn backup_with(dir: &Path, extras: Vec<ExtraFile>) {
        std::fs::create_dir_all(dir.join("apk")).unwrap();
        std::fs::write(dir.join("apk/base.apk"), b"abc").unwrap();
        let zst = ruzstd::encoding::compress_to_vec(
            &b"tar bytes"[..],
            ruzstd::encoding::CompressionLevel::Fastest,
        );
        std::fs::write(dir.join("data.tar.zst"), &zst).unwrap();
        let mut manifest = manifest::sample("com.a");
        manifest.format_version = 2;
        manifest.files.push(BackupFile {
            kind: FileKind::Data,
            stored: "data.tar.zst".into(),
            name: "data.tar.zst".into(),
            size: zst.len() as u64,
            sha256: String::new(),
        });
        manifest.extras = extras;
        manifest::write(dir, &manifest).unwrap();
    }

    fn options(data: bool) -> RestoreOptions {
        RestoreOptions {
            restore_obb: true,
            restore_data: data,
            restore_permissions: false,
            verify_hash: false,
        }
    }

    fn rooted_fake() -> FakeAdb {
        FakeAdb::new()
            .on("install", "Success\n")
            .on("su -c id", "uid=0(root)\n")
            .on("getprop", "34\n")
            .on("push", "")
            .on("su -c", "")
    }

    #[test]
    fn restores_zstd_data_and_extras_with_root() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("com.a_1");
        let zst = ruzstd::encoding::compress_to_vec(
            &b"de"[..],
            ruzstd::encoding::CompressionLevel::Fastest,
        );
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("data_de.tar.zst"), &zst).unwrap();
        backup_with(
            &dir,
            vec![ExtraFile {
                kind: ExtraKind::DeviceData,
                stored: "data_de.tar.zst".into(),
                size: zst.len() as u64,
                sha256: String::new(),
            }],
        );
        let fake = rooted_fake();
        let report = restore(
            Device::new(&fake, "X"),
            &dir,
            &options(true),
            &TaskHandle::default(),
            &Reporter::silent(),
        )
        .unwrap();
        assert_eq!(report.data, DataStatus::Restored);
        let calls = fake.calls().join("\n");
        assert!(calls.contains("push") && calls.contains("easyadb-com.a-data.tar"));
        assert!(calls.contains("easyadb-com.a-data_de.tar"));
        assert!(calls.contains("/data/user_de/0/com.a"));
    }

    #[test]
    fn skips_data_without_root_but_installs_the_app() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("com.a_1");
        backup_with(&dir, vec![]);
        let fake = FakeAdb::new()
            .on("install", "Success\n")
            .on_fail("su -c", "su: not found");
        let report = restore(
            Device::new(&fake, "X"),
            &dir,
            &options(true),
            &TaskHandle::default(),
            &Reporter::silent(),
        )
        .unwrap();
        assert_eq!(report.data, DataStatus::NoRoot);
        assert!(fake.calls()[0].contains("install"));
    }

    #[test]
    fn ignores_data_when_not_requested() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("com.a_1");
        backup_with(&dir, vec![]);
        let fake = FakeAdb::new().on("install", "Success\n");
        let report = restore(
            Device::new(&fake, "X"),
            &dir,
            &options(false),
            &TaskHandle::default(),
            &Reporter::silent(),
        )
        .unwrap();
        assert_eq!(report.data, DataStatus::NotRequested);
        assert_eq!(fake.calls().len(), 1);
    }
}
