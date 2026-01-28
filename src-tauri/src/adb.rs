use chrono;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Write};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use zip::write::FileOptions;

const CREATE_NO_WINDOW: u32 = 0x08000000;
const MIN_VALID_APK_SIZE: u64 = 1024; // P3 #11: Magic number extracted to constant

#[derive(Serialize, Debug, Clone)]
pub struct DeviceInfo {
    pub id: String,
    pub model: String,
    pub authorized: bool,
    pub state: String,
    pub is_rooted: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppPackage {
    pub name: String,
    pub path: String,
    pub is_system: bool,
}

/// Initializes ADB by extracting binaries to a temporary directory.
/// Returns the path to the adb executable.
pub fn init() -> Result<PathBuf, String> {
    let temp_dir = env::temp_dir().join("easyadb_tools");

    if !temp_dir.exists() {
        fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;
    }

    let adb_exe = include_bytes!("../bin/adb.exe");
    let adb_api = include_bytes!("../bin/AdbWinApi.dll");
    let adb_usb = include_bytes!("../bin/AdbWinUsbApi.dll");

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

fn get_adb_path() -> PathBuf {
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

pub fn backup_package(
    device_id: &str,
    package: AppPackage,
    dest_path: PathBuf,
) -> Result<String, String> {
    // 1. Create a temporary folder for this backup
    let temp_backup_dir = env::temp_dir()
        .join("easyadb_processing")
        .join(&package.name);

    // Clean start
    if temp_backup_dir.exists() {
        fs::remove_dir_all(&temp_backup_dir).map_err(|e| e.to_string())?;
    }
    let apks_dir = temp_backup_dir.join("apks");
    let obb_dir = temp_backup_dir.join("obb");
    fs::create_dir_all(&apks_dir).map_err(|e| e.to_string())?;

    // 2. Identify Source Directory & Pull APKs
    // package.path is like "/data/app/~~randomString==/com.example.app-randomString==/base.apk"
    // We want the parent directory to get all splits.
    let base_path = std::path::Path::new(&package.path);
    let parent_dir = base_path
        .parent()
        .ok_or("Invalid package path structure")?
        .to_str()
        .ok_or("Invalid path string")?
        .replace("\\", "/"); // ADB uses forward slashes

    // Get list of APKs in that directory
    // "ls" output might differ by android version, but usually lists filenames
    let ls_output = run_command(&["-s", device_id, "shell", "ls", &parent_dir])?;
    let apk_files: Vec<&str> = ls_output
        .lines()
        .map(|l| l.trim())
        .filter(|l| l.ends_with(".apk"))
        .collect();

    if apk_files.is_empty() {
        // Fallback: Just pull the base path defined in package info
        // This handles cases where ls might fail or behave unexpectedly
        run_command(&[
            "-s",
            device_id,
            "pull",
            &package.path,
            apks_dir.join("base.apk").to_str().unwrap(),
        ])?;
    } else {
        // Pull all found APKs
        for apk in &apk_files {
            let source = format!("{}/{}", parent_dir, apk);
            let dest = apks_dir.join(apk);
            run_command(&["-s", device_id, "pull", &source, dest.to_str().unwrap()])?;
        }
    }

    // 3. Check & Pull OBB
    // OBB path: /sdcard/Android/obb/<package_name>
    let remote_obb_path = format!("/sdcard/Android/obb/{}", package.name);
    let obb_check = run_command(&["-s", device_id, "shell", "ls", "-d", &remote_obb_path]);

    let has_obb = if obb_check.is_ok() {
        fs::create_dir_all(&obb_dir).map_err(|e| e.to_string())?;
        // Simpler approach:
        // ADB Pull <remote> <local>
        // pull /sdcard/Android/obb/com.app temp/obb
        // result: temp/obb (folder) containing the files.
        let final_obb_target = temp_backup_dir.join("obb");
        // Ensure parent exists, but maybe remove the target dir first so ADB creates it?
        if final_obb_target.exists() {
            let _ = fs::remove_dir_all(&final_obb_target);
        }

        run_command(&[
            "-s",
            device_id,
            "pull",
            &remote_obb_path,
            final_obb_target.to_str().unwrap(),
        ])
        .is_ok() // Return true if successful
    } else {
        false
    };

    // 4. Check Root & Backup Data (/data/data)
    // Hybrid Mode: If rooted, backup application data
    let mut has_data = false;
    // Simple check if we can run su
    let su_check = run_command(&["-s", device_id, "shell", "su", "-c", "id"]);

    if su_check.is_ok() {
        let data_tar_remote = format!("/sdcard/easyadb_{}_data.tar.gz", package.name);

        // Construct tar command
        // We use -C /data/data so the archive contains just the package folder "com.example"
        // This makes restoring easier (extraction into /data/data)
        let tar_cmd = format!(
            "tar -czf {} -C /data/data {}",
            data_tar_remote, package.name
        );

        let tar_res = run_command(&["-s", device_id, "shell", "su", "-c", &tar_cmd]);

        if tar_res.is_ok() {
            let local_data_path = temp_backup_dir.join("data.tar.gz");

            // Pull the archive
            let pull_res = run_command(&[
                "-s",
                device_id,
                "pull",
                &data_tar_remote,
                local_data_path.to_str().unwrap(),
            ]);

            if pull_res.is_ok() && local_data_path.exists() {
                has_data = true;
                // Cleanup remote temp file
                let _ = run_command(&["-s", device_id, "shell", "rm", &data_tar_remote]);
            }
        }
    }

    // 5. Create metadata.json
    let metadata = serde_json::json!({
        "packageName": package.name,
        "originalPath": package.path,
        "backupDate": chrono::Local::now().to_rfc3339(),
        "version": "3.0", // Hybrid Format
        "isSplit": apk_files.len() > 1,
        "hasObb": has_obb,
        "hasData": has_data
    });
    let metadata_path = temp_backup_dir.join("metadata.json");
    fs::write(&metadata_path, metadata.to_string()).map_err(|e| e.to_string())?;

    // 6. Create ZIP file (.easybckp)
    let file = File::create(&dest_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = FileOptions::<()>::default().compression_method(zip::CompressionMethod::Stored);

    // Helper to add directory to zip
    // Rust 1.0+ workaround for recursion
    // We expect flat structure in apks/ and obb/ (usually)

    // Add APKs
    let apk_entries = fs::read_dir(&apks_dir).map_err(|e| e.to_string())?;
    for entry in apk_entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() {
            let name = path.file_name().unwrap().to_str().unwrap();
            let zip_path = format!("apks/{}", name);
            zip.start_file(zip_path, options)
                .map_err(|e| e.to_string())?;
            let mut f = File::open(&path).map_err(|e| e.to_string())?;
            let mut buffer = Vec::new();
            f.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
            zip.write_all(&buffer).map_err(|e| e.to_string())?;
        }
    }

    // Add OBBs (if any)
    if has_obb {
        let obb_final_path = temp_backup_dir.join("obb");
        if obb_final_path.exists() {
            let obb_entries = fs::read_dir(&obb_final_path).map_err(|e| e.to_string())?;
            for entry in obb_entries {
                let entry = entry.map_err(|e| e.to_string())?;
                let path = entry.path();
                if path.is_file() {
                    let name = path.file_name().unwrap().to_str().unwrap();
                    let zip_path = format!("obb/{}", name);
                    zip.start_file(zip_path, options)
                        .map_err(|e| e.to_string())?;
                    let mut f = File::open(&path).map_err(|e| e.to_string())?;
                    // Large file handling? Reading whole file to memory is risky for 2GB OBB.
                    // Ideally use stream copy.
                    // For now, let's stick to simple impl but warn user about memory.
                    // Actually, zip::write usually requires Write trait.
                    // Better verify buffer size or use copy.
                    std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    // Add Data Archive (if any)
    if has_data {
        let data_path = temp_backup_dir.join("data.tar.gz");
        if data_path.exists() {
            zip.start_file("data.tar.gz", options)
                .map_err(|e| e.to_string())?;
            let mut f = File::open(&data_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
        }
    }

    // Add metadata
    zip.start_file("metadata.json", options)
        .map_err(|e| e.to_string())?;
    let mut meta_content = File::open(&metadata_path).map_err(|e| e.to_string())?;
    std::io::copy(&mut meta_content, &mut zip).map_err(|e| e.to_string())?;

    zip.finish().map_err(|e| e.to_string())?;

    // 6. Cleanup temp
    let _ = fs::remove_dir_all(&temp_backup_dir);

    Ok(format!("Backup created at {:?}", dest_path))
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

/// Restores an application from a backup (.easybckp) file.
///
/// This function performs a comprehensive restore process:
/// 1. Extracts the backup archive to a temporary directory.
/// 2. Installs the APK (handles both split APKs and legacy single APKs).
/// 3. Restores OBB files if present.
/// 4. Restores application data (requires root access).
///
/// # Arguments
///
/// * `device_id` - The serial number of the target Android device.
/// * `backup_path` - The absolute path to the `.easybckp` file.
///
/// # Returns
///
/// * `Result<String, String>` - Success message or error description.
///
/// # Security
///
/// * Data restore requires root access (`su`).
/// * Automatically fixes permissions (`chown`) and SELinux context (`restorecon`) after data restore.
pub fn restore_package(device_id: &str, backup_path: PathBuf) -> Result<String, String> {
    // 1. Prepare temp dir for extraction
    let file_name = backup_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown_backup");
    let temp_restore_dir = env::temp_dir().join("easyadb_restore").join(file_name);

    // Clean start
    if temp_restore_dir.exists() {
        fs::remove_dir_all(&temp_restore_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&temp_restore_dir).map_err(|e| e.to_string())?;

    // 2. Unzip .easybckp
    let file = File::open(&backup_path).map_err(|e| format!("Failed to open backup: {}", e))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {}", e))?;

    archive
        .extract(&temp_restore_dir)
        .map_err(|e| format!("Failed to extract: {}", e))?;

    // 3. Analyze Structure (Legacy or Universal)
    let apks_dir = temp_restore_dir.join("apks");
    let legacy_apk_path = temp_restore_dir.join("base.apk");
    let obb_dir = temp_restore_dir.join("obb");

    // Read metadata if exists to get package name for OBB and Root Data flag
    let metadata_path = temp_restore_dir.join("metadata.json");
    let mut package_name = String::new();
    let mut has_data_archive = false;

    if metadata_path.exists() {
        if let Ok(content) = fs::read_to_string(&metadata_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(name) = json["packageName"].as_str() {
                    package_name = name.to_string();
                }
                if let Some(data) = json["hasData"].as_bool() {
                    has_data_archive = data;
                }
            }
        }
    }

    // Step 1: Install APKs
    let install_output = if apks_dir.exists() {
        // Universal Format (Folder of APKs)
        let entries = fs::read_dir(&apks_dir).map_err(|e| e.to_string())?;
        let mut apk_paths = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "apk") {
                apk_paths.push(path);
            }
        }

        if apk_paths.is_empty() {
            return Err("Invalid backup: No APKs found in apks/ directory".to_string());
        }

        if apk_paths.len() == 1 {
            // Single APK install
            run_command(&[
                "-s",
                device_id,
                "install",
                "-r",
                apk_paths[0].to_str().unwrap(),
            ])?
        } else {
            // Multiple APK install (Split APKs)
            let args = vec!["-s", device_id, "install-multiple", "-r"];
            let paths_str: Vec<String> = apk_paths
                .iter()
                .map(|p| p.to_str().unwrap().to_string())
                .collect();
            // We need string references that live long enough
            // run_command expects &[&str].
            // We need to build the arg list carefully.
            let mut final_args: Vec<&str> = args.clone();
            for p in &paths_str {
                final_args.push(p);
            }
            run_command(&final_args)?
        }
    } else if legacy_apk_path.exists() {
        // Legacy Format (Root base.apk)
        run_command(&[
            "-s",
            device_id,
            "install",
            "-r",
            legacy_apk_path.to_str().unwrap(),
        ])?
    } else {
        return Err("Invalid backup structure: No APKs found".to_string());
    };

    if !install_output.contains("Success") {
        return Err(format!("Install Failed: {}", install_output));
    }

    // Step 2: Restore OBB (if exists)
    if obb_dir.exists() && !package_name.is_empty() {
        // Target: /sdcard/Android/obb/<package_name>/
        let target_obb = format!("/sdcard/Android/obb/{}/", package_name);

        // Ensure directory exists
        let _ = run_command(&["-s", device_id, "shell", "mkdir", "-p", &target_obb]);

        // Push files
        let entries = fs::read_dir(&obb_dir).map_err(|e| e.to_string())?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_file() {
                let file_name = path.file_name().unwrap().to_str().unwrap();
                let remote_file_path = format!("{}{}", target_obb, file_name);
                run_command(&[
                    "-s",
                    device_id,
                    "push",
                    path.to_str().unwrap(),
                    &remote_file_path,
                ])?;
            }
        }
    }

    // Step 3: Restore Data (Root Only)
    let data_tar_path = temp_restore_dir.join("data.tar.gz");
    if has_data_archive && data_tar_path.exists() && !package_name.is_empty() {
        // Check root access
        if run_command(&["-s", device_id, "shell", "su", "-c", "id"]).is_ok() {
            let remote_tar_path = "/sdcard/easyadb_restore_data.tar.gz";

            run_command(&[
                "-s",
                device_id,
                "push",
                data_tar_path.to_str().unwrap(),
                remote_tar_path,
            ])?;

            // P1 #4: tar extract - backup'ta klasör yapısı {package_name}/... şeklinde
            // /data/data/{package_name} hedefine açıyoruz
            let extract_cmd = format!("tar -xzf {} -C /data/data", remote_tar_path);
            run_command(&["-s", device_id, "shell", "su", "-c", &extract_cmd])?;

            // P1 #5: Permission ve SELinux context düzeltmesi
            // Ownership'i uygulamanın UID'sine ayarla
            let chown_cmd = format!(
                "chown -R $(stat -c '%u:%g' /data/data/{0}/.) /data/data/{0}",
                package_name
            );
            let _ = run_command(&["-s", device_id, "shell", "su", "-c", &chown_cmd]);

            // SELinux context'i düzelt (Android 5.0+ için gerekli)
            let restorecon_cmd = format!("restorecon -R /data/data/{}", package_name);
            let _ = run_command(&["-s", device_id, "shell", "su", "-c", &restorecon_cmd]);

            // Cleanup remote temp file
            run_command(&["-s", device_id, "shell", "rm", remote_tar_path])?;
        }
    }
    Ok("Restore completed".to_string())
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

/// Start ADB Sideload with progress streaming
pub fn sideload_with_progress<F>(
    device_id: Option<&str>,
    path: &str,
    on_progress: F,
) -> Result<String, String>
where
    F: Fn(u32, String) + Send + 'static,
{
    let adb_path = get_adb_path();
    let mut args = Vec::new();

    if let Some(id) = device_id {
        args.push("-s");
        args.push(id);
    }
    args.push("sideload");
    args.push(path);

    let mut child = Command::new(adb_path)
        .args(&args)
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped()) // ADB usually prints progress to stdout, but sometimes mixed
        .spawn()
        .map_err(|e| format!("Failed to spawn sideload process: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

    let reader = BufReader::new(stdout);
    let re = Regex::new(r"\(~?(\d+)%\)").unwrap(); // Matches (~45%) or (45%)

    for line in reader.lines() {
        if let Ok(line) = line {
            // Parse percentage
            // Output format example: "serving: 'update.zip'  (~45%)"
            if let Some(caps) = re.captures(&line) {
                if let Some(pct_match) = caps.get(1) {
                    if let Ok(pct) = pct_match.as_str().parse::<u32>() {
                        on_progress(pct, line.clone());
                    }
                }
            } else {
                // Just log lines that don't match percentage (e.g. "Total xfer: ...")
                on_progress(0, line.clone());
            }
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Process error: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Sometimes ADB returns non-zero but succeeds (weird edge cases), but usually failure.
        return Err(format!("Sideload Failed: {}", stderr));
    }

    Ok("Sideload Complete".to_string())
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

// =====================================================================
// DEBLOATER FONKSİYONLARI
// =====================================================================

/// Debloater için genişletilmiş paket bilgisi
#[derive(Serialize, Debug, Clone)]
pub struct DebloaterPackage {
    pub name: String,
    pub is_system: bool,
    pub is_disabled: bool,
    pub is_uninstalled: bool,
    pub description: Option<String>,
    pub recommendation: Option<String>, // safe, advanced, unsafe, unknown
}

#[derive(Deserialize, Debug)]
struct KnowledgeEntry {
    id: String,
    description: String,
    recommendation: String,
}

fn load_knowledge_base() -> std::collections::HashMap<String, KnowledgeEntry> {
    let mut map = std::collections::HashMap::new();
    // In production, this path should be resolved relative to resource dir
    // For dev, we point to source.
    // Ideally, embed this into binary or use Tauri resource API
    // Let's rely on a fixed path relative to CWD for now or embedded string if small

    // Better approach: Embed the JSON string into the binary for speed and portability
    let json_content = include_str!("../assets/knowledge_base.json");

    if let Ok(entries) = serde_json::from_str::<Vec<KnowledgeEntry>>(json_content) {
        let count = entries.len();
        for entry in entries {
            map.insert(entry.id.clone(), entry);
        }
        println!("Knowledge base loaded: {} entries", count);
    } else {
        println!("FAILED to parse knowledge_base.json!");
    }
    map
}

/// Tüm paketleri listeler (sistem + kullanıcı + uninstalled).
/// Debloater modülü için.
pub fn get_all_packages(device_id: &str) -> Result<Vec<DebloaterPackage>, String> {
    // Yardımcı fonksiyon: Komut başarısız olursa loglar ama akışı kesmez
    let run_cmd_safe = |args: &[&str]| -> String {
        match run_command(args) {
            Ok(out) => out,
            Err(_) => String::new(), // Hata durumunda boş döndür
        }
    };

    // Tüm paketleri al (sadece yüklü olanlar) - Bu ana komut, başarısız olursa yine de devam etsin
    let installed_output = run_cmd_safe(&["-s", device_id, "shell", "pm", "list", "packages"]);
    let installed_packages: std::collections::HashSet<String> = installed_output
        .lines()
        .filter_map(|l| l.strip_prefix("package:"))
        .map(|s| s.trim().to_string())
        .collect();

    // Tüm paketleri al (uninstalled dahil, -u flag'i)
    // Eğer installed_output boşsa, muhtemelen ADB sorunu vardır ama yine de deneyelim
    let mut all_output = run_cmd_safe(&["-s", device_id, "shell", "pm", "list", "packages", "-u"]);

    // Eğer -u desteklenmiyorsa veya çıktı boşsa, installed listesini baz alalım
    if all_output.trim().is_empty() {
        all_output = installed_output;
    }

    // Sistem paketlerini al
    let system_output = run_cmd_safe(&["-s", device_id, "shell", "pm", "list", "packages", "-s"]);
    let system_packages: std::collections::HashSet<String> = system_output
        .lines()
        .filter_map(|l| l.strip_prefix("package:"))
        .map(|s| s.trim().to_string())
        .collect();

    // Devre dışı bırakılmış paketleri al
    let disabled_output = run_cmd_safe(&["-s", device_id, "shell", "pm", "list", "packages", "-d"]);
    let disabled_packages: std::collections::HashSet<String> = disabled_output
        .lines()
        .filter_map(|l| l.strip_prefix("package:"))
        .map(|s| s.trim().to_string())
        .collect();

    let mut packages = Vec::new();
    let knowledge_map = load_knowledge_base();

    for line in all_output.lines() {
        if let Some(name) = line.strip_prefix("package:") {
            let name = name.trim().to_string();
            let is_uninstalled = !installed_packages.contains(&name) && !name.is_empty();

            let (description, recommendation) = if let Some(entry) = knowledge_map.get(&name) {
                (
                    Some(entry.description.clone()),
                    Some(entry.recommendation.clone()),
                )
            } else {
                (None, None)
            };

            packages.push(DebloaterPackage {
                is_system: system_packages.contains(&name),
                is_disabled: disabled_packages.contains(&name),
                is_uninstalled,
                name,
                description,
                recommendation,
            });
        }
    }

    packages.sort_by(|a, b| a.name.cmp(&b.name));

    // Eğer hiç paket bulunamadıysa (kritik ADB hatası), o zaman hata dön
    if packages.is_empty() {
        return Err("No packages found. ADB connection failure or locked device.".to_string());
    }

    Ok(packages)
}

/// Bir paketi devre dışı bırakır (geri dönüşü kolay).
pub fn disable_package(device_id: &str, package_name: &str) -> Result<String, String> {
    run_command(&[
        "-s",
        device_id,
        "shell",
        "pm",
        "disable-user",
        "--user",
        "0",
        package_name,
    ])?;
    Ok(format!("Package '{}' disabled.", package_name))
}

/// Bir paketi etkinleştirir (devre dışı bırakılmış paketi geri açar).
pub fn enable_package(device_id: &str, package_name: &str) -> Result<String, String> {
    // --user 0 parametresi modern Android sürümlerinde izin sorunlarını aşmaya yardımcı olabilir
    run_command(&[
        "-s",
        device_id,
        "shell",
        "pm",
        "enable",
        "--user",
        "0",
        package_name,
    ])?;
    Ok(format!("Package '{}' enabled.", package_name))
}

/// Bir paketi kaldırır (mevcut kullanıcı için, cihazı bozmaz).
/// --user 0 ile system çökmez, fabrika ayarlarında geri gelir.
pub fn uninstall_package(device_id: &str, package_name: &str) -> Result<String, String> {
    run_command(&[
        "-s",
        device_id,
        "shell",
        "pm",
        "uninstall",
        "-k",
        "--user",
        "0",
        package_name,
    ])?;
    Ok(format!(
        "Package '{}' uninstalled for current user.",
        package_name
    ))
}

/// Önceden uninstall edilmiş bir paketi yeniden yükler.
/// Sadece --user 0 ile kaldırılmış paketler için çalışır.
pub fn reinstall_package(device_id: &str, package_name: &str) -> Result<String, String> {
    // Attempt 1: cmd package install-existing (Standard for newer Android)
    // We ignore the error here to try the fallback
    let output1 = run_command(&[
        "-s",
        device_id,
        "shell",
        "cmd",
        "package",
        "install-existing",
        package_name,
    ]);

    if output1.is_ok() {
        return Ok(format!(
            "Package '{}' reinstalled successfully.",
            package_name
        ));
    }

    // Attempt 2: pm install-existing (Legacy / Alternative)
    match run_command(&[
        "-s",
        device_id,
        "shell",
        "pm",
        "install-existing",
        package_name,
    ]) {
        Ok(_) => Ok(format!(
            "Package '{}' reinstalled (legacy method).",
            package_name
        )),
        Err(e) => {
            // If both failed, return a descriptive error
            Err(format!("Failed to reinstall '{}'. NOTE: User (Downloaded) apps cannot be restored via ADB if fully uninstalled. You must reinstall them from Play Store. Original Error: {}", package_name, e))
        }
    }
}
