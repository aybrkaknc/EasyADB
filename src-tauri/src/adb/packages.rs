use serde::{Deserialize, Serialize};

use super::process::run_command;

const MIN_VALID_APK_SIZE: u64 = 1024; // P3 #11: Magic number extracted to constant

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppPackage {
    pub name: String,
    pub path: String,
    pub is_system: bool,
}

pub fn get_packages(device_id: &str) -> Result<Vec<AppPackage>, String> {
    // 1. Get system packages list for categorization
    let system_output =
        match run_command(&["-s", device_id, "shell", "pm", "list", "packages", "-s"]) {
            Ok(out) => out,
            Err(_) => String::new(),
        };
    let system_packages: std::collections::HashSet<String> = system_output
        .lines()
        .filter_map(|l| l.strip_prefix("package:"))
        .map(|s| s.trim().to_string())
        .collect();

    // 2. Get all packages with paths
    let output = run_command(&["-s", device_id, "shell", "pm", "list", "packages", "-f"])?;
    let mut packages = Vec::new();

    // Output: package:/data/app/com.example.app/base.apk=com.example.app
    for line in output.lines() {
        let line = line.trim();
        if !line.starts_with("package:") {
            continue;
        }

        let content = line.trim_start_matches("package:");
        if let Some((path, name)) = content.rsplit_once('=') {
            let name = name.trim().to_string();
            let is_system = system_packages.contains(&name);

            packages.push(AppPackage {
                name,
                path: path.to_string(),
                is_system,
            });
        }
    }

    packages.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(packages)
}

pub fn get_package_size(device_id: &str, path: &str) -> Result<u64, String> {
    // Try 'stat -c %s' first (Linux/Android standard)
    // Output should be just the number representing bytes
    let output = run_command(&["-s", device_id, "shell", "stat", "-c", "%s", path]);

    if let Ok(out) = output {
        if let Ok(size) = out.trim().parse::<u64>() {
            return Ok(size);
        }
    }

    // Fallback: 'ls -l' (Format: -rw-r--r-- system system 12345 2023-01-01 12:00 base.apk)
    let output_ls = run_command(&["-s", device_id, "shell", "ls", "-l", path])?;
    let parts: Vec<&str> = output_ls.split_whitespace().collect();

    // Usually size is the 4th or 5th element depending on the ls implementation
    // -rw-r--r-- 1 system system 20117036 2023-11-20 18:27 /data/app/~~.../base.apk
    for part in parts {
        if let Ok(size) = part.parse::<u64>() {
            // Basic heuristic: APKs are rarely smaller than 10KB
            // and timestamps look like numbers too but usually smaller or huge if unix epoch
            if size > MIN_VALID_APK_SIZE {
                // P3 #11: Use constant
                return Ok(size);
            }
        }
    }

    Err("Could not determine file size".to_string())
}
