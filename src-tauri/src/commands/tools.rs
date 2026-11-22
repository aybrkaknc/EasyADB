use crate::adb;

#[tauri::command]
pub fn run_adb_command(device_id: Option<String>, command: String) -> Result<String, String> {
    adb::execute_unified_command(device_id.as_deref(), &command)
}

#[tauri::command]
pub fn check_tools() -> adb::ToolsStatus {
    adb::check_tools_status()
}

#[tauri::command]
pub async fn install_tools() -> Result<String, String> {
    adb::install_platform_tools()
}
