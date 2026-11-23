//! System snapshots made by EasyAndroid (`system_<date>-<time>.json`): common settings,
//! default apps and Wi-Fi networks, the things a new ROM loses besides apps.
//!
//! EasyADB only restores them. The blocked key list and the common key list are the same as
//! EasyAndroid's (`docs/specs/EASYANDROID_INTEROP.md`), so both apps touch the same settings.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};

use crate::adb::{Device, shell};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::features::backup::manifest::DeviceSnapshot;
use crate::features::settings::backup_root;
use crate::state::{AppState, blocking};
use crate::tasks::{Reporter, TaskHandle};

pub const FORMAT: &str = "easyandroid-system";
const NAMESPACES: &[&str] = &["system", "secure", "global"];
const ROLES: &[&str] = &[
    "BROWSER",
    "DIALER",
    "SMS",
    "HOME",
    "ASSISTANT",
    "CALL_SCREENING",
    "CALL_REDIRECTION",
];
const WIFI_SECURITY: &[&str] = &["open", "owe", "wpa2", "wpa3"];

/// Identity, provisioning, security and state of one installation; never copied to another.
const BLOCKED: &[&str] = &[
    "android_id",
    "bluetooth_",
    "provisioned",
    "setup_complete",
    "setup_",
    "adb_",
    "development_settings",
    "boot_count",
    "advertising_id",
    "token",
    "password",
    "lock_pattern",
    "lockscreen.",
    "lock_screen_",
    "package_verifier",
    "verifier_",
    "install_non_market",
    "http_proxy",
    "cert",
    "gservices",
    "last_",
    "_version",
    "timestamp",
    "_time_",
    "sim_",
    "subscription",
    "multi_sim",
    "preferred_network_mode",
    "mobile_data",
    "device_policy",
    "user_switcher",
    "trust_agent",
    "enabled_accessibility_services",
    "accessibility_enabled",
    "enabled_notification_listeners",
    "mock_location",
    "credential_service",
    "autofill_service_search",
    "secure_frp",
    "backup_",
    "wifi_on",
    "airplane_mode_on",
    "zen_",
    "database_",
    "config_",
    "factory_reset",
];

