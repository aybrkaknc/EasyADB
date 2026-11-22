use serde::Serialize;
use std::env;
use std::fs;
use std::os::windows::process::CommandExt;
use std::process::Command;

use super::process::{get_adb_path, CREATE_NO_WINDOW};

#[derive(Serialize, Clone)]
pub struct ToolsStatus {
    pub adb: bool,
    pub fastboot: bool,
}

pub fn check_tools_status() -> ToolsStatus {
    let adb_path = get_adb_path();
    let adb_exists = adb_path.exists();

    let temp_fastboot = env::temp_dir().join("easyadb_tools").join("fastboot.exe");
    // Check if fastboot exists in temp or in system PATH
    let fb_exists = temp_fastboot.exists()
        || Command::new("fastboot")
            .arg("--version")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);

    ToolsStatus {
        adb: adb_exists,
        fastboot: fb_exists,
    }
}

pub fn install_platform_tools() -> Result<String, String> {
    let target_dir = env::temp_dir().join("easyadb_tools");
    if !target_dir.exists() {
        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
    }

    // PowerShell script to download and extract platform-tools
    // URL: https://dl.google.com/android/repository/platform-tools-latest-windows.zip
    let script = format!(
        r#"
        $ProgressPreference = 'SilentlyContinue';
        cd "{0}";
        Invoke-WebRequest -Uri "https://dl.google.com/android/repository/platform-tools-latest-windows.zip" -OutFile "tools.zip";
        Expand-Archive -Path "tools.zip" -DestinationPath "temp_extract" -Force;
        Copy-Item -Path "temp_extract\platform-tools\*" -Destination "." -Recurse -Force;
        Remove-Item "tools.zip" -Force;
        Remove-Item "temp_extract" -Recurse -Force;
        "#,
        target_dir.to_string_lossy()
    );

    let output = Command::new("powershell")
        .args(&["-NoProfile", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to execute installer: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok("Platform Tools installed successfully.".to_string())
}
