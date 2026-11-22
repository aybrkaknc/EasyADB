use crate::adb;
use serde::Serialize;
use tauri::Emitter;


#[derive(Clone, Serialize)]
struct SideloadProgress {
    percentage: u32,
    message: String,
}

#[tauri::command]
pub async fn perform_sideload(
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
