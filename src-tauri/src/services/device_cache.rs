use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::adb;

/// Cihaz profili - paket listesi ve metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceProfile {
    pub serial: String,
    pub model: Option<String>,
    pub last_sync: String,
    pub packages: Vec<CachedPackage>,
}

/// Cache'lenmiş paket bilgisi
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedPackage {
    pub name: String,
    pub path: String,
    pub is_system: bool,
    pub is_disabled: bool,
    pub is_uninstalled: bool,
    pub label: Option<String>,
}

/// Senkronizasyon sonucu
#[derive(Debug, Clone, Serialize)]
pub struct SyncResult {
    pub added: Vec<String>,
    pub removed: Vec<String>,
    pub changed: Vec<String>,
    pub total: usize,
}

/// Device Cache yöneticisi
pub struct DeviceCache {
    cache_dir: PathBuf,
    profiles: Mutex<HashMap<String, DeviceProfile>>,
}

impl DeviceCache {
    pub fn new(app_handle: &AppHandle) -> Self {
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        let cache_dir = app_dir.join("device_profiles");

        // Klasör yoksa oluştur
        if !cache_dir.exists() {
            let _ = fs::create_dir_all(&cache_dir);
        }

        let mut profiles = HashMap::new();

        // Mevcut profilleri yükle
        if let Ok(entries) = fs::read_dir(&cache_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "json") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(profile) = serde_json::from_str::<DeviceProfile>(&content) {
                            profiles.insert(profile.serial.clone(), profile);
                        }
                    }
                }
            }
        }

        DeviceCache {
            cache_dir,
            profiles: Mutex::new(profiles),
        }
    }

    /// Cache'ten paketleri getir (anında döner)
    pub fn get_packages(&self, device_id: &str) -> Option<Vec<CachedPackage>> {
        let profiles = self.profiles.lock().unwrap();
        profiles.get(device_id).map(|p| p.packages.clone())
    }

    /// Profili güncelle ve diske kaydet
    pub fn update_profile(
        &self,
        device_id: &str,
        packages: Vec<CachedPackage>,
        model: Option<String>,
    ) {
        let now = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();

        let profile = DeviceProfile {
            serial: device_id.to_string(),
            model,
            last_sync: now,
            packages,
        };

        // Memory cache güncelle
        {
            let mut profiles = self.profiles.lock().unwrap();
            profiles.insert(device_id.to_string(), profile.clone());
        }

        // Diske yaz
        let file_path = self.cache_dir.join(format!("{}.json", device_id));
        if let Ok(json) = serde_json::to_string_pretty(&profile) {
            let _ = fs::write(file_path, json);
        }
    }

    /// Cihazla senkronize et ve diff döndür
    pub fn sync_with_device(&self, device_id: &str) -> Result<SyncResult, String> {
        // 1. Mevcut cache'i al
        let old_packages: HashMap<String, CachedPackage> = self
            .get_packages(device_id)
            .unwrap_or_default()
            .into_iter()
            .map(|p| (p.name.clone(), p))
            .collect();

        // 2. ADB'den güncel listeyi al
        let live_packages = adb::get_all_packages(device_id)?;

        // 3. Diff hesapla
        let live_names: std::collections::HashSet<String> =
            live_packages.iter().map(|p| p.name.clone()).collect();
        let old_names: std::collections::HashSet<String> = old_packages.keys().cloned().collect();

        let added: Vec<String> = live_names.difference(&old_names).cloned().collect();
        let removed: Vec<String> = old_names.difference(&live_names).cloned().collect();

        // Durum değişikliklerini kontrol et (disabled/uninstalled)
        let mut changed: Vec<String> = Vec::new();
        for pkg in &live_packages {
            if let Some(old) = old_packages.get(&pkg.name) {
                if old.is_disabled != pkg.is_disabled || old.is_uninstalled != pkg.is_uninstalled {
                    changed.push(pkg.name.clone());
                }
            }
        }

        // 4. Cache'i güncelle
        let cached_packages: Vec<CachedPackage> = live_packages
            .into_iter()
            .map(|p| CachedPackage {
                name: p.name,
                path: String::new(), // DebloaterPackage'da path yok
                is_system: p.is_system,
                is_disabled: p.is_disabled,
                is_uninstalled: p.is_uninstalled,
                label: None,
            })
            .collect();

        let total = cached_packages.len();
        self.update_profile(device_id, cached_packages, None);

        Ok(SyncResult {
            added,
            removed,
            changed,
            total,
        })
    }

    /// Backup modülü için paketleri senkronize et
    pub fn sync_backup_packages(&self, device_id: &str) -> Result<Vec<CachedPackage>, String> {
        let live_packages = adb::get_packages(device_id)?;

        let cached_packages: Vec<CachedPackage> = live_packages
            .into_iter()
            .map(|p| CachedPackage {
                name: p.name,
                path: p.path,
                is_system: p.is_system,
                is_disabled: false,
                is_uninstalled: false,
                label: None,
            })
            .collect();

        self.update_profile(device_id, cached_packages.clone(), None);
        Ok(cached_packages)
    }
}
