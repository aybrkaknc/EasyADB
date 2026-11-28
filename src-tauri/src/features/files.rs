//! Device file manager: list, create, delete, rename, pull and push.

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, State};

use crate::adb::{Device, shell};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::features::phone_jobs::{self, Incoming, Pc};
use crate::features::phone_requests;
use crate::features::transfer::{self, TransferReport};
use crate::state::{AppState, blocking};
use crate::tasks::{Reporter, TaskHandle};

#[derive(Debug, Clone, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_link: bool,
    pub size: f64,
    /// Unix seconds.
    pub modified: f64,
}

fn join(dir: &str, name: &str) -> String {
    if dir.ends_with('/') {
        format!("{dir}{name}")
    } else {
        format!("{dir}/{name}")
    }
}

/// Parses `type/link/size/mtime/name` lines. Names cannot contain `/`, so the split is unambiguous.
pub fn parse_listing(dir: &str, output: &str) -> Vec<FileEntry> {
    let mut entries: Vec<FileEntry> = output
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(5, '/');
            let (kind, link, size, mtime, name) = (
                parts.next()?,
                parts.next()?,
                parts.next()?,
                parts.next()?,
                parts.next()?,
            );
            (!name.is_empty()).then(|| FileEntry {
                path: join(dir, name),
                name: name.to_string(),
                is_dir: kind == "d",
                is_link: link == "1",
                size: size.parse().unwrap_or(0.0),
                modified: mtime.parse().unwrap_or(0.0),
            })
        })
        .collect();
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    entries
}

pub fn list(device: Device, dir: &str) -> AppResult<Vec<FileEntry>> {
    shell::validate_device_path(dir)?;
    let script = format!(
        "cd {} || exit 1; for f in * .[!.]* ..?*; do if [ -e \"$f\" ] || [ -L \"$f\" ]; then \
         if [ -d \"$f\" ]; then t=d; else t=f; fi; if [ -L \"$f\" ]; then l=1; else l=0; fi; \
         echo \"$t/$l/$(stat -c '%s/%Y' \"$f\" 2>/dev/null || echo 0/0)/$f\"; fi; done",
        shell::quote(dir)
    );
    Ok(parse_listing(dir, &device.script(&script)?))
}

