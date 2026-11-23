//! Pure parsers for adb output shared across features.

use std::collections::HashMap;

use serde::Serialize;
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum DeviceState {
    Device,
    Unauthorized,
    Offline,
    Recovery,
    Sideload,
    Bootloader,
    Unknown,
}

impl DeviceState {
    fn from_word(word: &str) -> Self {
        match word {
            "device" => Self::Device,
            "unauthorized" => Self::Unauthorized,
            "offline" => Self::Offline,
            "recovery" => Self::Recovery,
            "sideload" => Self::Sideload,
            "bootloader" | "fastboot" => Self::Bootloader,
            _ => Self::Unknown,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionKind {
    Usb,
    Wifi,
    Emulator,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct DeviceEntry {
    pub serial: String,
    pub state: DeviceState,
    pub kind: ConnectionKind,
    pub model: Option<String>,
    pub product: Option<String>,
}

fn connection_kind(serial: &str) -> ConnectionKind {
    if serial.starts_with("emulator-") {
        ConnectionKind::Emulator
    } else if serial.contains(':') || serial.contains("._adb-tls-connect.") {
        ConnectionKind::Wifi
    } else {
        ConnectionKind::Usb
    }
}

/// Parses `adb devices -l`.
pub fn parse_devices(output: &str) -> Vec<DeviceEntry> {
    output
        .lines()
        .filter(|line| !line.starts_with("List of devices") && !line.starts_with('*'))
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let serial = parts.next()?.to_string();
            let state = DeviceState::from_word(parts.next()?);
            let mut entry = DeviceEntry {
                kind: connection_kind(&serial),
                serial,
                state,
                model: None,
                product: None,
            };
            for part in parts {
                if let Some(model) = part.strip_prefix("model:") {
                    entry.model = Some(model.replace('_', " "));
                } else if let Some(product) = part.strip_prefix("product:") {
                    entry.product = Some(product.to_string());
                }
            }
            Some(entry)
        })
        .collect()
}

/// Parses `fastboot devices` (`SERIAL<tab>fastboot`).
pub fn parse_fastboot_devices(output: &str) -> Vec<DeviceEntry> {
    output
        .lines()
        .filter_map(|line| {
            let serial = line.split_whitespace().next()?.to_string();
            Some(DeviceEntry {
                kind: connection_kind(&serial),
                serial,
                state: DeviceState::Bootloader,
                model: None,
                product: None,
            })
        })
        .collect()
}

/// Parses `pm list packages` style output into package names.
pub fn parse_packages(output: &str) -> Vec<String> {
    output
        .lines()
        .filter_map(|line| line.trim().strip_prefix("package:"))
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect()
}

/// Parses `pm path <package>` into APK paths (base and splits).
pub fn parse_pm_path(output: &str) -> Vec<String> {
    parse_packages(output)
}

/// Parses `getprop` output (`[key]: [value]`).
pub fn parse_getprop(output: &str) -> HashMap<String, String> {
    output
        .lines()
        .filter_map(|line| {
            let (key, value) = line.trim().split_once("]: [")?;
            let key = key.strip_prefix('[')?;
            let value = value.strip_suffix(']')?;
            Some((key.to_string(), value.to_string()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const DEVICES: &str = "List of devices attached\n\
R58M12345A             device usb:1-1 product:beyond1lteeea model:SM_G973F device:beyond1 transport_id:3\n\
192.168.1.5:5555       device product:panther model:Pixel_7 device:panther transport_id:4\n\
adb-R58M-abc._adb-tls-connect._tcp device product:x model:Y transport_id:6\n\
emulator-5554          offline transport_id:1\n\
ZY223                  unauthorized usb:1-2 transport_id:5\n\
\n";

    #[test]
    fn parses_device_list() {
        let devices = parse_devices(DEVICES);
        assert_eq!(devices.len(), 5);
        assert_eq!(devices[0].serial, "R58M12345A");
        assert_eq!(devices[0].state, DeviceState::Device);
        assert_eq!(devices[0].kind, ConnectionKind::Usb);
        assert_eq!(devices[0].model.as_deref(), Some("SM G973F"));
        assert_eq!(devices[1].kind, ConnectionKind::Wifi);
        assert_eq!(devices[2].kind, ConnectionKind::Wifi);
        assert_eq!(devices[3].kind, ConnectionKind::Emulator);
        assert_eq!(devices[3].state, DeviceState::Offline);
        assert_eq!(devices[4].state, DeviceState::Unauthorized);
        assert_eq!(devices[4].model, None);
    }

    #[test]
    fn ignores_daemon_banner() {
        let out = "* daemon not running; starting now at tcp:5037\n* daemon started successfully\nList of devices attached\n";
        assert!(parse_devices(out).is_empty());
    }

    #[test]
    fn parses_fastboot_devices() {
        let devices = parse_fastboot_devices("ABC123\tfastboot\n");
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].state, DeviceState::Bootloader);
    }

    #[test]
    fn parses_packages_and_paths() {
        let out = "package:com.a\npackage:com.b.c\n\nWARNING: something\n";
        assert_eq!(parse_packages(out), vec!["com.a", "com.b.c"]);
        let paths = "package:/data/app/~~x==/com.a-y==/base.apk\npackage:/data/app/~~x==/com.a-y==/split_config.arm64_v8a.apk\n";
        assert_eq!(parse_pm_path(paths).len(), 2);
    }

    #[test]
    fn parses_getprop() {
        let out = "[ro.product.model]: [Pixel 7]\n[ro.build.version.release]: [14]\n[empty]: []\ngarbage\n";
        let props = parse_getprop(out);
        assert_eq!(props["ro.product.model"], "Pixel 7");
        assert_eq!(props["ro.build.version.release"], "14");
        assert_eq!(props["empty"], "");
        assert_eq!(props.len(), 3);
    }
}
