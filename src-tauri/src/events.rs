//! Typed events sent from Rust to the frontend.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

use crate::features::phone_batches::EndReason;

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
    /// The group the request belongs to, which the answer covers.
    pub batch: String,
    /// `app`, `folders`, `pull` or `speed`.
    pub kind: String,
    /// The first few packages, folders or backups.
    pub names: Vec<String>,
    /// The name the phone shows for the first app; empty when it sent none.
    pub label: String,
    /// Apps, folders or backups in all; megabytes for `speed`.
    pub count: u32,
    pub data: bool,
    pub obb: bool,
    pub external_data: bool,
    /// How long the user has to answer.
    pub seconds: u32,
}

/// A job that the phone asked for started, ended or failed.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct PhoneJobEvent {
    pub phone: String,
    pub model: String,
    pub batch: String,
    /// Place in the group, from 0.
    pub index: u32,
    pub size: u32,
    pub id: String,
    pub kind: String,
    pub names: Vec<String>,
    /// The name the phone shows for the app; empty when it sent none.
    pub label: String,
    /// What an app backup includes: `apk`, `obb`, `data`, `external`. Empty for other jobs.
    pub parts: Vec<String>,
    pub state: TaskState,
    pub error: Option<crate::error::AppError>,
    /// Who cancelled it, or that the connection was lost.
    pub reason: Option<EndReason>,
    /// What the job found out, as the notes the phone reads, e.g. `speed_to_pc:12.34`.
    pub notes: Vec<String>,
}

/// A group of phone requests is over, or a request was refused before it became one (no `batch`).
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct PhoneBatchEnd {
    pub phone: String,
    pub batch: String,
    pub reason: EndReason,
    pub detail: String,
}

/// The user wants to quit while jobs run.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
pub struct QuitAsk;

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
