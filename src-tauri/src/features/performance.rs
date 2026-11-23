//! Live metrics, hardware inventory and network information.

use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;
use serde::Serialize;
use specta::Type;
use tauri::State;

use crate::adb::Device;
use crate::adb::parse::parse_getprop;
use crate::error::AppResult;
use crate::features::device::{self, DeviceDetails};
use crate::state::{AppState, blocking};

/// Splits script output into `@@name` sections.
fn sections(output: &str) -> HashMap<&str, Vec<&str>> {
    let mut map: HashMap<&str, Vec<&str>> = HashMap::new();
    let mut current = "";
    for line in output.lines() {
        if let Some(name) = line.strip_prefix("@@") {
            current = name.trim();
        } else {
            map.entry(current).or_default().push(line);
        }
    }
    map
}

fn cpu_percent(lines: &[&str]) -> Option<f64> {
    let parse = |line: &str| -> Option<(f64, f64)> {
        let values: Vec<f64> = line
            .strip_prefix("cpu ")?
            .split_whitespace()
            .filter_map(|v| v.parse().ok())
            .collect();
        let idle = values.get(3)? + values.get(4).unwrap_or(&0.0);
        Some((values.iter().sum(), idle))
    };
    let (t1, i1) = parse(lines.first()?)?;
    let (t2, i2) = parse(lines.get(1)?)?;
    let (dt, di) = (t2 - t1, i2 - i1);
    (dt > 0.0).then(|| ((1.0 - di / dt) * 100.0).clamp(0.0, 100.0))
}

fn kv<'a>(lines: &[&'a str], sep: char) -> HashMap<String, &'a str> {
    lines
        .iter()
        .filter_map(|l| l.split_once(sep))
        .map(|(k, v)| (k.trim().to_string(), v.trim()))
        .collect()
}

fn meminfo_kb(lines: &[&str], key: &str) -> f64 {
    kv(lines, ':')
        .get(key)
        .and_then(|v| v.split_whitespace().next()?.parse().ok())
        .unwrap_or(0.0)
}

#[derive(Debug, Clone, Serialize, Type, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Battery {
    pub level: Option<f64>,
    pub temperature_c: Option<f64>,
    pub voltage_mv: Option<f64>,
    pub status: String,
    pub plugged: bool,
}

fn battery(lines: &[&str]) -> Battery {
    let map = kv(lines, ':');
    let num = |k: &str| map.get(k).and_then(|v| v.parse::<f64>().ok());
    let status = match map.get("status").copied() {
        Some("2") => "charging",
        Some("3") => "discharging",
        Some("4") => "not_charging",
        Some("5") => "full",
        _ => "unknown",
    };
    let plugged = ["AC powered", "USB powered", "Wireless powered"]
        .iter()
        .any(|k| map.get(*k) == Some(&"true"));
    Battery {
        level: num("level"),
        temperature_c: num("temperature").map(|t| t / 10.0),
        voltage_mv: num("voltage"),
        status: status.into(),
        plugged,
    }
}

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Storage {
    pub total_kb: f64,
    pub used_kb: f64,
}

fn storage(lines: &[&str]) -> Option<Storage> {
    let cols: Vec<f64> = lines
        .last()?
        .split_whitespace()
        .skip(1)
        .take(2)
        .filter_map(|v| v.parse().ok())
        .collect();
    Some(Storage {
        total_kb: *cols.first()?,
        used_kb: *cols.get(1)?,
    })
}

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LiveMetrics {
    pub cpu_percent: Option<f64>,
    pub load_average: Option<f64>,
    pub mem_total_kb: f64,
    pub mem_available_kb: f64,
    pub battery: Battery,
    pub storage: Option<Storage>,
}

const LIVE_SCRIPT: &str = "echo @@stat; head -n1 /proc/stat; sleep 0.4; head -n1 /proc/stat; \
     echo @@mem; head -n5 /proc/meminfo; echo @@load; cat /proc/loadavg; \
     echo @@bat; dumpsys battery; echo @@df; df -k /data | tail -n1";

