//! Registry of running tasks so the frontend can cancel them.

use std::collections::HashMap;
use std::process::Child;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::AppHandle;
use tauri_specta::Event;

use crate::error::{AppError, AppResult};
use crate::events::{TaskProgress, TaskState};

#[derive(Default)]
pub struct TaskHandle {
    cancelled: AtomicBool,
    child: Mutex<Option<Child>>,
}

impl TaskHandle {
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    #[cfg(test)]
    pub fn cancel_for_test(&self) {
        self.cancel();
    }

    /// Returns `Err(Cancelled)` once the task has been cancelled.
    pub fn check(&self) -> AppResult<()> {
        if self.is_cancelled() {
            Err(AppError::cancelled())
        } else {
            Ok(())
        }
    }

    /// Keeps a child process so cancelling the task kills it.
    pub fn attach(&self, child: Child) {
        *self.child.lock().unwrap() = Some(child);
    }

    pub fn detach(&self) -> Option<Child> {
        self.child.lock().unwrap().take()
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        if let Some(child) = self.child.lock().unwrap().as_mut() {
            let _ = child.kill();
        }
    }
}

#[derive(Default)]
pub struct TaskRegistry {
    tasks: Mutex<HashMap<String, Arc<TaskHandle>>>,
}

impl TaskRegistry {
    pub fn start(&self, id: &str) -> Arc<TaskHandle> {
        let handle = Arc::new(TaskHandle::default());
        self.tasks
            .lock()
            .unwrap()
            .insert(id.to_string(), handle.clone());
        handle
    }

    pub fn cancel(&self, id: &str) -> bool {
        match self.tasks.lock().unwrap().get(id) {
            Some(handle) => {
                handle.cancel();
                true
            }
            None => false,
        }
    }

    pub fn finish(&self, id: &str) {
        self.tasks.lock().unwrap().remove(id);
    }
}

/// Emits progress events for one task.
pub struct Reporter {
    app: Option<AppHandle>,
    task_id: String,
}

impl Reporter {
    pub fn new(app: AppHandle, task_id: &str) -> Self {
        Self {
            app: Some(app),
            task_id: task_id.to_string(),
        }
    }

    /// A reporter that emits nothing, for tests.
    #[cfg(test)]
    pub fn silent() -> Self {
        Self {
            app: None,
            task_id: String::new(),
        }
    }

    pub fn progress(&self, stage: &str, item: &str, current: f64, total: f64) {
        self.emit(TaskState::Running, stage, item, current, total);
    }

    pub fn finish(&self, result: &AppResult<impl Sized>) {
        let state = match result {
            Ok(_) => TaskState::Done,
            Err(err) if err.code == crate::error::ErrorCode::Cancelled => TaskState::Cancelled,
            Err(_) => TaskState::Failed,
        };
        self.emit(state, "", "", 0.0, 0.0);
    }

    fn emit(&self, state: TaskState, stage: &str, item: &str, current: f64, total: f64) {
        if let Some(app) = &self.app {
            let event = TaskProgress {
                task_id: self.task_id.clone(),
                state,
                stage: stage.to_string(),
                item: item.to_string(),
                current,
                total,
            };
            let _ = event.emit(app);
        }
    }
}
