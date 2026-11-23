//! Wireless debugging: pairing code, QR (mDNS), manual connect and `adb tcpip`.

use std::sync::LazyLock;
use std::time::Duration;

use regex::Regex;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};

use crate::adb::{AdbRunner, Device, Tool};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::state::{AppState, blocking};
use crate::store;

static ADDRESS_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Za-z0-9.\-]+:\d{1,5}$").unwrap());

fn validate_address(address: &str) -> AppResult<()> {
    if ADDRESS_RE.is_match(address) {
        Ok(())
    } else {
        Err(AppError::invalid_input(address))
    }
}

pub fn pair(runner: &dyn AdbRunner, address: &str, code: &str) -> AppResult<()> {
    validate_address(address)?;
    if code.is_empty()
        || code.len() > 64
        || code.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err(AppError::invalid_input("pairing code"));
    }
    let out = runner.exec(Tool::Adb, &["pair", address, code])?;
    let text = format!("{}{}", out.stdout, out.stderr);
    if text.contains("Successfully paired") {
        Ok(())
    } else {
        Err(AppError::new(ErrorCode::PairFailed, text.trim()))
    }
}

pub fn connect(runner: &dyn AdbRunner, address: &str) -> AppResult<()> {
    validate_address(address)?;
    let out = runner.exec(Tool::Adb, &["connect", address])?;
    let text = format!("{}{}", out.stdout, out.stderr);
    let lower = text.to_lowercase();
    if lower.contains("connected to") && !lower.contains("failed") && !lower.contains("cannot") {
        Ok(())
    } else {
        Err(AppError::new(ErrorCode::ConnectFailed, text.trim()))
    }
}

/// Parses `ip -f inet addr show wlan0` for the IPv4 address.
fn parse_wlan_ip(output: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let rest = line.trim().strip_prefix("inet ")?;
        Some(rest.split(['/', ' ']).next()?.to_string())
    })
}

/// Switches a USB device to TCP mode and connects to it. Returns the address.
pub fn enable_tcpip(runner: &dyn AdbRunner, serial: &str, port: u16) -> AppResult<String> {
    let device = Device::new(runner, serial);
    let ip = parse_wlan_ip(&device.shell(&["ip", "-f", "inet", "addr", "show", "wlan0"])?)
        .ok_or_else(|| AppError::new(ErrorCode::ConnectFailed, "device has no Wi-Fi address"))?;
    device.adb(&["tcpip", &port.to_string()])?;
    let address = format!("{ip}:{port}");
    let mut last = None;
    for _ in 0..5 {
        std::thread::sleep(Duration::from_millis(800));
        match connect(runner, &address) {
            Ok(()) => return Ok(address),
            Err(err) => last = Some(err),
        }
    }
    Err(last.unwrap_or_else(|| AppError::new(ErrorCode::ConnectFailed, address)))
}

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MdnsService {
    pub name: String,
    pub service: String,
    pub address: String,
}

