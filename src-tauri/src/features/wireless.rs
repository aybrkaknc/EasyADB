//! Wireless debugging: discovery (mDNS), pairing by code or QR, manual connect, `adb tcpip`
//! and connecting paired phones on their own.

use std::collections::{HashMap, HashSet};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use regex::Regex;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, State};

use crate::adb::parse::{self, ConnectionKind, DeviceEntry, DeviceState};
use crate::adb::{AdbRunner, Device, Tool};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::features::device::{PhoneIds, list_identified};
use crate::state::{AppState, blocking};
use crate::store;

const CONNECT_SERVICE: &str = "_adb-tls-connect._tcp";
const PAIRING_SERVICE: &str = "_adb-tls-pairing._tcp";
const SAVED_KEY: &str = "wirelessDevices";
/// How often paired phones are looked for.
const WATCH_EVERY: Duration = Duration::from_secs(5);
/// A phone that could not be connected is left alone this long.
const RETRY_AFTER: Duration = Duration::from_secs(60);

static ADDRESS_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Za-z0-9.\-]+:\d{1,5}$").unwrap());

fn validate_address(address: &str) -> AppResult<()> {
    if ADDRESS_RE.is_match(address) {
        Ok(())
    } else {
        Err(AppError::invalid_input(address))
    }
}

/// The mDNS name of the phone in the output of `adb pair`.
fn guid_of(output: &str) -> Option<&str> {
    let rest = output.split_once("[guid=")?.1;
    Some(rest.split_once(']')?.0).filter(|guid| !guid.is_empty())
}

/// Pairs and returns the mDNS name the phone told, if any.
pub fn pair(runner: &dyn AdbRunner, address: &str, code: &str) -> AppResult<Option<String>> {
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
        Ok(guid_of(&text).map(str::to_string))
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

fn wlan_ip(device: &Device) -> AppResult<String> {
    parse_wlan_ip(&device.shell(&["ip", "-f", "inet", "addr", "show", "wlan0"])?)
        .ok_or_else(|| AppError::new(ErrorCode::ConnectFailed, "device has no Wi-Fi address"))
}

/// Tries the addresses in order and returns the one that answered.
fn connect_any(runner: &dyn AdbRunner, addresses: &[String]) -> Option<String> {
    addresses
        .iter()
        .find(|address| connect(runner, address).is_ok())
        .cloned()
}

/// Switches a USB device to TCP mode and connects to it. Returns the address.
pub fn enable_tcpip(runner: &dyn AdbRunner, serial: &str, port: u16) -> AppResult<String> {
    if port < 1024 {
        return Err(AppError::invalid_input("port"));
    }
    let device = Device::new(runner, serial);
    let ip = wlan_ip(&device)?;
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

/// Parses `adb mdns services`. Instance names may contain spaces, so the last two fields are
/// the service and the address.
pub fn parse_mdns(output: &str) -> Vec<MdnsService> {
    output
        .lines()
        .filter(|line| !line.starts_with("List of"))
        .filter_map(|line| {
            let (rest, address) = line.trim().rsplit_once(char::is_whitespace)?;
            let (name, service) = rest.trim_end().rsplit_once(char::is_whitespace)?;
            Some(MdnsService {
                name: name.trim().into(),
                service: service.trim_end_matches('.').into(),
                address: address.into(),
            })
        })
        .collect()
}

fn mdns_services(runner: &dyn AdbRunner) -> AppResult<Vec<MdnsService>> {
    Ok(parse_mdns(
        &runner.exec(Tool::Adb, &["mdns", "services"])?.ok()?,
    ))
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

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct SavedDevice {
    pub address: String,
    /// mDNS instance name. `None` for a phone connected by address only.
    pub name: Option<String>,
    pub last_connected: String,
    /// Serial number of the phone.
    pub phone: Option<String>,
    pub model: Option<String>,
}

impl SavedDevice {
    fn key(&self) -> &str {
        self.phone.as_deref().unwrap_or(&self.address)
    }
}

/// One phone that is on the network, connected without a cable, or remembered.
#[derive(Debug, Clone, Serialize, Type, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WirelessPhone {
    /// Serial number of the phone, or its address when that is all that is known.
    pub key: String,
    pub name: Option<String>,
    pub model: Option<String>,
    /// Addresses to try, the ones on the network first.
    pub addresses: Vec<String>,
    /// adb serials of the connections without a cable.
    pub connected: Vec<String>,
    /// Announces itself on the network now.
    pub online: bool,
    pub saved: bool,
}

#[derive(Debug, Clone, Serialize, Type, Default)]
#[serde(rename_all = "camelCase")]
pub struct Discovery {
    pub phones: Vec<WirelessPhone>,
    /// Where a phone waits for a pairing code right now.
    pub code_pairing: Option<String>,
}

fn entry<'a>(phones: &'a mut Vec<WirelessPhone>, key: &str) -> &'a mut WirelessPhone {
    let at = match phones.iter().position(|p| p.key == key) {
        Some(at) => at,
        None => {
            phones.push(WirelessPhone {
                key: key.to_string(),
                ..Default::default()
            });
            phones.len() - 1
        }
    };
    &mut phones[at]
}

