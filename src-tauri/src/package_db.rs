use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

// Seed data modülünü import ediyoruz (lib.rs module olarak export edecek)
use crate::seed_data;

pub struct PackageDB {
    file_path: PathBuf,
    cache: Mutex<HashMap<String, String>>,
}

impl PackageDB {
    pub fn new(app_handle: &AppHandle) -> Self {
        // App Data dizini: Windows: %AppData%/com.easy-adb/
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));

        // Klasör yoksa oluştur
        if !app_dir.exists() {
            let _ = fs::create_dir_all(&app_dir);
        }

        let file_path = app_dir.join("package_db.json");
        let mut cache = HashMap::new();

        // 1. Önce Seed Data'yı yükle (Her zaman base olarak bulunsun)
        let seed = seed_data::get_seed_data();
        cache.extend(seed);

        // 2. Varsa diskteki JSON'u yükle ve üzerine yaz (Kullanıcı verisi daha güncel olabilir)
        if file_path.exists() {
            if let Ok(content) = fs::read_to_string(&file_path) {
                if let Ok(json_map) = serde_json::from_str::<HashMap<String, String>>(&content) {
                    cache.extend(json_map);
                }
            }
        } else {
            // Dosya yoksa, seed datayı diske yazarak başlat
            if let Ok(json_str) = serde_json::to_string_pretty(&cache) {
                let _ = fs::write(&file_path, json_str);
            }
        }

        PackageDB {
            file_path,
            cache: Mutex::new(cache),
        }
    }

    pub fn get(&self, package_name: &str) -> Option<String> {
        let cache = self.cache.lock().unwrap();
        cache.get(package_name).cloned()
    }

    pub fn insert(&self, package_name: String, label: String) {
        let mut cache = self.cache.lock().unwrap();
        cache.insert(package_name, label);

        // Değişikliği asenkron kaydetmek daha iyi olurdu ama şimdilik senkron kaydedelim
        // (Veri küçük olduğu için sorun olmaz)
        if let Ok(json_str) = serde_json::to_string_pretty(&*cache) {
            let _ = fs::write(&self.file_path, json_str);
        }
    }
}