/// Refuses the root and first-level folders such as `/sdcard` itself.
fn validate_mutable(path: &str) -> AppResult<()> {
    shell::validate_device_path(path)?;
    let depth = path.split('/').filter(|p| !p.is_empty()).count();
    if depth < 2 {
        return Err(AppError::new(ErrorCode::InvalidPath, path));
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn list_files(
    state: State<'_, AppState>,
    serial: String,
    path: String,
) -> AppResult<Vec<FileEntry>> {
    let runner = state.runner()?;
    blocking(move || list(Device::new(&*runner, &serial), &path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn make_dir(state: State<'_, AppState>, serial: String, path: String) -> AppResult<()> {
    let runner = state.runner()?;
    blocking(move || {
        validate_mutable(&path)?;
        Device::new(&*runner, &serial)
            .shell(&["mkdir", "-p", &path])
            .map(|_| ())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_paths(
    state: State<'_, AppState>,
    serial: String,
    paths: Vec<String>,
) -> AppResult<()> {
    let runner = state.runner()?;
    blocking(move || {
        let device = Device::new(&*runner, &serial);
        for path in &paths {
            validate_mutable(path)?;
        }
        for path in &paths {
            device.shell(&["rm", "-rf", "--", path])?;
        }
        Ok(())
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn move_path(
    state: State<'_, AppState>,
    serial: String,
    from: String,
    to: String,
) -> AppResult<()> {
    let runner = state.runner()?;
    blocking(move || {
        validate_mutable(&from)?;
        validate_mutable(&to)?;
        Device::new(&*runner, &serial)
            .shell(&["mv", "--", &from, &to])
            .map(|_| ())
    })
    .await
}

/// The bytes of each file, or of everything in each folder.
#[tauri::command]
#[specta::specta]
pub async fn get_path_sizes(
    state: State<'_, AppState>,
    serial: String,
    paths: Vec<String>,
) -> AppResult<Vec<f64>> {
    let runner = state.runner()?;
    blocking(move || transfer::sizes(Device::new(&*runner, &serial), &paths)).await
}

/// Copies device paths into a local folder.
#[tauri::command]
#[specta::specta]
pub async fn pull_paths(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    serial: String,
    paths: Vec<String>,
    local_dir: String,
) -> AppResult<TransferReport> {
    let runner = state.runner()?;
    // Keeps the PC awake, asks before the app is closed and holds back the phone's own jobs.
    let _hold = state.requests.hold(&serial)?;
    let task = state.tasks.start(&task_id);
    let reporter = Reporter::new(app, &task_id);
    let result = blocking(move || {
        let device = Device::new(&*runner, &serial);
        let result = transfer::pull(device, &paths, &local_dir, &task, &reporter);
        reporter.finish(&result);
        result
    })
    .await;
    state.tasks.finish(&task_id);
    result
}

/// Copies local files or folders into a device folder.
#[tauri::command]
#[specta::specta]
pub async fn push_paths(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    serial: String,
    paths: Vec<String>,
    remote_dir: String,
) -> AppResult<TransferReport> {
    let runner = state.runner()?;
    let _hold = state.requests.hold(&serial)?;
    let task = state.tasks.start(&task_id);
    let reporter = Reporter::new(app.clone(), &task_id);
    let result = blocking(move || {
        let device = Device::new(&*runner, &serial);
        let pc = Pc {
            id: phone_requests::pc_id(&app),
            name: phone_requests::pc_name(),
        };
        let result = send(device, &pc, &paths, &remote_dir, &task, &reporter);
        reporter.finish(&result);
        result
    })
    .await;
    state.tasks.finish(&task_id);
    result
}

/// Sends files after the phone allowed it, where it can be asked.
fn send(
    device: Device,
    pc: &Pc,
    paths: &[String],
    target: &str,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<TransferReport> {
    let upload = transfer::plan(device, paths, target, task)?;
    let incoming = Incoming {
        names: upload.items.iter().map(|i| i.name.as_str()).collect(),
        target,
        bytes: upload.total,
    };
    let Some(phone) = phone_jobs::ask_to_receive(device, pc, &incoming, task, reporter)? else {
        return Ok(transfer::push(
            device,
            &upload,
            task,
            reporter,
            &|_, _, _| {},
        ));
    };
    let (mut report, stopped_there) = phone.follow(
        device,
        task,
        |watch| transfer::push(device, &upload, task, reporter, watch),
        |report| report.error.is_none(),
    );
    if stopped_there && report.error.is_some() {
        report.error = Some(AppError::new(ErrorCode::Cancelled, "phone"));
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adb::fake::FakeAdb;

    #[test]
    fn parses_and_sorts_listing() {
        let out =
            "f/0/1024/1700000000/b.txt\nd/0/3488/1700000001/Download\nd/1/0/0/link dir\nf/0/0/0/\n";
        let entries = parse_listing("/sdcard", out);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].name, "Download");
        assert!(entries[1].is_link && entries[1].is_dir);
        assert_eq!(entries[1].path, "/sdcard/link dir");
        assert_eq!(entries[2].size, 1024.0);
    }

    #[test]
    fn quotes_listing_path() {
        let fake = FakeAdb::new().on("shell", "");
        list(Device::new(&fake, "X"), "/sdcard/My Files").unwrap();
        assert!(fake.calls()[0].contains("cd '/sdcard/My Files'"));
    }

    #[test]
    fn protects_top_level_paths() {
        assert!(validate_mutable("/sdcard/Download/x").is_ok());
        for bad in ["/", "/sdcard", "/sdcard/../system", "sdcard/x"] {
            assert!(validate_mutable(bad).is_err(), "{bad}");
        }
    }
}