pub fn parse_mdns(output: &str) -> Vec<MdnsService> {
    output
        .lines()
        .filter(|line| !line.starts_with("List of"))
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let (name, service, address) = (parts.next()?, parts.next()?, parts.next()?);
            Some(MdnsService {
                name: name.into(),
                service: service.trim_end_matches('.').into(),
                address: address.into(),
            })
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QrPairing {
    pub name: String,
    pub password: String,
    pub qr_text: String,
}

fn random_token(len: usize) -> AppResult<String> {
    const ALPHABET: &[u8] = b"abcdefghijkmnpqrstuvwxyz23456789";
    let mut bytes = vec![0u8; len];
    getrandom::fill(&mut bytes).map_err(|e| AppError::new(ErrorCode::Internal, e.to_string()))?;
    Ok(bytes
        .iter()
        .map(|b| ALPHABET[*b as usize % ALPHABET.len()] as char)
        .collect())
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SavedDevice {
    pub address: String,
    pub name: Option<String>,
    pub last_connected: String,
}

fn remember(app: &AppHandle, address: &str) -> AppResult<()> {
    let mut saved: Vec<SavedDevice> = store::load(app, "wirelessDevices");
    saved.retain(|d| d.address != address);
    saved.insert(
        0,
        SavedDevice {
            address: address.into(),
            name: None,
            last_connected: chrono::Local::now().to_rfc3339(),
        },
    );
    saved.truncate(20);
    store::save(app, "wirelessDevices", &saved)
}

#[tauri::command]
#[specta::specta]
pub async fn wireless_pair(
    state: State<'_, AppState>,
    address: String,
    code: String,
) -> AppResult<()> {
    let runner = state.runner()?;
    blocking(move || pair(&*runner, &address, &code)).await
}

#[tauri::command]
#[specta::specta]
pub async fn wireless_connect(
    app: AppHandle,
    state: State<'_, AppState>,
    address: String,
) -> AppResult<()> {
    let runner = state.runner()?;
    blocking(move || {
        connect(&*runner, &address)?;
        remember(&app, &address)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn wireless_disconnect(state: State<'_, AppState>, address: String) -> AppResult<()> {
    let runner = state.runner()?;
    blocking(move || {
        validate_address(&address)?;
        runner
            .exec(Tool::Adb, &["disconnect", &address])?
            .ok()
            .map(|_| ())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn wireless_enable_tcpip(
    app: AppHandle,
    state: State<'_, AppState>,
    serial: String,
) -> AppResult<String> {
    let runner = state.runner()?;
    blocking(move || {
        let address = enable_tcpip(&*runner, &serial, 5555)?;
        remember(&app, &address)?;
        Ok(address)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub fn wireless_new_qr() -> AppResult<QrPairing> {
    let name = format!("easyadb-{}", random_token(6)?);
    let password = random_token(10)?;
    let qr_text = format!("WIFI:T:ADB;S:{name};P:{password};;");
    Ok(QrPairing {
        name,
        password,
        qr_text,
    })
}

/// Looks for the pairing service the phone advertises after scanning the QR code.
#[tauri::command]
#[specta::specta]
pub async fn wireless_find_pairing(
    state: State<'_, AppState>,
    name: String,
) -> AppResult<Option<String>> {
    let runner = state.runner()?;
    blocking(move || {
        let out = runner.exec(Tool::Adb, &["mdns", "services"])?.ok()?;
        Ok(parse_mdns(&out)
            .into_iter()
            .find(|s| s.name == name && s.service == "_adb-tls-pairing._tcp")
            .map(|s| s.address))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub fn wireless_saved(app: AppHandle) -> Vec<SavedDevice> {
    store::load(&app, "wirelessDevices")
}

#[tauri::command]
#[specta::specta]
pub fn wireless_forget(app: AppHandle, address: String) -> AppResult<()> {
    let mut saved: Vec<SavedDevice> = store::load(&app, "wirelessDevices");
    saved.retain(|d| d.address != address);
    store::save(&app, "wirelessDevices", &saved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adb::fake::FakeAdb;

    #[test]
    fn pairs_and_connects() {
        let ok = FakeAdb::new()
            .on(
                "pair",
                "Successfully paired to 192.168.1.5:37000 [guid=adb-abc]\n",
            )
            .on("connect", "connected to 192.168.1.5:5555\n");
        pair(&ok, "192.168.1.5:37000", "123456").unwrap();
        connect(&ok, "192.168.1.5:5555").unwrap();

        let bad = FakeAdb::new()
            .on("pair", "Failed: Unable to start pairing client.\n")
            .on(
                "connect",
                "failed to connect to '192.168.1.5:5555': Connection refused\n",
            );
        assert_eq!(
            pair(&bad, "192.168.1.5:37000", "1").unwrap_err().code,
            ErrorCode::PairFailed
        );
        assert_eq!(
            connect(&bad, "192.168.1.5:5555").unwrap_err().code,
            ErrorCode::ConnectFailed
        );
    }

    #[test]
    fn validates_addresses() {
        let fake = FakeAdb::new();
        for bad in ["192.168.1.5", "a b:1", "1.2.3.4:5555; reboot", ""] {
            assert!(connect(&fake, bad).is_err(), "{bad}");
        }
        assert!(fake.calls().is_empty());
    }

    #[test]
    fn parses_mdns_services() {
        let out = "List of discovered mdns services\n\
                   adb-R58M30-xyz\t_adb-tls-connect._tcp\t192.168.1.23:42567\n\
                   easyadb-abc123\t_adb-tls-pairing._tcp.\t192.168.1.23:37615\n";
        let services = parse_mdns(out);
        assert_eq!(services.len(), 2);
        assert_eq!(services[1].service, "_adb-tls-pairing._tcp");
        assert_eq!(services[1].address, "192.168.1.23:37615");
    }

    #[test]
    fn parses_wlan_ip() {
        let out = "30: wlan0: <BROADCAST,MULTICAST,UP> mtu 1500\n    inet 192.168.1.23/24 brd 192.168.1.255 scope global wlan0\n";
        assert_eq!(parse_wlan_ip(out).as_deref(), Some("192.168.1.23"));
        assert_eq!(parse_wlan_ip("nothing"), None);
    }

    #[test]
    fn builds_qr_payload() {
        let qr = wireless_new_qr().unwrap();
        assert!(qr.name.starts_with("easyadb-"));
        assert_eq!(
            qr.qr_text,
            format!("WIFI:T:ADB;S:{};P:{};;", qr.name, qr.password)
        );
    }
}
