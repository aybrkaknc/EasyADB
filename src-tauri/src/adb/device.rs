use serde::Serialize;

use super::process::run_command;

#[derive(Serialize, Debug, Clone)]
pub struct DeviceInfo {
    pub id: String,
    pub model: String,
    pub authorized: bool,
    pub state: String,
    pub is_rooted: bool,
}

/// Retrieves a list of connected devices with details.
pub fn get_devices() -> Result<Vec<DeviceInfo>, String> {
    let output = run_command(&["devices", "-l"])?;
    let mut devices = Vec::new();

    for line in output.lines().skip(1) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }

        let id = parts[0].to_string();
        let state = parts[1].to_string(); // device, unauthorized, offline, recovery, sideload

        let mut model = "Unknown Device".to_string();

        // Extract model:XXX
        for part in &parts {
            if part.starts_with("model:") {
                model = part.replace("model:", "").replace("_", " ");
            }
        }

        // Root Flag
        let mut is_rooted = false;
        if state == "device" {
            // Check for su binary. We ignore errors here.
            if let Ok(su_check) = run_command(&["-s", &id, "shell", "which", "su"]) {
                if !su_check.trim().is_empty() && !su_check.contains("not found") {
                    is_rooted = true;
                }
            }
        }

        devices.push(DeviceInfo {
            id,
            model,
            authorized: state == "device",
            state,
            is_rooted,
        });
    }

    Ok(devices)
}

pub fn is_device_rooted(device_id: &str) -> bool {
    // Check 1: 'su -c id'
    let output = run_command(&["-s", device_id, "shell", "su", "-c", "id"]);
    if let Ok(out) = output {
        if out.contains("uid=0(root)") {
            return true;
        }
    }

    // Check 2: properties
    let props = run_command(&["-s", device_id, "shell", "getprop", "ro.build.tags"]);
    if let Ok(tags) = props {
        if tags.contains("test-keys") {
            // High probability, but strictly 'su' is the gatekeeper
        }
    }

    false
}