pub fn parse_live(output: &str) -> LiveMetrics {
    let s = sections(output);
    let get = |k: &str| s.get(k).cloned().unwrap_or_default();
    LiveMetrics {
        cpu_percent: cpu_percent(&get("stat")),
        load_average: get("load")
            .first()
            .and_then(|l| l.split_whitespace().next()?.parse().ok()),
        mem_total_kb: meminfo_kb(&get("mem"), "MemTotal"),
        mem_available_kb: meminfo_kb(&get("mem"), "MemAvailable"),
        battery: battery(&get("bat")),
        storage: storage(&get("df")),
    }
}

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    pub device: DeviceDetails,
    pub brand: String,
    pub soc: String,
    pub cpu_cores: Option<u32>,
    pub kernel: String,
    pub resolution: String,
    pub density: String,
    pub ram_total_kb: f64,
    pub storage_total_kb: f64,
}

pub fn hardware(device: Device) -> AppResult<HardwareInfo> {
    let details = device::details(device)?;
    let props = parse_getprop(&device.shell(&["getprop"])?);
    let prop = |k: &str| props.get(k).filter(|v| !v.is_empty()).cloned();
    let out = device.script(
        "echo @@uname; uname -r; echo @@wm; wm size; wm density; echo @@cores; nproc 2>/dev/null; \
         echo @@mem; head -n1 /proc/meminfo; echo @@df; df -k /data | tail -n1",
    )?;
    let s = sections(&out);
    let get = |k: &str| s.get(k).cloned().unwrap_or_default();
    let wm = kv(&get("wm"), ':');
    let wm_value = |k: &str| {
        wm.get(&format!("Override {k}"))
            .or(wm.get(&format!("Physical {k}")))
            .map(|v| v.to_string())
    };
    let soc = match (prop("ro.soc.manufacturer"), prop("ro.soc.model")) {
        (Some(m), Some(model)) => format!("{m} {model}"),
        _ => prop("ro.board.platform")
            .or(prop("ro.hardware"))
            .unwrap_or_default(),
    };
    Ok(HardwareInfo {
        brand: prop("ro.product.brand").unwrap_or_default(),
        soc,
        cpu_cores: get("cores").first().and_then(|v| v.trim().parse().ok()),
        kernel: get("uname")
            .first()
            .map(|v| v.trim().to_string())
            .unwrap_or_default(),
        resolution: wm_value("size").unwrap_or_default(),
        density: wm_value("density").unwrap_or_default(),
        ram_total_kb: meminfo_kb(&get("mem"), "MemTotal"),
        storage_total_kb: storage(&get("df")).map(|s| s.total_kb).unwrap_or(0.0),
        device: details,
    })
}

#[derive(Debug, Clone, Serialize, Type, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    pub wifi_ip: Option<String>,
    pub ssid: Option<String>,
    pub rssi: Option<i32>,
    pub link_speed_mbps: Option<i32>,
    pub frequency_mhz: Option<i32>,
}

static WIFI_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"SSID: "?([^",]*)"?,.*?RSSI: (-?\d+).*?Link speed: (\d+)Mbps.*?Frequency: (\d+)MHz"#,
    )
    .unwrap()
});

pub fn parse_network(ip_out: &str, wifi_out: &str) -> NetworkInfo {
    let wifi_ip = ip_out.lines().find_map(|l| {
        let rest = l.trim().strip_prefix("inet ")?;
        Some(rest.split(['/', ' ']).next()?.to_string())
    });
    let mut info = NetworkInfo {
        wifi_ip,
        ..Default::default()
    };
    if let Some(c) = WIFI_RE.captures(wifi_out) {
        let ssid = c[1].trim().to_string();
        info.ssid = (!ssid.is_empty() && ssid != "<unknown ssid>").then_some(ssid);
        info.rssi = c[2].parse().ok();
        info.link_speed_mbps = c[3].parse().ok();
        info.frequency_mhz = c[4].parse().ok();
    }
    info
}

