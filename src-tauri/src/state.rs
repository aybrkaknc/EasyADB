use std::sync::Arc;

use crate::adb::{Adb, AdbRunner};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::tasks::TaskRegistry;

pub struct AppState {
    runner: Result<Arc<dyn AdbRunner>, AppError>,
    pub tasks: TaskRegistry,
}

impl AppState {
    /// Locates adb next to the executable (installed app), or in `src-tauri/binaries` during
    /// `tauri dev`, where Tauri does not copy the sidecars next to the debug executable.
    pub fn new() -> Self {
        let mut dirs = Vec::new();
        if let Some(dir) = std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|d| d.to_path_buf()))
        {
            dirs.push(dir);
        }
        if cfg!(debug_assertions) {
            dirs.push(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries"));
        }
        let runner = Adb::from_dirs(&dirs).map(|adb| Arc::new(adb) as Arc<dyn AdbRunner>);
        Self {
            runner,
            tasks: TaskRegistry::default(),
        }
    }

    pub fn runner(&self) -> AppResult<Arc<dyn AdbRunner>> {
        self.runner.clone()
    }
}

/// Runs blocking work (adb calls, file IO) off the async runtime and logs failures.
pub async fn blocking<T, F>(work: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    let result = tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|err| AppError::new(ErrorCode::Internal, err.to_string()))
        .and_then(|inner| inner);
    if let Err(err) = &result {
        // A missing sidecar is logged once at startup; cancellations are not failures.
        if !matches!(err.code, ErrorCode::Cancelled | ErrorCode::AdbMissing) {
            log::warn!("{err}");
        }
    }
    result
}
