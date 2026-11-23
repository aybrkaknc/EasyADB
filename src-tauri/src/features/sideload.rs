//! ZIP/ROM sideload with progress and single APK install.

use std::sync::LazyLock;

use regex::Regex;
use tauri::{AppHandle, State};

use crate::adb::Device;
use crate::error::{AppError, AppResult, ErrorCode};
use crate::state::{AppState, blocking};
use crate::stream;
use crate::tasks::Reporter;

static PERCENT_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\(~?(\d{1,3})%\)").unwrap());

pub fn parse_percent(line: &str) -> Option<f64> {
    PERCENT_RE.captures(line)?.get(1)?.as_str().parse().ok()
}

/// adb exits with 1 and prints "failed to read command: Success" after a good sideload.
pub fn sideload_succeeded(code: Option<i32>, output: &str) -> bool {
    let lower = output.to_lowercase();
    code == Some(0)
        || lower.contains("failed to read command: success")
        || lower.contains("failed to read command: no error")
        || lower.contains("total xfer")
}

fn check_file(path: &str, extension: &str) -> AppResult<()> {
    let p = std::path::Path::new(path);
    let ok_ext = p
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case(extension));
    if !ok_ext {
        return Err(AppError::invalid_input(format!(
            "expected a .{extension} file"
        )));
    }
    if !p.is_file() {
        return Err(AppError::new(ErrorCode::NotFound, path));
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn sideload_zip(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    serial: String,
    path: String,
) -> AppResult<()> {
    let runner = state.runner()?;
    let task = state.tasks.start(&task_id);
    let reporter = Reporter::new(app, &task_id);
    let result = blocking(move || {
        check_file(&path, "zip")?;
        let child = Device::new(&*runner, &serial).spawn(&["sideload", &path])?;
        let mut output = String::new();
        let code = stream::run(&task, child, |_, line| {
            if let Some(pct) = parse_percent(&line) {
                reporter.progress("sideload", &path, pct, 100.0);
            }
            output.push_str(&line);
            output.push('\n');
        });
        let result = code.and_then(|code| {
            if sideload_succeeded(code, &output) {
                Ok(())
            } else {
                Err(AppError::from_adb_output(&output))
            }
        });
        reporter.finish(&result);
        result
    })
    .await;
    state.tasks.finish(&task_id);
    result
}

#[tauri::command]
#[specta::specta]
pub async fn install_apk(
    state: State<'_, AppState>,
    serial: String,
    path: String,
) -> AppResult<()> {
    let runner = state.runner()?;
    blocking(move || {
        check_file(&path, "apk")?;
        let out = Device::new(&*runner, &serial).adb_raw(&["install", "-r", &path])?;
        let text = format!("{}{}", out.stdout, out.stderr);
        if out.success && text.contains("Success") {
            Ok(())
        } else {
            Err(AppError::new(ErrorCode::InstallFailed, text.trim()))
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_progress() {
        assert_eq!(parse_percent("serving: 'update.zip'  (~45%)"), Some(45.0));
        assert_eq!(parse_percent("serving: 'update.zip'  (100%)"), Some(100.0));
        assert_eq!(parse_percent("Total xfer: 1.00x"), None);
    }

    #[test]
    fn treats_adb_quirk_as_success() {
        assert!(sideload_succeeded(Some(1), "Total xfer: 1.00x\n"));
        assert!(sideload_succeeded(
            Some(1),
            "adb: failed to read command: Success\n"
        ));
        assert!(!sideload_succeeded(
            Some(1),
            "adb: sideload connection failed: closed\n"
        ));
    }

    #[test]
    fn checks_file_extension() {
        assert!(check_file("C:/x/rom.img", "zip").is_err());
        assert_eq!(
            check_file("C:/missing/rom.zip", "zip").unwrap_err().code,
            ErrorCode::NotFound
        );
    }
}
