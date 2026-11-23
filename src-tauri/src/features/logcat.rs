//! Live logcat streaming in batches, optional recording to a file.

use std::io::{BufWriter, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;

use regex::Regex;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use crate::adb::Device;
use crate::error::{AppResult, ErrorCode};
use crate::state::{AppState, blocking};
use crate::stream;

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub time: String,
    pub pid: u32,
    pub tid: u32,
    pub level: String,
    pub tag: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct LogcatBatch {
    pub task_id: String,
    pub lines: Vec<LogLine>,
}

static LINE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(\d\d-\d\d \d\d:\d\d:\d\d\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.*?)\s*: (.*)$")
        .unwrap()
});

/// Parses one `logcat -v threadtime` line.
pub fn parse_line(line: &str) -> Option<LogLine> {
    let c = LINE_RE.captures(line)?;
    Some(LogLine {
        time: c[1].to_string(),
        pid: c[2].parse().ok()?,
        tid: c[3].parse().ok()?,
        level: c[4].to_string(),
        tag: c[5].trim().to_string(),
        message: c[6].to_string(),
    })
}

/// Streams logcat until the task is cancelled.
#[tauri::command]
#[specta::specta]
pub async fn start_logcat(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    serial: String,
    record_path: Option<String>,
) -> AppResult<()> {
    let runner = state.runner()?;
    let task = state.tasks.start(&task_id);
    let id = task_id.clone();
    let result = blocking(move || {
        let mut record = match record_path {
            Some(path) => Some(BufWriter::new(std::fs::File::create(path)?)),
            None => None,
        };
        let pending: Arc<Mutex<Vec<LogLine>>> = Arc::default();
        let done = Arc::new(AtomicBool::new(false));
        let flusher = {
            let (pending, done, app, id) = (pending.clone(), done.clone(), app.clone(), id.clone());
            std::thread::spawn(move || {
                while !done.load(Ordering::SeqCst) {
                    std::thread::sleep(Duration::from_millis(150));
                    let lines = std::mem::take(&mut *pending.lock().unwrap());
                    if !lines.is_empty() {
                        let _ = LogcatBatch {
                            task_id: id.clone(),
                            lines,
                        }
                        .emit(&app);
                    }
                }
            })
        };

        let child =
            Device::new(&*runner, &serial).spawn(&["logcat", "-v", "threadtime", "-T", "500"])?;
        let result = stream::run(&task, child, |_, line| {
            if let Some(file) = record.as_mut() {
                let _ = writeln!(file, "{line}");
            }
            if let Some(parsed) = parse_line(&line) {
                pending.lock().unwrap().push(parsed);
            }
        });
        if let Some(file) = record.as_mut() {
            file.flush()?;
        }
        done.store(true, Ordering::SeqCst);
        let _ = flusher.join();
        match result {
            Err(err) if err.code == ErrorCode::Cancelled => Ok(()),
            other => other.map(|_| ()),
        }
    })
    .await;
    state.tasks.finish(&task_id);
    result
}

#[tauri::command]
#[specta::specta]
pub async fn clear_logcat(state: State<'_, AppState>, serial: String) -> AppResult<()> {
    let runner = state.runner()?;
    blocking(move || {
        Device::new(&*runner, &serial)
            .adb(&["logcat", "-c"])
            .map(|_| ())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_threadtime_lines() {
        let line = "11-23 03:32:01.123  1234  5678 I ActivityManager: Start proc 4321:com.a/u0a1";
        let parsed = parse_line(line).unwrap();
        assert_eq!(parsed.pid, 1234);
        assert_eq!(parsed.tid, 5678);
        assert_eq!(parsed.level, "I");
        assert_eq!(parsed.tag, "ActivityManager");
        assert_eq!(parsed.message, "Start proc 4321:com.a/u0a1");

        let spaced = parse_line("01-01 00:00:00.000   1   2 E My Tag  : boom: x").unwrap();
        assert_eq!(
            (spaced.tag.as_str(), spaced.message.as_str()),
            ("My Tag", "boom: x")
        );

        assert!(parse_line("--------- beginning of main").is_none());
    }
}
