//! Device discovery, details and reboot.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::State;

use crate::adb::parse::{self, DeviceEntry};
use crate::adb::{AdbRunner, Device, Tool};
use crate::error::{AppError, AppResult};
use crate::state::{AppState, blocking};

/// Lists adb devices plus devices in fastboot mode.
pub fn list(runner: &dyn AdbRunner) -> AppResult<Vec<DeviceEntry>> {
    let mut devices = parse::parse_devices(&runner.exec(Tool::Adb, &["devices", "-l"])?.ok()?);
    if let Ok(out) = runner.exec(Tool::Fastboot, &["devices"]) {
        devices.extend(parse::parse_fastboot_devices(&out.stdout));
    }
    Ok(devices)
}

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDetails {
    pub serial: String,
    pub model: String,
    pub manufacturer: String,
    pub android_version: String,
    pub sdk: u32,
    pub build: String,
    pub abi: String,
    pub has_su: bool,
    pub bootloader_locked: Option<bool>,
    pub verified_boot: String,
    pub selinux: String,
}

pub fn details(device: Device) -> AppResult<DeviceDetails> {
    let props = parse::parse_getprop(&device.shell(&["getprop"])?);
    let prop = |key: &str| props.get(key).cloned().unwrap_or_default();
    let has_su = device
        .script("command -v su")
        .map(|out| !out.trim().is_empty())
        .unwrap_or(false);
    let locked = match (
        prop("ro.boot.flash.locked").as_str(),
        prop("ro.boot.vbmeta.device_state").as_str(),
    ) {
        ("1", _) | (_, "locked") => Some(true),
        ("0", _) | (_, "unlocked") => Some(false),
        _ => None,
    };
    let selinux = device
        .shell(&["getenforce"])
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    Ok(DeviceDetails {
        serial: device.serial().to_string(),
        model: prop("ro.product.model"),
        manufacturer: prop("ro.product.manufacturer"),
        android_version: prop("ro.build.version.release"),
        sdk: prop("ro.build.version.sdk").parse().unwrap_or(0),
        build: prop("ro.build.display.id"),
        abi: prop("ro.product.cpu.abi"),
        has_su,
        bootloader_locked: locked,
        verified_boot: prop("ro.boot.verifiedbootstate"),
        selinux,
    })
}

/// Asks for root through `su`; this may show a prompt on the device.
pub fn check_root(device: Device) -> bool {
    device
        .su("id")
        .map(|out| out.contains("uid=0"))
        .unwrap_or(false)
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RebootMode {
    System,
    Recovery,
    Bootloader,
    Sideload,
    Fastbootd,
}

pub fn reboot(
    runner: &dyn AdbRunner,
    serial: &str,
    mode: RebootMode,
    in_fastboot: bool,
) -> AppResult<()> {
    if in_fastboot {
        let args: &[&str] = match mode {
            RebootMode::System => &["-s", serial, "reboot"],
            RebootMode::Bootloader => &["-s", serial, "reboot-bootloader"],
            RebootMode::Recovery => &["-s", serial, "reboot", "recovery"],
            RebootMode::Fastbootd => &["-s", serial, "reboot", "fastboot"],
            RebootMode::Sideload => return Err(AppError::invalid_input("sideload needs adb")),
        };
        runner.exec(Tool::Fastboot, args)?.ok()?;
        return Ok(());
    }
    let target = match mode {
        RebootMode::System => None,
        RebootMode::Recovery => Some("recovery"),
        RebootMode::Bootloader => Some("bootloader"),
        RebootMode::Sideload => Some("sideload"),
        RebootMode::Fastbootd => Some("fastboot"),
    };
    let device = Device::new(runner, serial);
    match target {
        Some(target) => device.adb(&["reboot", target])?,
        None => device.adb(&["reboot"])?,
    };
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn list_devices(state: State<'_, AppState>) -> AppResult<Vec<DeviceEntry>> {
    let runner = state.runner()?;
    blocking(move || list(&*runner)).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_device_details(
    state: State<'_, AppState>,
    serial: String,
) -> AppResult<DeviceDetails> {
    let runner = state.runner()?;
    blocking(move || details(Device::new(&*runner, &serial))).await
}

#[tauri::command]
#[specta::specta]
pub async fn check_device_root(state: State<'_, AppState>, serial: String) -> AppResult<bool> {
    let runner = state.runner()?;
    blocking(move || Ok(check_root(Device::new(&*runner, &serial)))).await
}

#[tauri::command]
#[specta::specta]
pub async fn reboot_device(
    state: State<'_, AppState>,
    serial: String,
    mode: RebootMode,
    in_fastboot: bool,
) -> AppResult<()> {
    let runner = state.runner()?;
    blocking(move || reboot(&*runner, &serial, mode, in_fastboot)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adb::fake::FakeAdb;

    #[test]
    fn lists_adb_and_fastboot_devices() {
        let fake = FakeAdb::new()
            .on(
                "devices -l",
                "List of devices attached\nABC device model:Pixel_7\n",
            )
            .on("fastboot devices", "XYZ\tfastboot\n");
        let devices = list(&fake).unwrap();
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[1].serial, "XYZ");
    }

    #[test]
    fn classifies_list_failures() {
        let fake = FakeAdb::new().on_fail("devices -l", "error: device unauthorized.\n");
        let err = list(&fake).unwrap_err();
        assert_eq!(err.code, crate::error::ErrorCode::DeviceUnauthorized);
    }

    #[test]
    fn reads_device_details() {
        let fake = FakeAdb::new()
            .on(
                "shell getprop",
                "[ro.product.model]: [Pixel 7]\n[ro.build.version.sdk]: [34]\n[ro.boot.flash.locked]: [0]\n",
            )
            .on("command -v su", "/system/bin/su\n")
            .on("getenforce", "Enforcing\n");
        let info = details(Device::new(&fake, "ABC")).unwrap();
        assert_eq!(info.model, "Pixel 7");
        assert_eq!(info.sdk, 34);
        assert!(info.has_su);
        assert_eq!(info.bootloader_locked, Some(false));
        assert_eq!(info.selinux, "Enforcing");
    }

    #[test]
    fn reboots_into_modes() {
        let fake = FakeAdb::new().on("reboot", "");
        reboot(&fake, "ABC", RebootMode::Recovery, false).unwrap();
        reboot(&fake, "ABC", RebootMode::Bootloader, true).unwrap();
        assert_eq!(
            fake.calls(),
            vec![
                "-s ABC reboot recovery",
                "fastboot -s ABC reboot-bootloader"
            ]
        );
    }
}