fn add_once(list: &mut Vec<String>, value: &str) {
    if !list.iter().any(|v| v == value) {
        list.push(value.to_string());
    }
}

/// Puts the three sources together, one row per phone.
pub fn merge(
    services: &[MdnsService],
    devices: &[DeviceEntry],
    saved: &[SavedDevice],
) -> Discovery {
    let mut phones = Vec::new();
    for service in services.iter().filter(|s| s.service == CONNECT_SERVICE) {
        let key = parse::mdns_phone(&service.name).unwrap_or_else(|| service.address.clone());
        let phone = entry(&mut phones, &key);
        phone.name = Some(parse::mdns_base_name(&service.name).to_string());
        phone.online = true;
        add_once(&mut phone.addresses, &service.address);
    }
    for device in devices {
        if device.kind != ConnectionKind::Wifi || device.state != DeviceState::Device {
            continue;
        }
        let key = device
            .phone
            .clone()
            .unwrap_or_else(|| device.serial.clone());
        let phone = entry(&mut phones, &key);
        phone.model = device.model.clone();
        phone.connected.push(device.serial.clone());
    }
    for record in saved {
        // A record made before the phone was known is found by its address.
        let known = phones
            .iter()
            .find(|p| {
                p.addresses.contains(&record.address) || p.connected.contains(&record.address)
            })
            .map(|p| p.key.clone());
        let key = record
            .phone
            .clone()
            .or(known)
            .unwrap_or_else(|| record.address.clone());
        let phone = entry(&mut phones, &key);
        phone.saved = true;
        if phone.model.is_none() {
            phone.model = record.model.clone();
        }
        if phone.name.is_none() {
            phone.name = record.name.clone();
        }
        // The port of wireless debugging changes, so an old address of an mDNS phone is useless.
        if record.name.is_none() {
            add_once(&mut phone.addresses, &record.address);
        }
    }
    // A USB connection tells the model of a phone that is only seen on the network.
    for phone in phones.iter_mut().filter(|p| p.model.is_none()) {
        phone.model = devices
            .iter()
            .find(|d| d.phone.as_deref() == Some(phone.key.as_str()))
            .and_then(|d| d.model.clone());
    }
    Discovery {
        phones,
        code_pairing: services
            .iter()
            .find(|s| s.service == PAIRING_SERVICE && !s.name.starts_with("easyadb-"))
            .map(|s| s.address.clone()),
    }
}

/// What the user decided in this run of EasyADB, and what failed lately.
#[derive(Default)]
pub struct Wireless {
    /// Phones the user disconnected or forgot; they are left alone until a restart.
    blocked: Mutex<HashSet<String>>,
    failed: Mutex<HashMap<String, Instant>>,
    /// Guards the saved list between reading and writing it.
    store: Mutex<()>,
}

impl Wireless {
    fn block(&self, key: &str) {
        self.blocked.lock().unwrap().insert(key.to_string());
    }

    fn unblock(&self, key: &str) {
        self.blocked.lock().unwrap().remove(key);
        self.failed.lock().unwrap().remove(key);
    }

    fn is_blocked(&self, key: &str) -> bool {
        self.blocked.lock().unwrap().contains(key)
    }

    fn fail(&self, key: &str, now: Instant) {
        self.failed.lock().unwrap().insert(key.to_string(), now);
    }

