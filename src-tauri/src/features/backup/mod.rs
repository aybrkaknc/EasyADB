//! Backup and restore commands.

mod archive;
pub mod create;
pub mod manifest;
mod permissions;
pub mod restore;
mod transfer;

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, State};

use crate::adb::Device;
use crate::error::{AppError, AppResult};
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
        };
        let mut outcomes = Vec::new();
        for package in packages {
            if task.is_cancelled() {
                break;
            }
            let outcome = match create::create(&job, &package, &options) {
                Ok(created) => BackupOutcome {
                    id: created
                        .dir
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned()),
                    package,
                    error: None,
                    data_skipped: created.data_skipped,
                },
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
