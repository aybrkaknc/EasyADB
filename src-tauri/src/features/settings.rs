use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::error::{AppError, AppResult, ErrorCode};
use crate::state::AppState;
use crate::store::{self, Settings};

#[tauri::command]
#[specta::specta]
pub fn get_settings(app: AppHandle) -> Settings {
    store::settings(&app)
}

#[tauri::command]
#[specta::specta]
pub fn save_settings(app: AppHandle, settings: Settings) -> AppResult<()> {
    apply_logging(settings.file_logging);
    store::save(&app, "settings", &settings)
}

pub fn apply_logging(enabled: bool) {
    let level = if enabled {
        log::LevelFilter::Info
    } else {
        log::LevelFilter::Off
    };
    log::set_max_level(level);
}

/// Resolves the effective backup folder and creates it if needed.
pub fn backup_root(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    let dir = match store::settings(app).backup_dir {
        Some(dir) => std::path::PathBuf::from(dir),
        None => app.path().document_dir()?.join("EasyADB").join("Backups"),
    };
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[tauri::command]
#[specta::specta]
pub fn get_backup_root(app: AppHandle) -> AppResult<String> {
    Ok(backup_root(&app)?.display().to_string())
}

#[tauri::command]
#[specta::specta]
pub fn open_log_dir(app: AppHandle) -> AppResult<()> {
    let dir = app.path().app_log_dir()?;
    std::fs::create_dir_all(&dir)?;
    app.opener()
        .open_path(dir.display().to_string(), None::<&str>)
        .map_err(|err| AppError::new(ErrorCode::Io, err.to_string()))
}

/// Shows a file or folder selected in Windows Explorer.
#[tauri::command]
#[specta::specta]
pub fn reveal_path(app: AppHandle, path: String) -> AppResult<()> {
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|err| AppError::new(ErrorCode::Io, err.to_string()))
}

/// Opens a Google search through Windows' "Open with" dialog so the user picks the browser.
/// Only Google search links are accepted; the link goes into a local redirect page.
#[tauri::command]
#[specta::specta]
pub fn open_web_search(app: AppHandle, url: String) -> AppResult<()> {
    if !url.starts_with("https://www.google.com/search?") {
        return Err(AppError::invalid_input(url));
    }
    let target = url.replace('&', "&amp;").replace('"', "&quot;");
    let page = app.path().temp_dir()?.join("EasyADB-web-search.html");
    std::fs::write(
        &page,
        format!(
            "<!doctype html><meta charset=\"utf-8\"><meta http-equiv=\"refresh\" content=\"0; url={target}\">"
        ),
    )?;
    std::process::Command::new("rundll32")
        .arg("shell32.dll,OpenAs_RunDLL")
        .arg(&page)
        .spawn()?;
    Ok(())
}

/// Writes text chosen by the user through a save dialog (log and terminal exports).
#[tauri::command]
#[specta::specta]
pub fn save_text_file(path: String, content: String) -> AppResult<()> {
    Ok(std::fs::write(path, content)?)
}

#[tauri::command]
#[specta::specta]
pub fn cancel_task(state: State<'_, AppState>, task_id: String) -> bool {
    state.tasks.cancel(&task_id)
}
