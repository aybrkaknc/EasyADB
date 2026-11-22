use crate::adb;
use serde::Serialize;
use std::fs;
use std::time::SystemTime;

#[derive(Serialize, Debug, Clone)]
/// IMPORTANT: Keep this in sync with `src/types/adb.ts` -> `BackupFile`
pub struct BackupFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub date: String,
}

#[tauri::command]
pub fn list_packages(device_id: String) -> Result<Vec<adb::AppPackage>, String> {
    adb::get_packages(&device_id)
}

#[tauri::command]
pub fn perform_backup(
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
pub fn get_default_backup_path() -> Result<String, String> {
    dirs::download_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not find Downloads directory".to_string())
}

#[tauri::command]
pub fn get_package_size(device_id: String, package: adb::AppPackage) -> Result<u64, String> {
    adb::get_package_size(&device_id, &package.path)
}

#[tauri::command]
pub fn list_backups(custom_path: Option<String>) -> Result<Vec<BackupFile>, String> {
    // custom_path verilmişse onu kullan, yoksa Downloads klasörü
    let backup_dir = if let Some(path) = custom_path {
        let p = std::path::PathBuf::from(&path);
        if !p.exists() {
            // Klasör yoksa boş liste dön (hata değil)
            return Ok(Vec::new());
        }
        p
    } else {
        dirs::download_dir().ok_or_else(|| "Could not find Downloads directory".to_string())?
    };

    let mut backups = Vec::new();

    if let Ok(entries) = fs::read_dir(&backup_dir) {
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
pub fn perform_restore(device_id: String, backup_path: String) -> Result<String, String> {
    let path = std::path::PathBuf::from(backup_path);
    if !path.exists() {
        return Err("Backup file not found".to_string());
    }
    adb::restore_package(&device_id, path)
}

#[tauri::command]
pub fn delete_backup(path: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(path);
    if !path.exists() {
        return Err("Backup file not found".to_string());
    }
    fs::remove_file(path).map_err(|e| format!("Failed to delete backup: {}", e))?;
    Ok(())
}
