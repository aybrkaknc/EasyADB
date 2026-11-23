use std::sync::Arc;

use crate::adb::{Adb, AdbRunner};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::tasks::TaskRegistry;

pub struct AppState {
    runner: Result<Arc<dyn AdbRunner>, AppError>,
    pub tasks: TaskRegistry,
}

impl AppState {
    /// Locates the adb sidecar next to the running executable.
    pub fn new() -> Self {
        let runner = std::env::current_exe()
            .map_err(AppError::from)
            .and_then(|exe| {
                let dir = exe.parent().ok_or_else(|| {
                    AppError::new(ErrorCode::AdbMissing, "executable has no parent directory")
                })?;
                Adb::from_dir(dir)
            })
            .map(|adb| Arc::new(adb) as Arc<dyn AdbRunner>);
        Self {
            runner,
            tasks: TaskRegistry::default(),
        }
    }

    pub fn runner(&self) -> AppResult<Arc<dyn AdbRunner>> {
        self.runner.clone()
    }
}

/// Runs blocking work (adb calls, file IO) off the async runtime.
pub async fn blocking<T, F>(work: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|err| AppError::new(ErrorCode::Internal, err.to_string()))?
}
