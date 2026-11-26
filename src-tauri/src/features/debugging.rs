//! Debugging settings of a phone and the adb server of this PC.

use std::time::Duration;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use crate::adb::parse::{self, DeviceState};
use crate::adb::{AdbRunner, Device, Tool};
use crate::awake;
use crate::error::{AppError, AppResult, ErrorCode};
use crate::features::wireless::check_adb_service;
use crate::state::{AppState, blocking};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UsbMode {
    Charging,
    Mtp,
    Ptp,
    Rndis,
    Midi,
}

impl UsbMode {
    /// The name `svc usb` uses; charging is no function at all.
    fn function(self) -> Option<&'static str> {
        match self {
            Self::Charging => None,
            Self::Mtp => Some("mtp"),
            Self::Ptp => Some("ptp"),
            Self::Rndis => Some("rndis"),
            Self::Midi => Some("midi"),
        }
    }
}

/// A `None` field is not offered by this phone.
#[derive(Debug, Clone, Serialize, Type, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct DebugSettings {
    pub sdk: u32,
    pub wireless: Option<bool>,
    /// Authorizations of PCs lapse after seven days without use.
    pub auth_expires: Option<bool>,
    pub stay_awake: bool,
    pub verify_installs: bool,
    pub usb_mode: Option<UsbMode>,
    /// Port of TCP mode (`adb tcpip`), when it is on.
    pub tcp_port: Option<u16>,
    /// Names of the PCs the phone allows.
    pub computers: Vec<String>,
    /// Authorizations can be revoked from here.
    pub can_revoke: bool,
}

const READ_SCRIPT: &str = "\
echo \"sdk=$(getprop ro.build.version.sdk)\"; \
echo \"wifi=$(settings get global adb_wifi_enabled)\"; \
echo \"timeout=$(settings get global adb_allowed_connection_time)\"; \
echo \"awake=$(settings get global stay_on_while_plugged_in)\"; \
echo \"verify=$(settings get global verifier_verify_adb_installs)\"; \
echo \"usb=$(svc usb getFunctions 2>&1 | head -n 1)\"; \
echo \"tcp=$(getprop service.adb.tcp.port)\"; \
echo @@adb; dumpsys adb 2>/dev/null";

/// The comments of the keys in `dumpsys adb`, which name the PCs.
fn parse_computers(dump: &str) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    let mut inside = false;
    for line in dump.lines() {
        let mut line = line.trim();
        if let Some(rest) = line.strip_prefix("user_keys=") {
            inside = true;
            line = rest;
        } else if line.is_empty()
            || line.starts_with("keystore=")
            || line.starts_with("system_keys")
        {
            inside = false;
        }
        if !inside {
            continue;
        }
        if let Some((_, name)) = line.split_once(' ') {
            let name = name.trim().to_string();
            if !name.is_empty() && !names.contains(&name) {
                names.push(name);
            }
        }
    }
    names
}

fn parse_usb_mode(output: &str) -> Option<UsbMode> {
    let output = output.trim();
    if output.is_empty() {
        return Some(UsbMode::Charging);
    }
    let known = [UsbMode::Mtp, UsbMode::Ptp, UsbMode::Rndis, UsbMode::Midi];
    let mut found = None;
    for part in output.split(',').map(str::trim) {
        if part == "adb" || part == "none" {
            found = found.or(Some(UsbMode::Charging));
        } else {
            // Anything else is an error text or a mode this screen does not know.
            found = Some(known.into_iter().find(|m| m.function() == Some(part))?);
        }
    }
    found
}

pub fn parse_settings(output: &str) -> DebugSettings {
    let (values, dump) = output.split_once("@@adb").unwrap_or((output, ""));
    let value = |key: &str| {
        values
            .lines()
            .find_map(|line| line.trim().strip_prefix(key)?.strip_prefix('='))
            .map(str::trim)
            .unwrap_or_default()
    };
    let sdk: u32 = value("sdk").parse().unwrap_or(0);
    let modern = sdk >= 30;
    DebugSettings {
        sdk,
        wireless: modern.then(|| value("wifi") == "1"),
        // Unset means the default of seven days; zero means never.
        auth_expires: modern.then(|| value("timeout") != "0"),
        stay_awake: value("awake").parse::<u32>().is_ok_and(|v| v != 0),
        verify_installs: value("verify") != "0",
        usb_mode: parse_usb_mode(value("usb")),
        tcp_port: value("tcp").parse().ok().filter(|port| *port > 0),
        computers: parse_computers(dump),
        can_revoke: (30..=36).contains(&sdk),
    }
}

