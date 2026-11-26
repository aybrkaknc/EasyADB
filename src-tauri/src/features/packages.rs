//! Installed app listing shared by backup and debloat.

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use serde::Serialize;
use specta::Type;
use tauri::State;

use crate::adb::parse::parse_packages;
use crate::adb::{Device, shell};
use crate::error::AppResult;
use crate::state::{AppState, blocking};

static LABELS: LazyLock<HashMap<String, String>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../assets/package_labels.json")).unwrap_or_default()
});

pub fn label_for(package: &str) -> Option<String> {
    LABELS.get(package).cloned()
}

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub package: String,
    pub label: Option<String>,
    pub system: bool,
    pub disabled: bool,
    /// `false` when removed for the current user but still present on the system image.
    pub installed: bool,
}

fn package_set(device: Device, flags: &[&str]) -> AppResult<HashSet<String>> {
    let mut args = vec!["pm", "list", "packages"];
    args.extend_from_slice(flags);
    Ok(parse_packages(&device.shell(&args)?).into_iter().collect())
}

/// A package of the system image. Stopping one makes Android start it again at once.
pub fn is_system(device: Device, package: &str) -> bool {
    package_set(device, &["-s", "-u"]).is_ok_and(|system| system.contains(package))
}

pub fn list_apps(device: Device) -> AppResult<Vec<AppInfo>> {
    let installed = package_set(device, &[])?;
    let all = package_set(device, &["-u"]).unwrap_or_else(|_| installed.clone());
    let system = package_set(device, &["-s", "-u"]).unwrap_or_default();
    let disabled = package_set(device, &["-d"]).unwrap_or_default();

    let mut apps: Vec<AppInfo> = all
        .into_iter()
        .map(|package| AppInfo {
            label: label_for(&package),
            system: system.contains(&package),
            disabled: disabled.contains(&package),
            installed: installed.contains(&package),
            package,
        })
        .collect();
    apps.sort_by(|a, b| a.package.cmp(&b.package));
    Ok(apps)
}

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppSize {
    pub package: String,
    pub apk_bytes: f64,
    pub obb_bytes: f64,
}

/// One adb round trip per chunk: sums APK sizes from `pm path` and the OBB folder size.
pub fn app_sizes(device: Device, packages: &[String]) -> AppResult<Vec<AppSize>> {
    for package in packages {
        shell::validate_package(package)?;
    }
    let mut sizes = Vec::new();
    for chunk in packages.chunks(80) {
        let list = chunk.join(" ");
        let script = format!(
            "for p in {list}; do a=0; for f in $(pm path \"$p\" | sed 's/^package://'); do \
             s=$(stat -c %s \"$f\" 2>/dev/null); a=$((a+${{s:-0}})); done; \
             o=$(du -sk \"/sdcard/Android/obb/$p\" 2>/dev/null | cut -f1); echo \"$p $a ${{o:-0}}\"; done"
        );
        sizes.extend(parse_sizes(&device.script(&script)?));
    }
    Ok(sizes)
}

fn parse_sizes(output: &str) -> Vec<AppSize> {
    output
        .lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let package = parts.next()?.to_string();
            let apk: f64 = parts.next()?.parse().ok()?;
            let obb_kb: f64 = parts.next()?.parse().ok()?;
            Some(AppSize {
                package,
                apk_bytes: apk,
                obb_bytes: obb_kb * 1024.0,
            })
        })
        .collect()
}

#[tauri::command]
#[specta::specta]
pub async fn list_device_apps(
    state: State<'_, AppState>,
    serial: String,
) -> AppResult<Vec<AppInfo>> {
    let runner = state.runner()?;
    blocking(move || list_apps(Device::new(&*runner, &serial))).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_app_sizes(
    state: State<'_, AppState>,
    serial: String,
    packages: Vec<String>,
) -> AppResult<Vec<AppSize>> {
    let runner = state.runner()?;
    blocking(move || app_sizes(Device::new(&*runner, &serial), &packages)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adb::fake::FakeAdb;

    #[test]
    fn merges_package_flags() {
        let fake = FakeAdb::new()
            .on(
                "pm list packages -u",
                "package:com.a\npackage:com.android.sys\npackage:com.gone\n",
            )
            .on(
                "pm list packages -s -u",
                "package:com.android.sys\npackage:com.gone\n",
            )
            .on("pm list packages -d", "package:com.android.sys\n")
            .on(
                "pm list packages",
                "package:com.a\npackage:com.android.sys\n",
            );
        let apps = list_apps(Device::new(&fake, "X")).unwrap();
        assert_eq!(apps.len(), 3);
        let gone = apps.iter().find(|a| a.package == "com.gone").unwrap();
        assert!(gone.system && !gone.installed);
        let sys = apps
            .iter()
            .find(|a| a.package == "com.android.sys")
            .unwrap();
        assert!(sys.disabled && sys.installed);
    }

    #[test]
    fn parses_size_lines() {
        let sizes = parse_sizes("com.a 1048576 2048\ncom.b 10 0\nbroken\n");
        assert_eq!(sizes.len(), 2);
        assert_eq!(sizes[0].obb_bytes, 2048.0 * 1024.0);
    }

    #[test]
    fn rejects_bad_package_names() {
        let fake = FakeAdb::new();
        let err = app_sizes(Device::new(&fake, "X"), &["com.a; reboot".into()]).unwrap_err();
        assert_eq!(err.code, crate::error::ErrorCode::InvalidInput);
        assert!(fake.calls().is_empty());
    }

    #[test]
    fn loads_bundled_labels() {
        assert_eq!(
            label_for("com.android.vending").as_deref(),
            Some("Google Play Store")
        );
    }
}
