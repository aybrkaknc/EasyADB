//! Backups that the phone makes for the PC: messages, call logs, wallpapers and system settings.
//!
//! These are made by EasyAndroid, as root, so EasyADB leaves it a job in the shared folder, waits
//! for it to say that it is done and then copies what it made. See "Posta kutusu" in
//! `docs/specs/EASYANDROID_INTEROP.md`.

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::adb::{Device, shell};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::features::backup::phone::{self, PullOutcome};
use crate::features::device::EASYANDROID_PACKAGE;
use crate::features::phone_requests::BOX;
use crate::features::settings::backup_root;
use crate::features::system_backup;
use crate::state::{AppState, blocking};
use crate::tasks::{Reporter, TaskHandle};

const JOB_FORMAT: &str = "easyandroid-job";
const KINDS: [&str; 3] = ["messages", "calls", "wallpaper"];
const TIMEOUT: Duration = Duration::from_secs(30 * 60);
/// How long the phone gets to start the job before the app is opened on its screen.
const START_WAIT: Duration = Duration::from_secs(15);
const CANCEL_WAIT: Duration = Duration::from_secs(20);

#[derive(Debug, Deserialize, PartialEq)]
struct JobStatus {
    id: String,
    state: String,
    #[serde(default)]
    stage: String,
    #[serde(default)]
    item: String,
    #[serde(default)]
    done: u64,
    #[serde(default)]
    total: u64,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    notes: Vec<String>,
}

fn job_json(id: &str, created: u64, kind: &str, kinds: &[String]) -> String {
    serde_json::json!({
        "format": JOB_FORMAT,
        "version": 1,
        "id": id,
        "created": created,
        "type": kind,
        "kinds": kinds,
    })
    .to_string()
}

fn parse_status(text: &str, id: &str) -> Option<JobStatus> {
    serde_json::from_str::<JobStatus>(text.trim())
        .ok()
        .filter(|s| s.id == id)
}

/// The backups a finished job made: folder names and system snapshot names.
fn made(notes: &[String]) -> (Vec<String>, Vec<String>) {
    let mut ids = Vec::new();
    let mut system = Vec::new();
    for note in notes {
        match note.split_once(':') {
            Some(("id", name)) if phone::is_id(name) => ids.push(name.to_string()),
            Some(("system", name)) if system_backup::is_file_name(name) => {
                system.push(name.to_string())
            }
            _ => {}
        }
    }
    (ids, system)
}

/// The progress key that the frontend knows for a stage that EasyAndroid names.
fn stage_key(stage: &str) -> &'static str {
    match stage {
        "apk" => "apk",
        "obb" => "obb",
        "data" => "data",
        "verify" => "verify",
        "settings" => "system",
        _ => "files",
    }
}

fn adb_script(device: Device, script: &str) -> AppResult<String> {
    device.script(script)
}

/// Hands one job to EasyAndroid and waits for it. Returns the notes of the finished job.
fn one_job(
    device: Device,
    kind: &str,
    kinds: &[String],
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<Vec<String>> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let now: u64 = device
        .shell(&["date", "+%s"])?
        .trim()
        .parse()
        .map_err(|_| AppError::new(ErrorCode::AdbFailed, "phone clock"))?;
    let id = format!("pc-{now}-{}", COUNTER.fetch_add(1, Ordering::SeqCst));
    let json = job_json(&id, now, kind, kinds);
    adb_script(
        device,
        &format!(
            "mkdir -p {BOX}; chmod 0770 {BOX}; rm -f {BOX}/job-status.json {BOX}/job-cancel; \
             printf %s {} > {BOX}/job.tmp && mv {BOX}/job.tmp {BOX}/job.json",
            shell::quote(&json)
        ),
    )?;
    let cleanup = || {
        let _ = device.script(&format!(
            "rm -f {BOX}/job.json {BOX}/job-status.json {BOX}/job-cancel"
        ));
    };

    // The service is private to EasyAndroid; root may start it, and the app itself is the way in
    // when that is not allowed.
    let service =
        format!("am start-foreground-service --user 0 -n {EASYANDROID_PACKAGE}/.job.JobService");
    let _ = device.su(&service);
    let started = Instant::now();
    let mut opened = false;
    let mut cancelled_at: Option<Instant> = None;
    let mut seen = false;
    let result = loop {
        std::thread::sleep(Duration::from_secs(1));
        if task.is_cancelled() && cancelled_at.is_none() {
            let _ = device.script(&format!(
                "printf %s {} > {BOX}/job-cancel",
                shell::quote(&id)
            ));
            cancelled_at = Some(Instant::now());
        }
        let text = device
            .script(&format!("cat {BOX}/job-status.json 2>/dev/null"))
            .unwrap_or_default();
        if let Some(status) = parse_status(&text, &id) {
            seen = true;
            match status.state.as_str() {
                "done" => break Ok(status.notes),
                "cancelled" => break Err(AppError::cancelled()),
                "failed" => {
                    break Err(AppError::new(
                        ErrorCode::AdbFailed,
                        status.error.unwrap_or_default(),
                    ));
                }
                _ => reporter.progress(
                    stage_key(&status.stage),
                    &status.item,
                    status.done as f64,
                    status.total as f64,
                ),
            }
        }
        if let Some(at) = cancelled_at {
            if at.elapsed() > CANCEL_WAIT {
                break Err(AppError::cancelled());
            }
        }
        if !seen && !opened && started.elapsed() > START_WAIT {
            opened = true;
            let _ = device.shell(&[
                "am",
                "start",
                "--user",
                "0",
                "-n",
                &format!("{EASYANDROID_PACKAGE}/.MainActivity"),
            ]);
        }
        if started.elapsed() > TIMEOUT {
            break Err(AppError::new(
                ErrorCode::AdbFailed,
                "the phone did not finish",
            ));
        }
    };
    cleanup();
    result
}

