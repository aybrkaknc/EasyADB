mod backup;
mod debloater;
mod device;
mod packages;
mod process;
mod sideload;
mod tools;

pub use backup::*;
pub use debloater::*;
pub use device::*;
pub use packages::*;
pub use process::*;
pub use sideload::*;
pub use tools::*;

use std::env;
use std::fs;
use std::path::PathBuf;

/// Initializes ADB by extracting binaries to a temporary directory.
/// Returns the path to the adb executable.
pub fn init() -> Result<PathBuf, String> {
    let temp_dir = env::temp_dir().join("easyadb_tools");

    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;
    }

    let adb_exe = include_bytes!("../../bin/adb.exe");
    let adb_api = include_bytes!("../../bin/AdbWinApi.dll");
    let adb_usb = include_bytes!("../../bin/AdbWinUsbApi.dll");

    let adb_path = temp_dir.join("adb.exe");
    let dll_api_path = temp_dir.join("AdbWinApi.dll");
    let dll_usb_path = temp_dir.join("AdbWinUsbApi.dll");

    if !adb_path.exists() {
        fs::write(&adb_path, adb_exe).map_err(|e| format!("Failed to write adb.exe: {}", e))?;
    }
    if !dll_api_path.exists() {
        fs::write(&dll_api_path, adb_api)
            .map_err(|e| format!("Failed to write AdbWinApi.dll: {}", e))?;
    }
    if !dll_usb_path.exists() {
        fs::write(&dll_usb_path, adb_usb)
            .map_err(|e| format!("Failed to write AdbWinUsbApi.dll: {}", e))?;
    }

    Ok(adb_path)
}