pub fn read(device: Device) -> AppResult<DebugSettings> {
    Ok(parse_settings(&device.script(READ_SCRIPT)?))
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum DebugSetting {
    Wireless(bool),
    AuthExpires(bool),
    StayAwake(bool),
    VerifyInstalls(bool),
    UsbMode(UsbMode),
    TcpOff,
    /// Turns adb off altogether; only the phone can turn it on again.
    UsbDebuggingOff,
}

impl DebugSetting {
    /// True when applying it may cut the connection to the phone.
    pub fn drops_connection(self) -> bool {
        matches!(
            self,
            Self::Wireless(false) | Self::UsbMode(_) | Self::TcpOff | Self::UsbDebuggingOff
        )
    }
}

fn is_ready(runner: &dyn AdbRunner, serial: &str) -> bool {
    runner
        .exec(Tool::Adb, &["devices"])
        .and_then(|out| out.ok())
        .map(|out| parse::parse_devices(&out))
        .unwrap_or_default()
        .iter()
        .any(|d| d.serial == serial && d.state == DeviceState::Device)
}

/// A command that cuts its own connection may report a failure although it worked.
fn allow_drop(
    runner: &dyn AdbRunner,
    serial: &str,
    result: AppResult<String>,
    pause: Duration,
) -> AppResult<()> {
    let Err(err) = result else { return Ok(()) };
    std::thread::sleep(pause);
    if is_ready(runner, serial) {
        Err(err)
    } else {
        Ok(())
    }
}

fn put(device: Device, key: &str, value: &str) -> AppResult<()> {
    device.shell(&["settings", "put", "global", key, value])?;
    let now = device.shell(&["settings", "get", "global", key])?;
    if now.trim() == value {
        Ok(())
    } else {
        Err(AppError::new(
            ErrorCode::NotSupported,
            format!("{key} stays {}", now.trim()),
        ))
    }
}

fn flag(on: bool) -> &'static str {
    if on { "1" } else { "0" }
}

pub fn apply(
    runner: &dyn AdbRunner,
    serial: &str,
    setting: DebugSetting,
    pause: Duration,
) -> AppResult<()> {
    let device = Device::new(runner, serial);
    match setting {
        DebugSetting::Wireless(true) => put(device, "adb_wifi_enabled", "1"),
        DebugSetting::Wireless(false) => allow_drop(
            runner,
            serial,
            device.shell(&["settings", "put", "global", "adb_wifi_enabled", "0"]),
            pause,
        ),
        DebugSetting::AuthExpires(false) => put(device, "adb_allowed_connection_time", "0"),
        DebugSetting::AuthExpires(true) => device
            .shell(&[
                "settings",
                "delete",
                "global",
                "adb_allowed_connection_time",
            ])
            .map(|_| ()),
        // 7 covers mains, USB and wireless charging.
        DebugSetting::StayAwake(on) => put(
            device,
            "stay_on_while_plugged_in",
            if on { "7" } else { "0" },
        ),
        DebugSetting::VerifyInstalls(on) => put(device, "verifier_verify_adb_installs", flag(on)),
        DebugSetting::UsbMode(mode) => {
            let mut args = vec!["svc", "usb", "setFunctions"];
            args.extend(mode.function());
            allow_drop(runner, serial, device.shell(&args), pause)
        }
        DebugSetting::TcpOff => allow_drop(runner, serial, device.adb(&["usb"]), pause),
        DebugSetting::UsbDebuggingOff => allow_drop(
            runner,
            serial,
            device.shell(&["settings", "put", "global", "adb_enabled", "0"]),
            pause,
        ),
    }
}

/// Makes the phone forget every PC it allowed, including this one.
pub fn revoke(runner: &dyn AdbRunner, serial: &str, pause: Duration) -> AppResult<()> {
    let device = Device::new(runner, serial);
    check_adb_service(&device)?;
    // 3 is `clearDebuggingKeys`.
    let result = device
        .shell(&["service", "call", "adb", "3"])
        .and_then(|out| {
            if crate::features::wireless::parse_parcel(&out).is_some() {
                Ok(out)
            } else {
                Err(AppError::new(ErrorCode::AdbFailed, out.trim()))
            }
        });
    allow_drop(runner, serial, result, pause)
}

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AdbInfo {
    pub version: String,
    pub path: String,
    /// Phones on the network can be found.
    pub mdns: bool,
}