/// Plain Android preferences that mean the same on every ROM. Only these are applied.
const COMMON: &[&str] = &[
    "screen_brightness_mode",
    "screen_off_timeout",
    "font_scale",
    "accelerometer_rotation",
    "haptic_feedback_enabled",
    "sound_effects_enabled",
    "dtmf_tone",
    "lockscreen_sounds_enabled",
    "vibrate_when_ringing",
    "time_12_24",
    "status_bar_show_battery_percent",
    "pointer_speed",
    "notification_light_pulse",
    "ui_night_mode",
    "doze_enabled",
    "doze_always_on",
    "wake_gesture_enabled",
    "double_tap_to_wake",
    "camera_double_tap_power_gesture_disabled",
    "long_press_timeout",
    "show_ime_with_hard_keyboard",
    "spell_checker_enabled",
    "night_display_auto_mode",
    "night_display_color_temperature",
    "sysui_qs_tiles",
    "icon_blacklist",
    "window_animation_scale",
    "transition_animation_scale",
    "animator_duration_scale",
    "low_power_trigger_level",
    "heads_up_notifications_enabled",
    "private_dns_mode",
    "private_dns_specifier",
    "device_name",
    "charging_sounds_enabled",
    "charging_vibration_enabled",
    "lock_to_app_enabled",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WifiNetwork {
    pub ssid: String,
    pub security: String,
    #[serde(default)]
    pub password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub format: String,
    pub version: u32,
    pub created_at: String,
    #[serde(default)]
    pub device: DeviceSnapshot,
    #[serde(default)]
    pub settings: BTreeMap<String, BTreeMap<String, String>>,
    #[serde(default)]
    pub roles: BTreeMap<String, Vec<String>>,
    #[serde(default)]
    pub wifi: Vec<WifiNetwork>,
}

pub fn parse(text: &str) -> AppResult<SystemSnapshot> {
    let snapshot: SystemSnapshot = serde_json::from_str(text)
        .map_err(|e| AppError::new(ErrorCode::BackupInvalid, e.to_string()))?;
    if snapshot.format != FORMAT || snapshot.version != 1 {
        return Err(AppError::new(ErrorCode::BackupInvalid, snapshot.format));
    }
    Ok(snapshot)
}

/// Permission, app op, role and setting names.
fn is_token(name: &str) -> bool {
    (1..=199).contains(&name.len())
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_')
}

fn is_restorable(key: &str) -> bool {
    let lower = key.to_lowercase();
    is_token(key) && !BLOCKED.iter().any(|b| lower.contains(b))
}

/// The settings that are applied: plain preferences that are not blocked.
fn is_applied(key: &str) -> bool {
    COMMON.contains(&key) && is_restorable(key)
}

/// Reads `settings list`. Values that span several lines cannot be told apart safely and are dropped.
fn parse_settings(out: &str) -> BTreeMap<String, String> {
    let mut found = BTreeMap::new();
    let mut last: Option<String> = None;
    for line in out.lines() {
        let entry = line.split_once('=').filter(|(key, _)| {
            !key.is_empty()
                && key
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "_.:-/".contains(c))
        });
        match entry {
            None => {
                if !line.is_empty() {
                    if let Some(key) = &last {
                        found.remove(key);
                    }
                }
            }
            Some((key, value)) => {
                last = Some(key.to_string());
                if value != "null" {
                    found.insert(key.to_string(), value.to_string());
                }
            }
        }
    }
    found
}

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SystemSummary {
    /// File name inside the backup folder.
    pub id: String,
    pub created_at: String,
    pub device_model: String,
    pub settings_count: u32,
    pub roles_count: u32,
    pub wifi_count: u32,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SystemOptions {
    pub settings: bool,
    pub roles: bool,
    pub wifi: bool,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SystemFailure {
    pub item: String,
    pub error: AppError,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SystemReport {
    pub applied: u32,
    pub failed: Vec<SystemFailure>,
}

/// Whether `id` is a plain snapshot file name such as `system_20260101-100000.json`.
pub fn is_file_name(id: &str) -> bool {
    id.starts_with("system_")
        && id.ends_with(".json")
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
}

/// Snapshots in the backup folder, newest first.
pub fn list(root: &Path) -> Vec<SystemSummary> {
    let Ok(entries) = std::fs::read_dir(root) else {
        return Vec::new();
    };
    let mut found: Vec<SystemSummary> = entries
        .flatten()
        .filter_map(|entry| {
            let id = entry.file_name().to_string_lossy().into_owned();
            if !is_file_name(&id) {
                return None;
            }
            let snapshot = parse(&std::fs::read_to_string(entry.path()).ok()?).ok()?;
            Some(SystemSummary {
                id,
                created_at: snapshot.created_at,
                device_model: snapshot.device.model,
                settings_count: snapshot
                    .settings
                    .values()
                    .flat_map(|ns| ns.keys())
                    .filter(|key| is_applied(key))
                    .count() as u32,
                roles_count: snapshot.roles.values().map(|p| p.len() as u32).sum(),
                wifi_count: snapshot.wifi.len() as u32,
            })
        })
        .collect();
    found.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    found
}

fn done(report: &mut SystemReport, item: String, result: AppResult<String>) {
    match result {
        Ok(_) => report.applied += 1,
        Err(error) => report.failed.push(SystemFailure { item, error }),
    }
}

/// A `settings`, `cmd role` or `cmd wifi` command succeeded when it exits cleanly and says no failure.
fn cmd_ok(out: String) -> AppResult<String> {
    let lower = out.to_lowercase();
    if ["exception", "error:", "unknown command", "failed"]
        .iter()
        .any(|bad| lower.contains(bad))
    {
        Err(AppError::new(ErrorCode::AdbFailed, out.trim()))
    } else {
        Ok(out)
    }
}

pub fn restore(
    device: Device,
    snapshot: &SystemSnapshot,
    options: &SystemOptions,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<SystemReport> {
    let mut report = SystemReport {
        applied: 0,
        failed: Vec::new(),
    };
    if options.settings {
        for namespace in NAMESPACES {
            let Some(wanted) = snapshot.settings.get(*namespace) else {
                continue;
            };
            let current = device
                .shell(&["settings", "list", "--user", "0", namespace])
                .map(|out| parse_settings(&out))
                .unwrap_or_default();
            for (key, value) in wanted {
                task.check()?;
                if !is_applied(key) || current.get(key) == Some(value) {
                    continue;
                }
                reporter.progress("system", key, 0.0, 0.0);
                let result = device
                    .shell(&["settings", "put", "--user", "0", namespace, key, value])
                    .and_then(cmd_ok);
                done(&mut report, format!("{namespace}/{key}"), result);
            }
        }
    }
    if options.roles {
        for (role, packages) in &snapshot.roles {
            let name = role.strip_prefix("android.app.role.").unwrap_or(role);
            if !ROLES.contains(&name) || role != &format!("android.app.role.{name}") {
                continue;
            }
            let holders = device
                .shell(&["cmd", "role", "get-role-holders", "--user", "0", role])
                .unwrap_or_default();
            for package in packages {
                task.check()?;
                if shell::validate_package(package).is_err()
                    || holders
                        .split(|c: char| ";, \n\r\t".contains(c))
                        .any(|h| h == package)
                {
                    continue;
                }
                reporter.progress("system", package, 0.0, 0.0);
                let result = device
                    .shell(&[
                        "cmd",
                        "role",
                        "add-role-holder",
                        "--user",
                        "0",
                        role,
                        package,
                    ])
                    .and_then(cmd_ok);
                done(&mut report, format!("{name}/{package}"), result);
            }
        }
    }
    if options.wifi {
        for network in &snapshot.wifi {
            task.check()?;
            if !WIFI_SECURITY.contains(&network.security.as_str()) {
                done(
                    &mut report,
                    network.ssid.clone(),
                    Err(AppError::invalid_input(network.security.clone())),
                );
                continue;
            }
            reporter.progress("system", &network.ssid, 0.0, 0.0);
            let mut args = vec![
                "cmd",
                "wifi",
                "add-network",
                &network.ssid,
                &network.security,
            ];
            if let Some(password) = &network.password {
                args.push(password);
            }
            let result = device.shell(&args).and_then(cmd_ok);
            done(&mut report, network.ssid.clone(), result);
        }
    }
    Ok(report)
}

#[tauri::command]
#[specta::specta]
pub async fn list_system_backups(app: AppHandle) -> AppResult<Vec<SystemSummary>> {
    blocking(move || Ok(list(&backup_root(&app)?))).await
}

#[tauri::command]
#[specta::specta]
pub async fn restore_system_backup(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    serial: String,
    id: String,
    options: SystemOptions,
) -> AppResult<SystemReport> {
    let runner = state.runner()?;
    let task = state.tasks.start(&task_id);
    let reporter = Reporter::new(app.clone(), &task_id);
    let result = blocking(move || {
        if !is_file_name(&id) {
            return Err(AppError::new(ErrorCode::InvalidPath, id));
        }
        let path = backup_root(&app)?.join(&id);
        let snapshot = parse(&std::fs::read_to_string(&path)?)?;
        let result = restore(
            Device::new(&*runner, &serial),
            &snapshot,
            &options,
            &task,
            &reporter,
        );
        reporter.finish(&result);
        result
    })
    .await;
    state.tasks.finish(&task_id);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adb::fake::FakeAdb;

    const SNAPSHOT: &str = r#"{
        "format": "easyandroid-system", "version": 1, "createdAt": "2026-11-23T10:00:00+03:00",
        "device": { "model": "POCO F4", "serial": "s", "androidVersion": "15", "sdk": 35 },
        "settings": {
            "system": { "screen_off_timeout": "60000", "font_scale": "1.1", "android_id": "evil" },
            "secure": { "doze_enabled": "1", "lock_pattern_autolock": "1" },
            "global": { "private_dns_mode": "hostname" }
        },
        "roles": { "android.app.role.HOME": ["com.home.app"], "android.app.role.BAD": ["x.y"] },
        "wifi": [
            { "ssid": "Home", "security": "wpa2", "password": "secret pass" },
            { "ssid": "Cafe", "security": "open" },
            { "ssid": "Old", "security": "wep" }
        ]
    }"#;

    fn run(fake: &FakeAdb, options: SystemOptions) -> SystemReport {
        restore(
            Device::new(fake, "X"),
            &parse(SNAPSHOT).unwrap(),
            &options,
            &TaskHandle::default(),
            &Reporter::silent(),
        )
        .unwrap()
    }

    #[test]
    fn every_common_setting_is_allowed_and_none_is_blocked() {
        for key in COMMON {
            assert!(is_restorable(key), "{key}");
        }
        for key in [
            "android_id",
            "lock_pattern_autolock",
            "wifi_on",
            "sim_slot",
            "bluetooth_name",
        ] {
            assert!(!is_restorable(key), "{key}");
        }
        assert!(!is_restorable("bad key; reboot"));
    }

    #[test]
    fn rejects_other_formats() {
        assert!(parse(SNAPSHOT).is_ok());
        let wrong = SNAPSHOT.replace("easyandroid-system", "other");
        assert_eq!(parse(&wrong).unwrap_err().code, ErrorCode::BackupInvalid);
        assert!(parse("not json").is_err());
    }

    #[test]
    fn reads_settings_and_drops_multiline_values() {
        let out = "font_scale=1.0\nsysui_qs_tiles=a,b\nand more\nname=null\nx=1\n";
        let parsed = parse_settings(out);
        assert_eq!(parsed.get("font_scale").map(String::as_str), Some("1.0"));
        assert!(!parsed.contains_key("sysui_qs_tiles"));
        assert!(!parsed.contains_key("name"));
        assert_eq!(parsed.get("x").map(String::as_str), Some("1"));
    }

    #[test]
    fn applies_only_common_changed_settings() {
        let fake = FakeAdb::new()
            .on(
                "list --user 0 system",
                "font_scale=1.1\nscreen_off_timeout=30000\n",
            )
            .on("list --user 0 secure", "")
            .on("list --user 0 global", "")
            .on("settings put", "");
        let report = run(
            &fake,
            SystemOptions {
                settings: true,
                roles: false,
                wifi: false,
            },
        );
        let puts: Vec<String> = fake
            .calls()
            .into_iter()
            .filter(|c| c.contains("settings put"))
            .collect();
        // font_scale is unchanged; android_id and lock_pattern are blocked.
        assert_eq!(puts.len(), 3, "{puts:?}");
        assert!(
            puts.iter()
                .any(|c| c.ends_with("system screen_off_timeout 60000"))
        );
        assert!(
            puts.iter()
                .all(|c| !c.contains("android_id") && !c.contains("lock_pattern"))
        );
        assert_eq!((report.applied, report.failed.len()), (3, 0));
    }

    #[test]
    fn grants_roles_that_are_not_held_yet() {
        let fake = FakeAdb::new()
            .on("get-role-holders", "com.other.home\n")
            .on("add-role-holder", "");
        let report = run(
            &fake,
            SystemOptions {
                settings: false,
                roles: true,
                wifi: false,
            },
        );
        assert_eq!(report.applied, 1);
        assert!(
            fake.calls()
                .iter()
                .any(|c| c.ends_with("add-role-holder --user 0 android.app.role.HOME com.home.app"))
        );
        // The unknown role is ignored.
        assert!(fake.calls().iter().all(|c| !c.contains("BAD")));
    }

    #[test]
    fn adds_wifi_networks_and_reports_what_failed() {
        let fake = FakeAdb::new()
            .on("add-network Home", "Added network\n")
            .on_fail("add-network Cafe", "Unknown command");
        let report = run(
            &fake,
            SystemOptions {
                settings: false,
                roles: false,
                wifi: true,
            },
        );
        assert_eq!(report.applied, 1);
        let failed: Vec<&str> = report.failed.iter().map(|f| f.item.as_str()).collect();
        assert_eq!(failed, ["Cafe", "Old"]);
        assert!(
            fake.calls()
                .iter()
                .any(|c| c.contains("add-network Home wpa2 'secret pass'"))
        );
    }

    #[test]
    fn lists_snapshots_in_the_backup_folder() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("system_20260101-100000.json"), SNAPSHOT).unwrap();
        std::fs::write(root.path().join("system_bad.json"), "nope").unwrap();
        std::fs::write(root.path().join("other.json"), SNAPSHOT).unwrap();
        let found = list(root.path());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].device_model, "POCO F4");
        // Four common settings; android_id and the lock pattern are not applied.
        assert_eq!(found[0].settings_count, 4);
        assert_eq!((found[0].roles_count, found[0].wifi_count), (2, 3));
        assert!(is_file_name("system_20260101-100000.json"));
        assert!(!is_file_name("../system_1.json"));
    }
}
