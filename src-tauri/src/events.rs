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

/// A phone that has not been trusted yet asks the PC to do a job.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct PhoneRequestAsk {
    /// `ro.serialno` of the phone, which is what trust is kept under.
    pub phone: String,
    pub model: String,
    pub id: String,
    /// `app`, `folders` or `pull`.
    pub kind: String,
    /// The package for `app`, otherwise empty.
    pub package: String,
    pub count: u32,
}

/// A job that the phone asked for started, ended or failed.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct PhoneJobEvent {
    pub phone: String,
    pub id: String,
    pub kind: String,
    pub package: String,
    pub state: TaskState,
    pub error: Option<crate::error::AppError>,
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