pub fn adb_info(runner: &dyn AdbRunner) -> AppResult<AdbInfo> {
    let out = runner.exec(Tool::Adb, &["version"])?.ok()?;
    let value = |prefix: &str| {
        out.lines()
            .find_map(|line| line.trim().strip_prefix(prefix))
            .unwrap_or_default()
            .trim()
            .to_string()
    };
    let mdns = runner
        .exec(Tool::Adb, &["mdns", "check"])
        .is_ok_and(|out| out.success && out.stdout.contains("mdns daemon version"));
    Ok(AdbInfo {
        version: value("Version "),
        path: value("Installed as "),
        mdns,
    })
}

/// `running` is the number of jobs of this PC that a restart would cut off.
pub fn restart_server(runner: &dyn AdbRunner, running: usize) -> AppResult<()> {
    if running > 0 {
        return Err(AppError::new(ErrorCode::Busy, ""));
    }
    runner.exec(Tool::Adb, &["kill-server"])?.ok()?;
    runner.exec(Tool::Adb, &["start-server"])?.ok()?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn get_debug_settings(
    state: State<'_, AppState>,
    serial: String,
) -> AppResult<DebugSettings> {
    let runner = state.runner()?;
    blocking(move || read(Device::new(&*runner, &serial))).await
}

#[tauri::command]
#[specta::specta]
pub async fn set_debug_setting(
    state: State<'_, AppState>,
    serial: String,
    setting: DebugSetting,
) -> AppResult<()> {
    let runner = state.runner()?;
    let _hold = if setting.drops_connection() {
        Some(state.requests.exclusive(&serial)?)
    } else {
        None
    };
    blocking(move || apply(&*runner, &serial, setting, Duration::from_secs(1))).await
}

#[tauri::command]
#[specta::specta]
pub async fn revoke_authorizations(state: State<'_, AppState>, serial: String) -> AppResult<()> {
    let runner = state.runner()?;
    let _hold = state.requests.exclusive(&serial)?;
    blocking(move || revoke(&*runner, &serial, Duration::from_secs(1))).await
}

/// Opens the developer options on the phone.
#[tauri::command]
#[specta::specta]
pub async fn open_phone_settings(state: State<'_, AppState>, serial: String) -> AppResult<()> {
    let runner = state.runner()?;
    blocking(move || {
        Device::new(&*runner, &serial)
            .shell(&[
                "am",
                "start",
                "-a",
                "android.settings.APPLICATION_DEVELOPMENT_SETTINGS",
            ])
            .map(|_| ())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_adb_info(state: State<'_, AppState>) -> AppResult<AdbInfo> {
    let runner = state.runner()?;
    blocking(move || adb_info(&*runner)).await
}

#[tauri::command]
#[specta::specta]
pub async fn restart_adb_server(state: State<'_, AppState>) -> AppResult<()> {
    let runner = state.runner()?;
    blocking(move || restart_server(&*runner, awake::running())).await
}

#[tauri::command]
#[specta::specta]
pub async fn reconnect_offline(state: State<'_, AppState>) -> AppResult<()> {
    let runner = state.runner()?;
    blocking(move || {
        runner
            .exec(Tool::Adb, &["reconnect", "offline"])?
            .ok()
            .map(|_| ())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adb::fake::FakeAdb;

    const OUTPUT: &str = "sdk=36\nwifi=1\ntimeout=0\nawake=0\nverify=null\nusb=\ntcp=\n\
@@adb\nADB MANAGER STATE (dumpsys adb):\n{\n  debugging_manager={\n    connected_to_adb=true\n    \
user_keys=QAAAAaa== PC@HOME\nQAAAAbb== laptop@work\n    \n    keystore=ABX key PC@OTHER\n  }\n}\n";

    #[test]
    fn reads_the_settings() {
        let settings = parse_settings(OUTPUT);
        assert_eq!(settings.wireless, Some(true));
        assert_eq!(settings.auth_expires, Some(false));
        assert!(!settings.stay_awake);
        assert!(settings.verify_installs);
        assert_eq!(settings.usb_mode, Some(UsbMode::Charging));
        assert_eq!(settings.tcp_port, None);
        assert_eq!(settings.computers, ["PC@HOME", "laptop@work"]);
        assert!(settings.can_revoke);
    }

    #[test]
    fn hides_what_old_phones_do_not_have() {
        let settings = parse_settings(
            "sdk=29\nwifi=null\ntimeout=null\nawake=7\nverify=0\nusb=mtp,adb\ntcp=5555\n",
        );
        assert_eq!(settings.wireless, None);
        assert_eq!(settings.auth_expires, None);
        assert!(settings.stay_awake);
        assert!(!settings.verify_installs);
        assert_eq!(settings.usb_mode, Some(UsbMode::Mtp));
        assert_eq!(settings.tcp_port, Some(5555));
        assert!(!settings.can_revoke);
        assert_eq!(parse_usb_mode("usage: svc usb"), None);
    }

    #[test]
    fn writes_a_setting_and_reads_it_back() {
        let fake = FakeAdb::new()
            .on("settings put global stay_on_while_plugged_in 7", "")
            .on("settings get global stay_on_while_plugged_in", "7\n");
        apply(&fake, "x", DebugSetting::StayAwake(true), Duration::ZERO).unwrap();

        let refused = FakeAdb::new()
            .on("settings put", "")
            .on("settings get", "0\n");
        let err = apply(&refused, "x", DebugSetting::Wireless(true), Duration::ZERO).unwrap_err();
        assert_eq!(err.code, ErrorCode::NotSupported);
    }

    #[test]
    fn sends_the_matching_command() {
        let fake = FakeAdb::new()
            .on("setFunctions", "")
            .on("-s x usb", "")
            .on("settings", "");
        for (setting, expected) in [
            (
                DebugSetting::UsbMode(UsbMode::Mtp),
                "svc usb setFunctions mtp",
            ),
            (
                DebugSetting::UsbMode(UsbMode::Charging),
                "svc usb setFunctions",
            ),
            (DebugSetting::TcpOff, "-s x usb"),
            (
                DebugSetting::AuthExpires(true),
                "settings delete global adb_allowed_connection_time",
            ),
            (
                DebugSetting::UsbDebuggingOff,
                "settings put global adb_enabled 0",
            ),
        ] {
            apply(&fake, "x", setting, Duration::ZERO).unwrap();
            let call = fake.calls().pop().unwrap();
            assert!(call.ends_with(expected), "{call}");
        }
    }

    #[test]
    fn a_dropped_connection_is_not_a_failure() {
        let gone = FakeAdb::new()
            .on_fail("adb_wifi_enabled", "error: closed")
            .on("devices", "List of devices attached\n");
        apply(&gone, "x", DebugSetting::Wireless(false), Duration::ZERO).unwrap();

        let still_there = FakeAdb::new()
            .on_fail("adb_wifi_enabled", "Security exception")
            .on("devices", "List of devices attached\nx device\n");
        assert!(
            apply(
                &still_there,
                "x",
                DebugSetting::Wireless(false),
                Duration::ZERO
            )
            .is_err()
        );
    }

    #[test]
    fn revokes_only_where_the_number_is_known() {
        let yes = "Result: Parcel(00000000 00000001 '....')";
        let phone = |sdk: &str| {
            FakeAdb::new()
                .on("ro.build.version.sdk", sdk)
                .on("call adb 12", yes)
                .on("call adb 13", yes)
                .on("is-wifi", "true\n")
                .on("call adb 3", "Result: Parcel(00000000    '....')")
        };
        let good = phone("36\n");
        revoke(&good, "x", Duration::ZERO).unwrap();
        assert!(good.calls().last().unwrap().ends_with("service call adb 3"));

        let newer = phone("37\n");
        assert!(revoke(&newer, "x", Duration::ZERO).is_err());
        assert!(newer.calls().iter().all(|c| !c.ends_with("call adb 3")));
    }

    #[test]
    fn reads_the_adb_version() {
        let fake = FakeAdb::new()
            .on(
                "version",
                "Android Debug Bridge version 1.0.41\nVersion 37.0.3-1\nInstalled as C:\\adb.exe\n",
            )
            .on("mdns check", "mdns daemon version [adb discovery 0.0.0]\n");
        let info = adb_info(&fake).unwrap();
        assert_eq!(info.version, "37.0.3-1");
        assert_eq!(info.path, "C:\\adb.exe");
        assert!(info.mdns);
    }

    #[test]
    fn keeps_the_server_while_a_job_runs() {
        let fake = FakeAdb::new().on("server", "");
        assert_eq!(restart_server(&fake, 1).unwrap_err().code, ErrorCode::Busy);
        assert!(fake.calls().is_empty());
        restart_server(&fake, 0).unwrap();
        assert_eq!(fake.calls(), ["kill-server", "start-server"]);
    }
}
