//! Registry of running tasks so the frontend can cancel them.

use std::collections::HashMap;
use std::process::Child;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

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

    pub fn cancel(&self) {
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

    /// Cancels everything that runs, before the app ends.
    pub fn cancel_all(&self) {
        for handle in self.tasks.lock().unwrap().values() {
            handle.cancel();
        }
    }

    pub fn finish(&self, id: &str) {
        self.tasks.lock().unwrap().remove(id);
    }
}

/// Called with the stage, item and progress of every update.
pub type Observer = Arc<dyn Fn(&str, &str, f64, f64) + Send + Sync>;

/// The frontend gets at most one update of the same step in this time.
const EVENT_GAP: Duration = Duration::from_millis(100);

/// The step that was last sent, and when.
type Sent = Option<(String, String, Instant)>;

/// Emits progress events for one task.
pub struct Reporter {
    app: Option<AppHandle>,
    task_id: String,
    observer: Option<Observer>,
    last: Mutex<Sent>,
}

/// Whether an update is worth an event: a new step always is, the same step only now and then.
fn is_due(last: &mut Sent, stage: &str, item: &str, now: Instant) -> bool {
    let due = match last {
        Some((s, i, at)) => s != stage || i != item || now.duration_since(*at) >= EVENT_GAP,
        None => true,
    };
    if due {
        *last = Some((stage.to_string(), item.to_string(), now));
    }
    due
}

impl Reporter {
    pub fn new(app: AppHandle, task_id: &str) -> Self {
        Self {
            app: Some(app),
            task_id: task_id.to_string(),
            observer: None,
            last: Mutex::new(None),
        }
    }

    /// Also tells `observer` about every update, for jobs that report to the phone.
    pub fn observed(mut self, observer: Observer) -> Self {
        self.observer = Some(observer);
        self
    }

    /// A reporter that emits nothing, for tests.
    #[cfg(test)]
    pub fn silent() -> Self {
        Self {
            app: None,
            task_id: String::new(),
            observer: None,
            last: Mutex::new(None),
        }
    }

    pub fn progress(&self, stage: &str, item: &str, current: f64, total: f64) {
        if let Some(observer) = &self.observer {
            observer(stage, item, current, total);
        }
        if is_due(&mut self.last.lock().unwrap(), stage, item, Instant::now()) {
            self.emit(TaskState::Running, stage, item, current, total);
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_same_step_is_reported_now_and_then() {
        let start = Instant::now();
        let mut last = None;
        let at = |ms| start + Duration::from_millis(ms);
        assert!(is_due(&mut last, "apk", "a", at(0)));
        assert!(!is_due(&mut last, "apk", "a", at(50)));
        assert!(is_due(&mut last, "data", "a", at(60)));
        assert!(is_due(&mut last, "data", "b", at(70)));
        assert!(!is_due(&mut last, "data", "b", at(80)));
        assert!(is_due(&mut last, "data", "b", at(200)));
    }
}