    /// Blocked phones and phones that failed less than [`RETRY_AFTER`] ago.
    fn skipped(&self, now: Instant) -> HashSet<String> {
        let mut skip = self.blocked.lock().unwrap().clone();
        let failed = self.failed.lock().unwrap();
        skip.extend(
            failed
                .iter()
                .filter(|(_, at)| now.duration_since(**at) < RETRY_AFTER)
                .map(|(key, _)| key.clone()),
        );
        skip
    }
}

/// The paired phones that should be connected now: saved, on the network, and not connected
/// in any way.
pub fn to_connect<'a>(
    phones: &'a [WirelessPhone],
    devices: &[DeviceEntry],
    skip: &HashSet<String>,
) -> Vec<&'a WirelessPhone> {
    phones
        .iter()
        .filter(|p| p.saved && p.online && p.connected.is_empty() && !skip.contains(&p.key))
        .filter(|p| {
            !devices
                .iter()
                .any(|d| d.phone.as_deref() == Some(p.key.as_str()))
        })
        .collect()
}

/// The record of a phone that is connected without a cable now.
fn record_of(phone: &WirelessPhone, services: &[MdnsService]) -> Option<SavedDevice> {
    let serial = phone.connected.first()?;
    // An mDNS serial is the instance name followed by the service.
    let address = services
        .iter()
        .find(|s| *serial == format!("{}.{}", s.name, s.service))
        .map(|s| s.address.clone())
        .or_else(|| phone.addresses.first().cloned())
        .unwrap_or_else(|| serial.clone());
    Some(SavedDevice {
        address,
        name: phone.name.clone(),
        last_connected: String::new(),
        phone: (phone.key != *serial).then(|| phone.key.clone()),
        model: phone.model.clone(),
    })
}

/// Adds or updates a record. True when something other than the time changed.
fn upsert(saved: &mut Vec<SavedDevice>, mut record: SavedDevice) -> bool {
    let old = saved
        .iter()
        .find(|old| old.key() == record.key() || old.address == record.address)
        .cloned();
    if let Some(old) = old {
        record.name = record.name.or_else(|| old.name.clone());
        record.phone = record.phone.or_else(|| old.phone.clone());
        record.model = record.model.or_else(|| old.model.clone());
        record.last_connected = old.last_connected.clone();
        if record == old {
            return false;
        }
    }
    record.last_connected = chrono::Local::now().to_rfc3339();
    saved.retain(|old| old.key() != record.key() && old.address != record.address);
    saved.insert(0, record);
    saved.truncate(20);
    true
}

fn remember(app: &AppHandle, wireless: &Wireless, records: Vec<SavedDevice>) -> AppResult<()> {
    let _guard = wireless.store.lock().unwrap();
    let mut saved: Vec<SavedDevice> = store::load(app, SAVED_KEY);
    let mut changed = false;
    for record in records {
        changed |= upsert(&mut saved, record);
    }
    if changed {
        store::save(app, SAVED_KEY, &saved)?;
    }
    Ok(())
}

struct Seen {
    services: Vec<MdnsService>,
    devices: Vec<DeviceEntry>,
    found: Discovery,
}

/// Looks at the network and the devices, and remembers every phone connected without a cable.
fn look(
    app: &AppHandle,
    runner: &dyn AdbRunner,
    ids: &PhoneIds,
    wireless: &Wireless,
) -> AppResult<Seen> {
    // Some networks block mDNS; connected and saved phones are listed all the same.
    let services = mdns_services(runner).unwrap_or_default();
    let devices = list_identified(runner, ids)?;
    let saved: Vec<SavedDevice> = store::load(app, SAVED_KEY);
    let mut found = merge(&services, &devices, &saved);
    let records = found
        .phones
        .iter()
        .filter(|p| !wireless.is_blocked(&p.key))
        .filter_map(|p| record_of(p, &services))
        .collect();
    remember(app, wireless, records)?;
    for phone in &mut found.phones {
        phone.saved |= !phone.connected.is_empty() && !wireless.is_blocked(&phone.key);
    }
    Ok(Seen {
        services,
        devices,
        found,
    })
}

