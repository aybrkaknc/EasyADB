//! Debloater: UAD-NG based package knowledge, batch actions and profiles.

use std::collections::HashMap;
use std::sync::LazyLock;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};

use crate::adb::{Device, shell};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::features::packages::{self, AppInfo};
use crate::state::{AppState, blocking};
use crate::tasks::Reporter;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
pub enum Removal {
    Recommended,
    Advanced,
    Expert,
    Unsafe,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DebloatInfo {
    pub list: String,
    pub description: String,
    pub removal: Removal,
    pub dependencies: Vec<String>,
    pub needed_by: Vec<String>,
}

static DB: LazyLock<HashMap<String, DebloatInfo>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../assets/debloat_db.json")).unwrap_or_default()
});

/// Packages that are never disabled or removed, whatever the list says.
const ALWAYS_PROTECTED: &[&str] = &[
    "com.android.systemui",
    "com.android.settings",
    "com.android.shell",
];

/// The same rule as EasyAndroid (`docs/specs/EASYANDROID_INTEROP.md`): the system packages
/// above and everything the UAD-NG list marks Unsafe.
pub fn is_protected(package: &str) -> bool {
    ALWAYS_PROTECTED.contains(&package)
        || DB
            .get(package)
            .is_some_and(|info| info.removal == Removal::Unsafe)
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DebloatApp {
    pub app: AppInfo,
    pub info: Option<DebloatInfo>,
    /// Disabling and removing are refused for this package.
    pub protected: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DebloatAction {
    Disable,
    Enable,
    Uninstall,
    Restore,
}

fn pm_ok(out: String) -> AppResult<()> {
    let lower = out.to_lowercase();
    if lower.contains("failure") || lower.contains("exception") || lower.contains("error:") {
        Err(AppError::new(ErrorCode::AdbFailed, out.trim()))
    } else {
        Ok(())
    }
}

pub fn apply(device: Device, package: &str, action: DebloatAction) -> AppResult<()> {
    shell::validate_package(package)?;
    let removes = matches!(action, DebloatAction::Disable | DebloatAction::Uninstall);
    if removes && is_protected(package) {
        return Err(AppError::new(ErrorCode::Protected, package));
    }
    match action {
        DebloatAction::Disable => {
            pm_ok(device.shell(&["pm", "disable-user", "--user", "0", package])?)
        }
        DebloatAction::Enable => pm_ok(device.shell(&["pm", "enable", "--user", "0", package])?),
        DebloatAction::Uninstall => {
            pm_ok(device.shell(&["pm", "uninstall", "-k", "--user", "0", package])?)
        }
        DebloatAction::Restore => device
            .shell(&["cmd", "package", "install-existing", "--user", "0", package])
            .and_then(pm_ok)
            .or_else(|_| {
                pm_ok(device.shell(&["pm", "install-existing", "--user", "0", package])?)
            }),
    }
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ActionOutcome {
    pub package: String,
    pub error: Option<AppError>,
}

pub const PROFILE_FORMAT: &str = "easyadb-debloat-profile";

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProfileEntry {
    pub package: String,
    pub action: DebloatAction,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DebloatProfile {
    pub format: String,
    pub version: u32,
    pub name: String,
    pub created_at: String,
    pub entries: Vec<ProfileEntry>,
}

pub fn parse_profile(text: &str) -> AppResult<DebloatProfile> {
    let profile: DebloatProfile =
        serde_json::from_str(text).map_err(|e| AppError::new(ErrorCode::Parse, e.to_string()))?;
    if profile.format != PROFILE_FORMAT || profile.version != 1 {
        return Err(AppError::new(
            ErrorCode::Parse,
            "not an EasyADB debloat profile",
        ));
    }
    for entry in &profile.entries {
        shell::validate_package(&entry.package)?;
    }
    Ok(profile)
}

#[tauri::command]
#[specta::specta]
pub async fn list_debloat_apps(
    state: State<'_, AppState>,
    serial: String,
) -> AppResult<Vec<DebloatApp>> {
    let runner = state.runner()?;
    blocking(move || {
        let apps = packages::list_apps(Device::new(&*runner, &serial))?;
        Ok(apps
            .into_iter()
            .map(|app| DebloatApp {
                info: DB.get(&app.package).cloned(),
                protected: is_protected(&app.package),
                app,
            })
            .collect())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn apply_debloat(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    serial: String,
    entries: Vec<ProfileEntry>,
) -> AppResult<Vec<ActionOutcome>> {
    let runner = state.runner()?;
    let task = state.tasks.start(&task_id);
    let reporter = Reporter::new(app, &task_id);
    let result = blocking(move || {
        let device = Device::new(&*runner, &serial);
        let total = entries.len() as f64;
        let mut outcomes = Vec::new();
        for (index, entry) in entries.into_iter().enumerate() {
            if task.is_cancelled() {
                break;
            }
            reporter.progress("debloat", &entry.package, index as f64, total);
            let error = apply(device, &entry.package, entry.action).err();
            outcomes.push(ActionOutcome {
                package: entry.package,
                error,
            });
        }
        let result = if task.is_cancelled() {
            Err(AppError::cancelled())
        } else {
            Ok(outcomes)
        };
        reporter.finish(&result);
        result
    })
    .await;
    state.tasks.finish(&task_id);
    result
}

#[tauri::command]
#[specta::specta]
pub async fn save_debloat_profile(
    path: String,
    name: String,
    entries: Vec<ProfileEntry>,
) -> AppResult<()> {
    blocking(move || {
        let profile = DebloatProfile {
            format: PROFILE_FORMAT.into(),
            version: 1,
            name,
            created_at: chrono::Local::now().to_rfc3339(),
            entries,
        };
        std::fs::write(path, serde_json::to_vec_pretty(&profile)?)?;
        Ok(())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn load_debloat_profile(path: String) -> AppResult<DebloatProfile> {
    blocking(move || parse_profile(&std::fs::read_to_string(path)?)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adb::fake::FakeAdb;

    #[test]
    fn loads_uad_database() {
        assert!(DB.len() > 5000);
        assert!(DB.values().any(|i| i.removal == Removal::Unsafe));
    }

    #[test]
    fn runs_pm_commands() {
        let fake = FakeAdb::new()
            .on("disable-user", "Package com.a new state: disabled-user\n")
            .on("uninstall", "Success\n")
            .on(
                "cmd package install-existing",
                "Failure [not installed for 0]\n",
            )
            .on(
                "pm install-existing",
                "Package com.a installed for user: 0\n",
            );
        let device = Device::new(&fake, "X");
        apply(device, "com.a", DebloatAction::Disable).unwrap();
        apply(device, "com.a", DebloatAction::Uninstall).unwrap();
        apply(device, "com.a", DebloatAction::Restore).unwrap();
        assert_eq!(fake.calls()[1], "-s X shell pm uninstall -k --user 0 com.a");
        assert_eq!(fake.calls().len(), 4);
    }

    #[test]
    fn refuses_to_remove_protected_packages() {
        let fake = FakeAdb::new();
        let device = Device::new(&fake, "X");
        let unsafe_package = DB
            .iter()
            .find(|(_, info)| info.removal == Removal::Unsafe)
            .map(|(package, _)| package.as_str())
            .unwrap();
        for package in ALWAYS_PROTECTED.iter().copied().chain([unsafe_package]) {
            assert!(is_protected(package), "{package}");
            for action in [DebloatAction::Disable, DebloatAction::Uninstall] {
                let err = apply(device, package, action).unwrap_err();
                assert_eq!(err.code, ErrorCode::Protected, "{package}");
            }
        }
        assert!(fake.calls().is_empty());
        assert!(!is_protected("com.example.unknown"));

        let allowed = FakeAdb::new().on("enable", "Package x new state: enabled\n");
        apply(
            Device::new(&allowed, "X"),
            "com.android.systemui",
            DebloatAction::Enable,
        )
        .unwrap();
    }

    #[test]
    fn reports_pm_failures() {
        let fake = FakeAdb::new().on("uninstall", "Failure [DELETE_FAILED_INTERNAL_ERROR]\n");
        let err = apply(Device::new(&fake, "X"), "com.a", DebloatAction::Uninstall).unwrap_err();
        assert!(err.detail.contains("DELETE_FAILED"));
    }

    #[test]
    fn validates_profiles() {
        let good = r#"{"format":"easyadb-debloat-profile","version":1,"name":"x","createdAt":"","entries":[{"package":"com.a","action":"disable"}]}"#;
        assert_eq!(parse_profile(good).unwrap().entries.len(), 1);
        let bad = good.replace("com.a", "com.a; reboot");
        assert!(parse_profile(&bad).is_err());
        assert!(
            parse_profile(
                r#"{"format":"other","version":1,"name":"","createdAt":"","entries":[]}"#
            )
            .is_err()
        );
    }
}
