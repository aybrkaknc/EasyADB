use std::env;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

pub(super) const CREATE_NO_WINDOW: u32 = 0x08000000;

pub(super) fn get_adb_path() -> PathBuf {
    env::temp_dir().join("easyadb_tools").join("adb.exe")
}

/// Executes a raw ADB command with arguments.
pub fn run_command(args: &[&str]) -> Result<String, String> {
    let adb_path = get_adb_path();

    let output = Command::new(adb_path)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to execute process: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ADB Command Failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    // Some ADB commands return success even if internal logic fails (e.g. Permission Denied in shell)
    let lower_stdout = stdout.to_lowercase();
    if lower_stdout.contains("permission denied")
        || lower_stdout.contains("not found")
        || lower_stdout.contains("failed to")
        || lower_stdout.contains("error:")
    {
        if !args.contains(&"shell") || lower_stdout.contains("error:") {
            return Err(format!("ADB Internal Error: {}", stdout.trim()));
        }
    }

    Ok(stdout)
}

/// Executes a Fastboot command.
pub fn run_fastboot_command(args: &[&str]) -> Result<String, String> {
    // Try to find fastboot in the temp dir first, otherwise assume global PATH
    let temp_fastboot = env::temp_dir().join("easyadb_tools").join("fastboot.exe");
    let program = if temp_fastboot.exists() {
        temp_fastboot.to_string_lossy().to_string()
    } else {
        "fastboot".to_string()
    };

    let output = Command::new(program)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to execute fastboot: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Fastboot Command Failed: {}", stderr.trim()));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Executes either ADB or Fastboot command based on input.
pub fn execute_unified_command(device_id: Option<&str>, command: &str) -> Result<String, String> {
    let parts: Vec<&str> = command.split_whitespace().collect();
    if parts.is_empty() {
        return Err("Empty command".to_string());
    }

    let tool = parts[0];

    if tool == "fastboot" {
        // Fastboot commands usually ignore device ID unless specific scenarios (multiple devices)
        // For simplicity, we run fastboot commands directly as typed
        // Usage: fastboot devices, fastboot reboot
        return run_fastboot_command(&parts[1..]);
    } else {
        // ADB Command
        // If device_id is present, we prepend -s <id>
        // But if tool is "adb", we should strip it because run_command calls adb binary

        let mut final_args = Vec::new();

        if let Some(id) = device_id {
            final_args.push("-s");
            final_args.push(id);
        }

        // Handle "adb shell ls" -> "shell ls" or "shell ls" -> "shell ls"
        let start_index = if tool == "adb" { 1 } else { 0 };
        final_args.extend_from_slice(&parts[start_index..]);

        return run_command(&final_args);
    }
}
