use std::env;
use std::fs;
use std::fs::File;
use std::io::{Read, Write};
use std::path::PathBuf;
use zip::write::FileOptions;

use super::packages::AppPackage;
use super::process::run_command;

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
