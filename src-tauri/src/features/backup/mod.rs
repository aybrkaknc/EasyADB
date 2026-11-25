//! Backup and restore commands.

mod appops;
mod archive;
pub mod create;
pub mod fileset;
pub mod folders;
pub mod manifest;
mod permissions;
pub mod phone;
pub mod restore;
mod transfer;

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, State};

use crate::adb::Device;
use crate::error::{AppError, AppResult};
use crate::features::device;
use crate::features::settings::backup_root;
use crate::state::{AppState, blocking};
use crate::tasks::Reporter;
use create::{BackupOptions, Job};
use manifest::BackupSummary;
use restore::{RestoreOptions, RestoreReport};

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BackupOutcome {
    pub package: String,
    pub id: Option<String>,
    pub error: Option<AppError>,
    /// App data was requested but could not be backed up (no root or root denied).
    /// The app itself was still backed up.
    pub data_skipped: bool,
}

#[tauri::command]
#[specta::specta]
pub async fn list_backups(app: AppHandle) -> AppResult<Vec<BackupSummary>> {
    blocking(move || Ok(manifest::list(&backup_root(&app)?))).await
}

#[tauri::command]
#[specta::specta]
pub async fn start_backup(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    serial: String,
    packages: Vec<String>,
    options: BackupOptions,
) -> AppResult<Vec<BackupOutcome>> {
    let runner = state.runner()?;
    let task = state.tasks.start(&task_id);
    let reporter = Reporter::new(app.clone(), &task_id);
    let result = blocking(move || {
        let root = backup_root(&app)?;
        let device = Device::new(&*runner, &serial);
        let snapshot = create::snapshot(device);
        let job = Job {
            device,
            root: &root,
            task: &task,
            reporter: &reporter,
            snapshot: &snapshot,
            has_root: options.include_data && device::check_root(device),
        };
        let mut outcomes = Vec::new();
        for package in packages {
            if task.is_cancelled() {
                break;
            }
            let outcome = match create::create(&job, &package, &options) {
                Ok(created) => {
                    crate::features::phone_requests::record_pc_backup(device, &created.dir);
                    BackupOutcome {
                        id: created
                            .dir
                            .file_name()
                            .map(|n| n.to_string_lossy().into_owned()),
                        package,
                        error: None,
                        data_skipped: created.data_skipped,
                    }
                }
                Err(err) => BackupOutcome {
                    package,
                    id: None,
                    error: Some(err),
                    data_skipped: false,
                },
            };
            outcomes.push(outcome);
        }
        let result = if task.is_cancelled() {
            Err(AppError::cancelled())
        } else {
            Ok(outcomes)
        };
        reporter.finish(&result);
        result
    })
    .await;
    state.tasks.finish(&task_id);
    result
}

#[tauri::command]
#[specta::specta]
pub async fn start_restore(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    serial: String,
    backup_id: String,
    options: RestoreOptions,
) -> AppResult<RestoreReport> {
    let runner = state.runner()?;
    let task = state.tasks.start(&task_id);
    let reporter = Reporter::new(app.clone(), &task_id);
    let result = blocking(move || {
        let dir = manifest::resolve(&backup_root(&app)?, &backup_id)?;
        let result = restore::restore(
            Device::new(&*runner, &serial),
            &dir,
            &options,
            &task,
            &reporter,
        );
        reporter.finish(&result);
        result
    })
    .await;
    state.tasks.finish(&task_id);
    result
}

/// EasyAndroid backups that are on the phone, for the "copy to PC" prompt.
#[tauri::command]
#[specta::specta]
pub async fn list_phone_backups(
    app: AppHandle,
    state: State<'_, AppState>,
    serial: String,
) -> AppResult<Vec<phone::PhoneBackup>> {
    let runner = state.runner()?;
    blocking(move || {
        let root = backup_root(&app)?;
        Ok(phone::list(Device::new(&*runner, &serial), &root))
    })
    .await
}