/// Connects paired phones as they show up, as long as the setting allows it.
pub fn watch(app: AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(WATCH_EVERY);
            let state = app.state::<AppState>();
            let Ok(runner) = state.runner() else { return };
            let Ok(seen) = look(&app, &*runner, &state.phone_ids, &state.wireless) else {
                continue;
            };
            if !store::settings(&app).auto_connect {
                continue;
            }
            let skip = state.wireless.skipped(Instant::now());
            for phone in to_connect(&seen.found.phones, &seen.devices, &skip) {
                let on_network: Vec<String> = seen
                    .services
                    .iter()
                    .filter(|s| {
                        s.service == CONNECT_SERVICE
                            && parse::mdns_phone(&s.name).as_deref() == Some(phone.key.as_str())
                    })
                    .map(|s| s.address.clone())
                    .collect();
                if connect_any(&*runner, &on_network).is_none() {
                    state.wireless.fail(&phone.key, Instant::now());
                }
            }
        }
    });
}

/// After pairing, waits for the phone to show up and connects to it unless adb already did.
fn connect_paired(runner: &dyn AdbRunner, guid: &str, tries: u32, pause: Duration) -> bool {
    let name = parse::mdns_base_name(guid);
    for attempt in 0..tries {
        if attempt > 0 {
            std::thread::sleep(pause);
        }
        let connected = runner
            .exec(Tool::Adb, &["devices"])
            .and_then(|out| out.ok())
            .map(|out| parse::parse_devices(&out))
            .unwrap_or_default()
            .iter()
            .any(|d| d.state == DeviceState::Device && parse::mdns_base_name(&d.serial) == name);
        if connected {
            return true;
        }
        let addresses: Vec<String> = mdns_services(runner)
            .unwrap_or_default()
            .into_iter()
            .filter(|s| s.service == CONNECT_SERVICE && parse::mdns_base_name(&s.name) == name)
            .map(|s| s.address)
            .collect();
        if connect_any(runner, &addresses).is_some() {
            return true;
        }
    }
    false
}

/// The answer of `service call`: `None` if the call failed, otherwise its first value if any.
pub fn parse_parcel(output: &str) -> Option<Option<u32>> {
    let body = output.split_once("Parcel(")?.1;
    let mut words = body.split_whitespace().map_while(|word| {
        (word.len() == 8)
            .then(|| u32::from_str_radix(word, 16).ok())
            .flatten()
    });
    match words.next()? {
        0 => Some(words.next()),
        _ => None,
    }
}

/// The numbers of `service call adb` differ between Android versions. Two questions whose
/// answers `cmd adb` knows as well show whether this phone uses the expected numbers.
pub fn check_adb_service(device: &Device) -> AppResult<()> {
    let sdk: u32 = device
        .shell(&["getprop", "ro.build.version.sdk"])?
        .trim()
        .parse()
        .unwrap_or(0);
    let unsupported = || AppError::new(ErrorCode::NotSupported, format!("sdk {sdk}"));
    if !(30..=36).contains(&sdk) {
        return Err(unsupported());
    }
    for (code, command) in [("12", "is-wifi-supported"), ("13", "is-wifi-qr-supported")] {
        let called = parse_parcel(&device.shell(&["service", "call", "adb", code])?);
        let expected = match device.shell(&["cmd", "adb", command])?.trim() {
            "true" => 1,
            "false" => 0,
            _ => return Err(unsupported()),
        };
        if called != Some(Some(expected)) {
            return Err(unsupported());
        }
    }
    Ok(())
}

fn wireless_port(device: &Device) -> AppResult<Option<u16>> {
    let out = device.shell(&["service", "call", "adb", "10"])?;
    Ok(parse_parcel(&out)
        .flatten()
        .and_then(|port| u16::try_from(port).ok())
        .filter(|port| *port > 0))
}

/// Turns wireless debugging on over the cable and connects with the authorization the phone
/// already gave this PC. `None` when the phone has to be paired first.
pub fn connect_over_usb(
    runner: &dyn AdbRunner,
    serial: &str,
    tries: u32,
    pause: Duration,
) -> AppResult<Option<String>> {
    let device = Device::new(runner, serial);
    check_adb_service(&device)?;
    device.shell(&["settings", "put", "global", "adb_wifi_enabled", "1"])?;
    let ip = wlan_ip(&device)?;
    for attempt in 0..tries {
        if attempt > 0 {
            std::thread::sleep(pause);
        }
        // The port stays 0 until the user allows wireless debugging on this network.
        let Some(port) = wireless_port(&device)? else {
            continue;
        };
        let address = format!("{ip}:{port}");
        if connect(runner, &address).is_ok() {
            return Ok(Some(address));
        }
    }
    Ok(None)
}

