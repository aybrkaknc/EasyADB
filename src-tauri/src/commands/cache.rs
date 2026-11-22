use crate::services::device_cache;
use tauri::State;

// =====================================================================
// DEVICE CACHE COMMANDS (Instant Load + Background Sync)
// =====================================================================

#[tauri::command]
pub fn get_cached_packages(
    state: State<'_, device_cache::DeviceCache>,
    device_id: String,
) -> Result<Option<Vec<device_cache::CachedPackage>>, String> {
    Ok(state.inner().get_packages(&device_id))
}

#[tauri::command]
pub fn sync_device_packages(
    state: State<'_, device_cache::DeviceCache>,
    device_id: String,
) -> Result<device_cache::SyncResult, String> {
    state.inner().sync_with_device(&device_id)
}

#[tauri::command]
pub fn sync_backup_packages(
    state: State<'_, device_cache::DeviceCache>,
    device_id: String,
) -> Result<Vec<device_cache::CachedPackage>, String> {
    state.inner().sync_backup_packages(&device_id)
}