#[tauri::command]
#[specta::specta]
pub async fn get_live_metrics(
    state: State<'_, AppState>,
    serial: String,
) -> AppResult<LiveMetrics> {
    let runner = state.runner()?;
    blocking(move || {
        Ok(parse_live(
            &Device::new(&*runner, &serial).script(LIVE_SCRIPT)?,
        ))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_hardware_info(
    state: State<'_, AppState>,
    serial: String,
) -> AppResult<HardwareInfo> {
    let runner = state.runner()?;
    blocking(move || hardware(Device::new(&*runner, &serial))).await
}

#[tauri::command]
#[specta::specta]
pub async fn get_network_info(
    state: State<'_, AppState>,
    serial: String,
) -> AppResult<NetworkInfo> {
    let runner = state.runner()?;
    blocking(move || {
        let device = Device::new(&*runner, &serial);
        let ip = device
            .shell(&["ip", "-f", "inet", "addr", "show", "wlan0"])
            .unwrap_or_default();
        let wifi = device
            .script("dumpsys wifi | grep -m1 mWifiInfo")
            .unwrap_or_default();
        Ok(parse_network(&ip, &wifi))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIVE: &str = "@@stat\ncpu  100 0 100 800 0 0 0 0 0 0\ncpu  150 0 150 900 0 0 0 0 0 0\n\
@@mem\nMemTotal:        7800000 kB\nMemFree:          100000 kB\nMemAvailable:    3900000 kB\n\
@@load\n2.50 2.10 1.90 3/1200 12345\n\
@@bat\nCurrent Battery Service state:\n  AC powered: false\n  USB powered: true\n  status: 2\n  level: 85\n  voltage: 4200\n  temperature: 312\n\
@@df\n/dev/block/dm-5  117000000 50000000 67000000 43% /data\n";

    #[test]
    fn parses_live_metrics() {
        let m = parse_live(LIVE);
        assert_eq!(m.cpu_percent, Some(50.0));
        assert_eq!(m.load_average, Some(2.5));
        assert_eq!(m.mem_total_kb, 7_800_000.0);
        assert_eq!(m.mem_available_kb, 3_900_000.0);
        assert_eq!(m.battery.level, Some(85.0));
        assert_eq!(m.battery.temperature_c, Some(31.2));
        assert_eq!(m.battery.status, "charging");
        assert!(m.battery.plugged);
        assert_eq!(
            m.storage,
            Some(Storage {
                total_kb: 117_000_000.0,
                used_kb: 50_000_000.0
            })
        );
    }

    #[test]
    fn tolerates_missing_sections() {
        let m = parse_live("");
        assert_eq!(m.cpu_percent, None);
        assert_eq!(m.storage, None);
        assert_eq!(m.battery.status, "unknown");
    }

    #[test]
    fn parses_network() {
        let ip = "    inet 192.168.1.23/24 brd 192.168.1.255 scope global wlan0\n";
        let wifi = r#"mWifiInfo SSID: "Home", BSSID: aa:bb, MAC: cc, Security type: 2, Supplicant state: COMPLETED, Wi-Fi standard: 11ax, RSSI: -51, Link speed: 866Mbps, Tx Link speed: 866Mbps, Frequency: 5180MHz, Net ID: 1"#;
        let n = parse_network(ip, wifi);
        assert_eq!(n.wifi_ip.as_deref(), Some("192.168.1.23"));
        assert_eq!(n.ssid.as_deref(), Some("Home"));
        assert_eq!(
            (n.rssi, n.link_speed_mbps, n.frequency_mhz),
            (Some(-51), Some(866), Some(5180))
        );
    }
}
