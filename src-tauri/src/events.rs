//! Typed events sent from Rust to the frontend.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum TaskState {
    Running,
    Done,
    Failed,
    Cancelled,
}

/// Progress of a long-running task. `stage` is a stable key the frontend translates.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct TaskProgress {
    pub task_id: String,
    pub state: TaskState,
    pub stage: String,
    pub item: String,
    pub current: f64,
    pub total: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum StreamKind {
    Stdout,
    Stderr,
    Exit,
}

/// One chunk of output from a streaming command (terminal, sideload).
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct CommandOutput {
    pub task_id: String,
    pub kind: StreamKind,
    pub text: String,
    pub exit_code: Option<i32>,
}