/// System snapshot files (`system_*.json`) on the phone that are not on the PC yet.
#[tauri::command]
#[specta::specta]
pub async fn list_phone_system(
    app: AppHandle,
    state: State<'_, AppState>,
    serial: String,
) -> AppResult<Vec<String>> {
    let runner = state.runner()?;
    blocking(move || {
        let root = backup_root(&app)?;
        Ok(phone::list_system(Device::new(&*runner, &serial), &root))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn pull_phone_backups(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    serial: String,
    ids: Vec<String>,
    system: Vec<String>,
) -> AppResult<Vec<phone::PullOutcome>> {
    let runner = state.runner()?;
    let task = state.tasks.start(&task_id);
    let reporter = Reporter::new(app.clone(), &task_id);
    let result = blocking(move || {
        let root = backup_root(&app)?;
        let result = phone::pull(
            Device::new(&*runner, &serial),
            &root,
            &ids,
            &system,
            &task,
            &reporter,
        );
        reporter.finish(&result);
        result
    })
    .await;
    state.tasks.finish(&task_id);
    result
}

/// Messages, call logs, folders and wallpapers on the PC, from `files.json` backups.
#[tauri::command]
#[specta::specta]
pub async fn list_file_sets(app: AppHandle) -> AppResult<Vec<fileset::FileSetSummary>> {
    blocking(move || Ok(fileset::list(&backup_root(&app)?))).await
}

/// Removes backups from the phone after checking that the PC holds the same, intact copy.
#[tauri::command]
#[specta::specta]
pub async fn delete_phone_backups(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    serial: String,
    ids: Vec<String>,
) -> AppResult<Vec<phone::PullOutcome>> {
    let runner = state.runner()?;
    let task = state.tasks.start(&task_id);
    let reporter = Reporter::new(app.clone(), &task_id);
    let result = blocking(move || {
        let root = backup_root(&app)?;
        let result = phone::delete_on_phone(
            Device::new(&*runner, &serial),
            &root,
            &ids,
            &task,
            &reporter,
        );
        reporter.finish(&result);
        result
    })
    .await;
    state.tasks.finish(&task_id);
    result
}

/// Copies a backup from the PC into the phone's backup folder, for EasyAndroid to restore.
#[tauri::command]
#[specta::specta]
pub async fn push_backup_to_phone(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    serial: String,
    backup_id: String,
) -> AppResult<()> {
    let runner = state.runner()?;
    let task = state.tasks.start(&task_id);
    let reporter = Reporter::new(app.clone(), &task_id);
    let result = blocking(move || {
        let root = backup_root(&app)?;
        let result = phone::push(
            Device::new(&*runner, &serial),
            &root,
            &backup_id,
            &task,
            &reporter,
        );
        reporter.finish(&result);
        result
    })
    .await;
    state.tasks.finish(&task_id);
    result
}

/// Streams folders of the phone's shared storage into one backup on the PC.
#[tauri::command]
#[specta::specta]
pub async fn start_folder_backup(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    serial: String,
    names: Vec<String>,
) -> AppResult<String> {
    let runner = state.runner()?;
    let task = state.tasks.start(&task_id);
    let reporter = Reporter::new(app.clone(), &task_id);
    let result = blocking(move || {
        let root = backup_root(&app)?;
        let device = Device::new(&*runner, &serial);
        let snapshot = create::snapshot(device);
        let result = folders::stream(
            device,
            &root,
            &names,
            &snapshot,
            device::check_root(device),
            &task,
            &reporter,
        );
        reporter.finish(&result);
        result
    })
    .await;
    state.tasks.finish(&task_id);
    result
}

#[tauri::command]
#[specta::specta]
pub async fn delete_backup(app: AppHandle, backup_id: String) -> AppResult<()> {
    blocking(move || {
        let dir = manifest::resolve(&backup_root(&app)?, &backup_id)?;
        Ok(std::fs::remove_dir_all(dir)?)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn export_backup(app: AppHandle, backup_id: String, dest: String) -> AppResult<()> {
    blocking(move || {
        let dir = manifest::resolve(&backup_root(&app)?, &backup_id)?;
        archive::export(&dir, std::path::Path::new(&dest))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn import_backup(app: AppHandle, src: String) -> AppResult<String> {
    blocking(move || {
        let dir = archive::import(std::path::Path::new(&src), &backup_root(&app)?)?;
        Ok(dir
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default())
    })
    .await
}