/// Pairs and connects. True when the phone is connected afterwards.
#[tauri::command]
#[specta::specta]
pub async fn wireless_pair(
    app: AppHandle,
    state: State<'_, AppState>,
    address: String,
    code: String,
) -> AppResult<bool> {
    let runner = state.runner()?;
    let (ids, wireless) = (state.phone_ids.clone(), state.wireless.clone());
    blocking(move || {
        let Some(guid) = pair(&*runner, &address, &code)? else {
            return Ok(false);
        };
        if let Some(phone) = parse::mdns_phone(&guid) {
            wireless.unblock(&phone);
        }
        let connected = connect_paired(&*runner, &guid, 10, Duration::from_secs(1));
        look(&app, &*runner, &ids, &wireless)?;
        Ok(connected)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn wireless_connect(
    app: AppHandle,
    state: State<'_, AppState>,
    address: String,
) -> AppResult<()> {
    let runner = state.runner()?;
    let (ids, wireless) = (state.phone_ids.clone(), state.wireless.clone());
    blocking(move || {
        connect(&*runner, &address)?;
        // The phone tells its serial once it is connected.
        let phone = mdns_services(&*runner)
            .unwrap_or_default()
            .iter()
            .find(|s| s.address == address)
            .and_then(|s| parse::mdns_phone(&s.name))
            .or_else(|| {
                list_identified(&*runner, &ids)
                    .ok()?
                    .into_iter()
                    .find(|d| d.serial == address)?
                    .phone
            });
        wireless.unblock(&address);
        if let Some(phone) = &phone {
            wireless.unblock(phone);
        }
        look(&app, &*runner, &ids, &wireless).map(|_| ())
    })
    .await
}

fn disconnect(runner: &dyn AdbRunner, serial: &str) -> AppResult<()> {
    runner
        .exec(Tool::Adb, &["disconnect", serial])?
        .ok()
        .map(|_| ())
}

/// Drops one connection without a cable. The phone is not connected again on its own.
#[tauri::command]
#[specta::specta]
pub async fn wireless_disconnect(state: State<'_, AppState>, serial: String) -> AppResult<()> {
    let runner = state.runner()?;
    let (ids, wireless) = (state.phone_ids.clone(), state.wireless.clone());
    let _hold = state.requests.exclusive(&serial)?;
    blocking(move || {
        let device = list_identified(&*runner, &ids)?
            .into_iter()
            .find(|d| d.serial == serial && d.kind == ConnectionKind::Wifi)
            .ok_or_else(|| AppError::new(ErrorCode::DeviceNotFound, &serial))?;
        wireless.block(device.phone.as_deref().unwrap_or(&serial));
        disconnect(&*runner, &serial)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn wireless_discover(app: AppHandle, state: State<'_, AppState>) -> AppResult<Discovery> {
    let runner = state.runner()?;
    let (ids, wireless) = (state.phone_ids.clone(), state.wireless.clone());
    blocking(move || Ok(look(&app, &*runner, &ids, &wireless)?.found)).await
}

/// Disconnects a phone and removes it from the list. The phone keeps its authorization.
#[tauri::command]
#[specta::specta]
pub async fn wireless_forget(
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
) -> AppResult<()> {
    let runner = state.runner()?;
    let (ids, wireless) = (state.phone_ids.clone(), state.wireless.clone());
    let connected: Vec<String> = {
        let (runner, ids) = (runner.clone(), ids.clone());
        blocking(move || list_identified(&*runner, &ids))
            .await?
            .into_iter()
            .filter(|d| {
                d.kind == ConnectionKind::Wifi && d.phone.as_deref().unwrap_or(&d.serial) == key
            })
            .map(|d| d.serial)
            .collect()
    };
    let holds = connected
        .iter()
        .map(|serial| state.requests.exclusive(serial))
        .collect::<AppResult<Vec<_>>>()?;
    let result = blocking(move || {
        wireless.block(&key);
        for serial in &connected {
            disconnect(&*runner, serial)?;
        }
        let _guard = wireless.store.lock().unwrap();
        let mut saved: Vec<SavedDevice> = store::load(&app, SAVED_KEY);
        saved.retain(|d| d.key() != key && !connected.contains(&d.address));
        store::save(&app, SAVED_KEY, &saved)
    })
    .await;
    drop(holds);
    result
}

#[tauri::command]
#[specta::specta]
pub async fn wireless_enable_tcpip(
    app: AppHandle,
    state: State<'_, AppState>,
    serial: String,
    port: u16,
) -> AppResult<String> {
    let runner = state.runner()?;
    let wireless = state.wireless.clone();
    // `adb tcpip` restarts adbd, which drops every connection to the phone.
    let _hold = state.requests.exclusive(&serial)?;
    blocking(move || {
        let address = enable_tcpip(&*runner, &serial, port)?;
        wireless.unblock(&serial);
        remember(
            &app,
            &wireless,
            vec![SavedDevice {
                address: address.clone(),
                phone: Some(serial),
                ..Default::default()
            }],
        )?;
        Ok(address)
    })
    .await
}

/// True when the phone is connected without a cable afterwards.
#[tauri::command]
#[specta::specta]
pub async fn wireless_connect_usb(state: State<'_, AppState>, serial: String) -> AppResult<bool> {
    let runner = state.runner()?;
    let wireless = state.wireless.clone();
    blocking(move || {
        wireless.unblock(&serial);
        Ok(connect_over_usb(&*runner, &serial, 5, Duration::from_millis(800))?.is_some())
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
        Ok(mdns_services(&*runner)?
            .into_iter()
            .find(|s| s.name == name && s.service == PAIRING_SERVICE)
            .map(|s| s.address))
    })
    .await
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
        assert_eq!(
            pair(&ok, "192.168.1.5:37000", "123456").unwrap().as_deref(),
            Some("adb-abc")
        );
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
        assert!(enable_tcpip(&fake, "x", 80).is_err());
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
    fn parses_mdns_names_with_spaces() {
        let out = "adb-a279-u1x (2)\t_adb-tls-connect._tcp\t192.168.1.147:39775\n\
                   adb-a279-u1x (2)   _adb-tls-connect._tcp   192.168.1.147:39776\n";
        let services = parse_mdns(out);
        assert_eq!(services.len(), 2);
        assert!(services.iter().all(|s| s.name == "adb-a279-u1x (2)"));
        assert_eq!(services[1].address, "192.168.1.147:39776");
    }

    fn service(name: &str, service: &str, address: &str) -> MdnsService {
        MdnsService {
            name: name.into(),
            service: service.into(),
            address: address.into(),
        }
    }

    #[test]
    fn lists_one_row_per_phone() {
        let services = [
            service("adb-a279-u1x", CONNECT_SERVICE, "10.0.0.2:1111"),
            service("adb-a279-u1x (2)", CONNECT_SERVICE, "10.0.0.2:2222"),
            service("adb-b111-zz", CONNECT_SERVICE, "10.0.0.3:3333"),
            service("adb-b111-zz", PAIRING_SERVICE, "10.0.0.3:4444"),
        ];
        let connected = parse::parse_devices(
            "adb-a279-u1x (2)._adb-tls-connect._tcp device model:Munch transport_id:1\n",
        );
        let saved = [
            SavedDevice {
                address: "10.0.0.2:9".into(),
                name: Some("adb-a279-u1x".into()),
                phone: Some("a279".into()),
                ..Default::default()
            },
            SavedDevice {
                address: "10.0.0.9:5555".into(),
                ..Default::default()
            },
        ];
        let found = merge(&services, &connected, &saved);
        assert_eq!(found.code_pairing.as_deref(), Some("10.0.0.3:4444"));
        assert_eq!(found.phones.len(), 3);
        let first = &found.phones[0];
        assert_eq!(first.key, "a279");
        assert_eq!(first.model.as_deref(), Some("Munch"));
        assert_eq!(first.addresses, ["10.0.0.2:1111", "10.0.0.2:2222"]);
        assert_eq!(first.connected.len(), 1);
        assert!(first.saved && first.online);
        assert!(!found.phones[1].saved && found.phones[1].online);
        let manual = &found.phones[2];
        assert_eq!(manual.key, "10.0.0.9:5555");
        assert_eq!(manual.addresses, ["10.0.0.9:5555"]);
        assert!(manual.saved && !manual.online);

        let record = record_of(first, &services).unwrap();
        assert_eq!(record.address, "10.0.0.2:2222");
        assert_eq!(record.phone.as_deref(), Some("a279"));
    }

    #[test]
    fn connects_only_phones_that_are_nowhere() {
        let phone = |key: &str, saved: bool, online: bool| WirelessPhone {
            key: key.into(),
            saved,
            online,
            ..Default::default()
        };
        let mut connected = phone("connected", true, true);
        connected.connected = vec!["x:1".into()];
        let phones = [
            phone("free", true, true),
            phone("unknown", false, true),
            phone("away", true, false),
            phone("blocked", true, true),
            phone("wired", true, true),
            connected,
        ];
        let usb = parse::parse_devices("wired device transport_id:1\n");
        let state = Wireless::default();
        state.block("blocked");
        let skip = state.skipped(Instant::now());
        let keys: Vec<_> = to_connect(&phones, &usb, &skip)
            .iter()
            .map(|p| p.key.as_str())
            .collect();
        assert_eq!(keys, ["free"]);
    }

    #[test]
    fn failed_phones_wait_before_the_next_try() {
        let state = Wireless::default();
        let now = Instant::now();
        state.fail("a", now);
        assert!(state.skipped(now).contains("a"));
        assert!(!state.skipped(now + RETRY_AFTER).contains("a"));
    }

    #[test]
    fn saves_a_phone_once() {
        let mut saved = vec![SavedDevice {
            address: "10.0.0.2:5555".into(),
            ..Default::default()
        }];
        let record = SavedDevice {
            address: "10.0.0.2:5555".into(),
            phone: Some("a279".into()),
            model: Some("Munch".into()),
            ..Default::default()
        };
        assert!(upsert(&mut saved, record.clone()));
        assert!(!upsert(&mut saved, record.clone()));
        let moved = SavedDevice {
            address: "10.0.0.2:6000".into(),
            model: None,
            ..record
        };
        assert!(upsert(&mut saved, moved));
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].model.as_deref(), Some("Munch"));
    }

    #[test]
    fn reads_the_answer_of_a_service_call() {
        let port = "Result: Parcel(\t00000000 00009b5f   '...._...')";
        assert_eq!(parse_parcel(port), Some(Some(39775)));
        assert_eq!(
            parse_parcel("Result: Parcel(00000000    '....')"),
            Some(None)
        );
        assert_eq!(
            parse_parcel("Result: Parcel(ffffffff 00000000 '....')"),
            None
        );
        assert_eq!(parse_parcel("service: not found"), None);
    }

    fn adb_phone(sdk: &str, answer: &str) -> FakeAdb {
        FakeAdb::new()
            .on("ro.build.version.sdk", sdk)
            .on("call adb 12", answer)
            .on("call adb 13", answer)
            .on("is-wifi", "true\n")
    }

    const YES: &str = "Result: Parcel(00000000 00000001 '....')";

    #[test]
    fn trusts_the_service_numbers_only_when_they_answer_right() {
        let no = "Result: Parcel(00000000 00000000 '....')";
        let good = adb_phone("36\n", YES);
        assert!(check_adb_service(&Device::new(&good, "x")).is_ok());
        for bad in [
            adb_phone("36\n", no),
            adb_phone("37\n", YES),
            adb_phone("29\n", YES),
        ] {
            let err = check_adb_service(&Device::new(&bad, "x")).unwrap_err();
            assert_eq!(err.code, ErrorCode::NotSupported);
        }
    }

    #[test]
    fn connects_over_usb_with_the_port_of_the_phone() {
        let fake = adb_phone("36\n", YES)
            .on("call adb 10", "Result: Parcel(00000000 00009b5f '....')")
            .on("adb_wifi_enabled", "")
            .on("wlan0", "    inet 10.0.0.2/24 scope global wlan0\n")
            .on("connect", "connected to 10.0.0.2:39775\n");
        let address = connect_over_usb(&fake, "x", 1, Duration::ZERO).unwrap();
        assert_eq!(address.as_deref(), Some("10.0.0.2:39775"));
    }

    #[test]
    fn connects_a_phone_right_after_pairing() {
        let fake = FakeAdb::new()
            .on("devices", "List of devices attached\n")
            .on(
                "mdns services",
                "adb-a279-u1x\t_adb-tls-connect._tcp\t10.0.0.2:1111\n",
            )
            .on("connect 10.0.0.2:1111", "connected to 10.0.0.2:1111\n");
        assert!(connect_paired(&fake, "adb-a279-u1x", 1, Duration::ZERO));
        assert!(!connect_paired(&fake, "adb-b-c", 1, Duration::ZERO));
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
