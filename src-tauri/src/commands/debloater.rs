use crate::adb;

// =====================================================================
// DEBLOATER KOMUTLARI
// =====================================================================

#[tauri::command]
pub fn list_all_packages(device_id: String) -> Result<Vec<adb::DebloaterPackage>, String> {
    adb::get_all_packages(&device_id)
}

#[tauri::command]
pub fn disable_pkg(device_id: String, package_name: String) -> Result<String, String> {
    adb::disable_package(&device_id, &package_name)
}

#[tauri::command]
pub fn enable_pkg(device_id: String, package_name: String) -> Result<String, String> {
    adb::enable_package(&device_id, &package_name)
}

#[tauri::command]
pub fn uninstall_pkg(device_id: String, package_name: String) -> Result<String, String> {
    adb::uninstall_package(&device_id, &package_name)
}

#[tauri::command]
pub fn reinstall_pkg(device_id: String, package_name: String) -> Result<String, String> {
    adb::reinstall_package(&device_id, &package_name)
}