/// Asks EasyAndroid for the backups and copies them to the PC. A system snapshot never holds
/// Wi-Fi passwords here, because the phone leaves the networks out.
pub fn run(
    device: Device,
    root: &Path,
    kinds: &[String],
    system: bool,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<Vec<PullOutcome>> {
    if kinds.iter().any(|k| !KINDS.contains(&k.as_str())) || (kinds.is_empty() && !system) {
        return Err(AppError::invalid_input("kinds"));
    }
    let installed = device
        .shell(&["pm", "path", EASYANDROID_PACKAGE])
        .is_ok_and(|out| out.contains("package:"));
    if !installed {
        return Err(AppError::new(ErrorCode::NotFound, EASYANDROID_PACKAGE));
    }
    let mut ids = Vec::new();
    let mut files = Vec::new();
    if !kinds.is_empty() {
        let (a, b) = made(&one_job(device, "files", kinds, task, reporter)?);
        ids.extend(a);
        files.extend(b);
    }
    if system {
        let (a, b) = made(&one_job(device, "system", &[], task, reporter)?);
        ids.extend(a);
        files.extend(b);
    }
    phone::pull(device, root, &ids, &files, task, reporter)
}

#[tauri::command]
#[specta::specta]
pub async fn start_phone_job(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    serial: String,
    kinds: Vec<String>,
    system: bool,
) -> AppResult<Vec<PullOutcome>> {
    let runner = state.runner()?;
    let task = state.tasks.start(&task_id);
    let reporter = Reporter::new(app.clone(), &task_id);
    let result = blocking(move || {
        let root = backup_root(&app)?;
        let result = run(
            Device::new(&*runner, &serial),
            &root,
            &kinds,
            system,
            &task,
            &reporter,
        );
        reporter.finish(&result);
        result
    })
    .await;
    state.tasks.finish(&task_id);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adb::fake::FakeAdb;

    #[test]
    fn writes_a_job_the_phone_can_read() {
        let json = job_json("pc-1-0", 1000, "files", &["messages".to_string()]);
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["format"], "easyandroid-job");
        assert_eq!(value["type"], "files");
        assert_eq!(value["kinds"][0], "messages");
        assert_eq!(value["created"], 1000);
    }

    #[test]
    fn only_the_status_of_this_job_counts() {
        let text = r#"{"id":"pc-1-0","state":"running","stage":"files","done":3,"total":9}"#;
        assert_eq!(parse_status(text, "pc-1-0").unwrap().done, 3);
        assert!(parse_status(text, "pc-2-0").is_none());
        assert!(parse_status("not json", "pc-1-0").is_none());
        assert!(parse_status("", "pc-1-0").is_none());
    }

    #[test]
    fn picks_out_the_backups_a_job_made() {
        let notes = [
            "id:messages_20260101-100000".to_string(),
            "system:system_20260101-100000.json".to_string(),
            "id:../etc".to_string(),
            "system:other.json".to_string(),
            "data_skipped".to_string(),
        ];
        let (ids, system) = made(&notes);
        assert_eq!(ids, ["messages_20260101-100000"]);
        assert_eq!(system, ["system_20260101-100000.json"]);
    }

    #[test]
    fn names_the_stage_the_frontend_knows() {
        assert_eq!(stage_key("settings"), "system");
        assert_eq!(stage_key("data"), "data");
        assert_eq!(stage_key("prepare"), "files");
    }

    #[test]
    fn refuses_what_the_phone_does_not_make() {
        let fake = FakeAdb::new();
        let root = tempfile::tempdir().unwrap();
        let none: &[String] = &[];
        for (kinds, system) in [
            (vec!["folders".to_string()], false),
            (vec!["messages;reboot".to_string()], false),
            (none.to_vec(), false),
        ] {
            let err = run(
                Device::new(&fake, "X"),
                root.path(),
                &kinds,
                system,
                &TaskHandle::default(),
                &Reporter::silent(),
            )
            .unwrap_err();
            assert_eq!(err.code, ErrorCode::InvalidInput);
        }
        assert!(fake.calls().is_empty());
    }

    #[test]
    fn needs_easyandroid_on_the_phone() {
        let fake = FakeAdb::new().on_fail("pm path", "");
        let root = tempfile::tempdir().unwrap();
        let err = run(
            Device::new(&fake, "X"),
            root.path(),
            &["messages".to_string()],
            false,
            &TaskHandle::default(),
            &Reporter::silent(),
        )
        .unwrap_err();
        assert_eq!(err.code, ErrorCode::NotFound);
    }
}
