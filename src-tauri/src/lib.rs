mod adb;

use serde::Serialize;
use std::fs;
use std::time::SystemTime;
use tauri::Emitter;

#[derive(Clone, Serialize)]
struct SideloadProgress {
    percentage: u32,
    message: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct BackupFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub date: String,
}

#[tauri::command]
fn get_connected_devices() -> Result<Vec<adb::DeviceInfo>, String> {
    adb::get_devices()
}

#[tauri::command]
fn list_packages(device_id: String) -> Result<Vec<adb::AppPackage>, String> {
    adb::get_packages(&device_id)
}

#[tauri::command]
fn perform_backup(device_id: String, package: adb::AppPackage) -> Result<String, String> {
    let download_dir =
        dirs::download_dir().ok_or_else(|| "Could not find Downloads directory".to_string())?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let filename = format!("{}_{}.easybckp", package.name, timestamp);
    let dest_path = download_dir.join(filename);

    adb::backup_package(&device_id, package, dest_path)
}

#[tauri::command]
fn get_package_size(device_id: String, package: adb::AppPackage) -> Result<u64, String> {
    adb::get_package_size(&device_id, &package.path)
}

#[tauri::command]
fn list_backups() -> Result<Vec<BackupFile>, String> {
    let download_dir =
        dirs::download_dir().ok_or_else(|| "Could not find Downloads directory".to_string())?;

    let mut backups = Vec::new();

    if let Ok(entries) = fs::read_dir(download_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "easybckp" {
                        let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
                        let created = metadata.created().unwrap_or(SystemTime::now());
                        let datetime: chrono::DateTime<chrono::Local> = created.into();

                        backups.push(BackupFile {
                            name: path
                                .file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string(),
                            path: path.to_string_lossy().to_string(),
                            size: metadata.len(),
                            date: datetime.format("%Y-%m-%d %H:%M:%S").to_string(),
                        });
                    }
                }
            }
        }
    }

    // Sort by date descending (newest first)
    backups.sort_by(|a, b| b.date.cmp(&a.date));

    Ok(backups)
}

#[tauri::command]
fn perform_restore(device_id: String, backup_path: String) -> Result<String, String> {
    let path = std::path::PathBuf::from(backup_path);
    if !path.exists() {
        return Err("Backup file not found".to_string());
    }
    adb::restore_package(&device_id, path)
}

#[tauri::command]
fn run_adb_command(device_id: Option<String>, command: String) -> Result<String, String> {
    adb::execute_unified_command(device_id.as_deref(), &command)
}

#[tauri::command]
fn check_tools() -> adb::ToolsStatus {
    adb::check_tools_status()
}

#[tauri::command]
async fn install_tools() -> Result<String, String> {
    adb::install_platform_tools()
}

// =====================================================================
// DEBLOATER KOMUTLARI
// =====================================================================

#[tauri::command]
fn list_all_packages(device_id: String) -> Result<Vec<adb::DebloaterPackage>, String> {
    adb::get_all_packages(&device_id)
}

#[tauri::command]
fn disable_pkg(device_id: String, package_name: String) -> Result<String, String> {
    adb::disable_package(&device_id, &package_name)
}

#[tauri::command]
fn enable_pkg(device_id: String, package_name: String) -> Result<String, String> {
    adb::enable_package(&device_id, &package_name)
}

#[tauri::command]
fn uninstall_pkg(device_id: String, package_name: String) -> Result<String, String> {
    adb::uninstall_package(&device_id, &package_name)
}

#[tauri::command]
fn reinstall_pkg(device_id: String, package_name: String) -> Result<String, String> {
    adb::reinstall_package(&device_id, &package_name)
}

#[tauri::command]
fn delete_backup(path: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(path);
    if !path.exists() {
        return Err("Backup file not found".to_string());
    }
    fs::remove_file(path).map_err(|e| format!("Failed to delete backup: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn perform_sideload(
    app: tauri::AppHandle,
    device_id: Option<String>,
    path: String,
) -> Result<String, String> {
    let app_handle = app.clone();

    // Offload blocking ADB process to a separate thread preventing UI freeze
    let result = tauri::async_runtime::spawn_blocking(move || {
        adb::sideload_with_progress(device_id.as_deref(), &path, move |pct, msg| {
            // Emit event to frontend: "sideload-progress"
            let _ = app_handle.emit(
                "sideload-progress",
                SideloadProgress {
                    percentage: pct,
                    message: msg,
                },
            );
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    Ok(result)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            get_connected_devices,
            list_packages,
            perform_backup,
            get_package_size,
            list_backups,
            perform_restore,
            run_adb_command,
            check_tools,
            install_tools,
            list_all_packages,
            disable_pkg,
            enable_pkg,
            uninstall_pkg,
            reinstall_pkg,
            delete_backup,
            perform_sideload
        ])
        .setup(|_app| {
            match adb::init() {
                Ok(path) => {
                    log::info!("ADB initialized at: {:?}", path);
                }
                Err(e) => {
                    log::error!("Failed to initialize ADB: {}", e);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
