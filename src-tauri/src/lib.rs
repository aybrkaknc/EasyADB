mod adb;
mod device_cache;
mod package_db;
mod seed_data;

use serde::Serialize;
use std::fs;
use std::time::SystemTime;
use tauri::{Emitter, Manager, State};

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
fn perform_backup(
    device_id: String,
    package: adb::AppPackage,
    custom_path: Option<String>,
) -> Result<String, String> {
    // Kullanıcı custom path verdiyse onu kullan, yoksa Downloads
    let backup_dir = if let Some(path) = custom_path {
        let p = std::path::PathBuf::from(path);
        // Klasör yoksa oluştur
        if !p.exists() {
            std::fs::create_dir_all(&p)
                .map_err(|e| format!("Failed to create backup directory: {}", e))?;
        }
        p
    } else {
        dirs::download_dir().ok_or_else(|| "Could not find Downloads directory".to_string())?
    };

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let filename = format!("{}_{}.easybckp", package.name, timestamp);
    let dest_path = backup_dir.join(filename);

    adb::backup_package(&device_id, package, dest_path)
}

#[tauri::command]
fn get_default_backup_path() -> Result<String, String> {
    dirs::download_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not find Downloads directory".to_string())
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

#[tauri::command]
fn check_root_status(device_id: String) -> Result<bool, String> {
    Ok(adb::is_device_rooted(&device_id))
}

// =====================================================================
// DEVICE CACHE COMMANDS (Instant Load + Background Sync)
// =====================================================================

#[tauri::command]
fn get_cached_packages(
    state: State<'_, device_cache::DeviceCache>,
    device_id: String,
) -> Result<Option<Vec<device_cache::CachedPackage>>, String> {
    Ok(state.inner().get_packages(&device_id))
}

#[tauri::command]
fn sync_device_packages(
    state: State<'_, device_cache::DeviceCache>,
    device_id: String,
) -> Result<device_cache::SyncResult, String> {
    state.inner().sync_with_device(&device_id)
}

#[tauri::command]
fn sync_backup_packages(
    state: State<'_, device_cache::DeviceCache>,
    device_id: String,
) -> Result<Vec<device_cache::CachedPackage>, String> {
    state.inner().sync_backup_packages(&device_id)
}

// =====================================================================
// PACKAGE LABEL RESOLUTION (With Self-Learning Database)
// =====================================================================

#[tauri::command]
async fn resolve_package_label(
    state: State<'_, package_db::PackageDB>,
    package_name: String,
) -> Result<Option<String>, String> {
    // 1. Local Database Lookup (Fast Cache)
    if let Some(name) = state.inner().get(&package_name) {
        return Ok(Some(name));
    }

    // 2. Online Lookup (Google Play Store)
    let url = format!(
        "https://play.google.com/store/apps/details?id={}&hl=en",
        package_name
    );
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    match client.get(&url).send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                if let Ok(html) = resp.text().await {
                    let document = scraper::Html::parse_document(&html);
                    let title_selector = scraper::Selector::parse("h1[itemprop='name']").unwrap();

                    if let Some(element) = document.select(&title_selector).next() {
                        let raw_title = element.text().collect::<Vec<_>>().join("");
                        let title = raw_title.trim().to_string();

                        // 3. Cache and Persist
                        state.inner().insert(package_name, title.clone());
                        return Ok(Some(title));
                    }

                    // Alternative selector
                    let alt_selector = scraper::Selector::parse("h1").unwrap();
                    if let Some(element) = document.select(&alt_selector).next() {
                        let raw_title = element.text().collect::<Vec<_>>().join("");
                        let title = raw_title.trim().to_string();
                        if !title.is_empty() && title.len() < 100 {
                            state.inner().insert(package_name, title.clone());
                            return Ok(Some(title));
                        }
                    }
                }
            }
        }
        Err(_) => {}
    }

    Ok(None)
}

// =====================================================================
// TAURI APP ENTRY POINT
// =====================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: None,
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .level(log::LevelFilter::Info)
                .filter(|metadata| {
                    // Filter out verbose logs from html parsing libraries
                    !metadata.target().starts_with("html5ever")
                        && !metadata.target().starts_with("scraper")
                        && !metadata.target().starts_with("selectors")
                })
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
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
            perform_sideload,
            check_root_status,
            resolve_package_label,
            get_cached_packages,
            sync_device_packages,
            sync_backup_packages,
            get_default_backup_path
        ])
        .setup(|app| {
            // Initialize PackageDB
            let db = package_db::PackageDB::new(app.handle());
            app.manage(db);

            // Initialize DeviceCache
            let device_cache = device_cache::DeviceCache::new(app.handle());
            app.manage(device_cache);

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
