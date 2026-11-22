use crate::adb;
use serde::Serialize;

#[tauri::command]
pub fn get_connected_devices() -> Result<Vec<adb::DeviceInfo>, String> {
    adb::get_devices()
}

#[tauri::command]
pub fn check_root_status(device_id: String) -> Result<bool, String> {
    Ok(adb::is_device_rooted(&device_id))
}

// =====================================================================
// DEVICE INTEGRITY CHECK
// =====================================================================

#[derive(Serialize, Clone)]
pub struct DeviceIntegrity {
    pub status: String, // STRONG, BASIC, FAIL
    pub bootloader_locked: bool,
    pub verified_boot: String, // green, yellow, orange, red
    pub selinux_enforcing: bool,
    pub debuggable: bool,
    pub secure: bool,
    pub details: Vec<String>,
}

#[tauri::command]
pub fn check_device_integrity(device_id: String) -> Result<DeviceIntegrity, String> {
    // Helper to get a single prop
    fn get_prop(device_id: &str, prop: &str) -> String {
        let output = std::process::Command::new("adb")
            .args(["-s", device_id, "shell", "getprop", prop])
            .output();
        match output {
            Ok(o) => String::from_utf8_lossy(&o.stdout).trim().to_string(),
            Err(_) => String::new(),
        }
    }

    let verified_boot = get_prop(&device_id, "ro.boot.verifiedbootstate");
    let flash_locked = get_prop(&device_id, "ro.boot.flash.locked");
    let vbmeta_state = get_prop(&device_id, "ro.boot.vbmeta.device_state");
    let debuggable = get_prop(&device_id, "ro.debuggable");
    let secure = get_prop(&device_id, "ro.secure");
    let selinux = get_prop(&device_id, "ro.boot.selinux");

    // Evaluate
    let bootloader_locked = flash_locked == "1" || vbmeta_state == "locked";
    let selinux_enforcing = selinux != "permissive";
    let is_debuggable = debuggable == "1";
    let is_secure = secure == "1";

    let mut details = Vec::new();
    let mut score = 0;

    // Bootloader
    if bootloader_locked {
        details.push("Bootloader: LOCKED ✓".to_string());
        score += 2;
    } else {
        details.push("Bootloader: UNLOCKED ✗".to_string());
    }

    // Verified Boot
    match verified_boot.as_str() {
        "green" => {
            details.push("Verified Boot: GREEN ✓".to_string());
            score += 2;
        }
        "yellow" => {
            details.push("Verified Boot: YELLOW (Custom key)".to_string());
            score += 1;
        }
        "orange" => {
            details.push("Verified Boot: ORANGE (Unlocked)".to_string());
        }
        "red" => {
            details.push("Verified Boot: RED (Corrupted)".to_string());
        }
        _ => {
            details.push(format!("Verified Boot: {} (Unknown)", verified_boot));
        }
    }

    // SELinux
    if selinux_enforcing {
        details.push("SELinux: ENFORCING ✓".to_string());
        score += 1;
    } else {
        details.push("SELinux: PERMISSIVE ✗".to_string());
    }

    // Debuggable
    if !is_debuggable {
        details.push("Debug Mode: OFF ✓".to_string());
        score += 1;
    } else {
        details.push("Debug Mode: ON ✗".to_string());
    }

    // Determine status
    let status = if score >= 5 {
        "STRONG".to_string()
    } else if score >= 3 {
        "BASIC".to_string()
    } else {
        "FAIL".to_string()
    };

    Ok(DeviceIntegrity {
        status,
        bootloader_locked,
        verified_boot,
        selinux_enforcing,
        debuggable: is_debuggable,
        secure: is_secure,
        details,
    })
}
