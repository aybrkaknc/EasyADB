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
use crate::features::phone_requests::{self, BOX};
use crate::features::settings::backup_root;
use crate::features::system_backup;
use crate::state::{AppState, blocking};
use crate::tasks::{Reporter, TaskHandle};

const JOB_FORMAT: &str = "easyandroid-job";
const KINDS: [&str; 3] = ["messages", "calls", "wallpaper"];
const TIMEOUT: Duration = Duration::from_secs(30 * 60);
/// How long the phone gets to start the job before the app is opened on its screen.
const START_WAIT: Duration = Duration::from_secs(15);
const CANCEL_WAIT: Duration = Duration::from_secs(5);
/// A phone that cannot be read for this long is gone.
const LOST_WAIT: Duration = Duration::from_secs(20);

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

/// Which PC asks, for the phone's question and its list of trusted PCs.
pub struct Pc {
    pub id: String,
    pub name: String,
}

fn job_json(id: &str, created: u64, kind: &str, kinds: &[String], pc: &Pc) -> String {
    serde_json::json!({
        "format": JOB_FORMAT,
        "version": 1,
        "id": id,
        "created": created,
        "type": kind,
        "kinds": kinds,
        "pc": pc.id,
        "pcName": pc.name,
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

/// What the status of a phone job means for the wait.
#[derive(Debug)]
enum Told {
    /// The phone asks its user. `true` means that it cannot show the question by itself.
    Asking(bool),
    Running,
    Ended(AppResult<Vec<String>>),
}

fn told(status: JobStatus) -> Told {
    let failed = |code| Told::Ended(Err(AppError::new(code, "")));
    match status.state.as_str() {
        "done" => Told::Ended(Ok(status.notes)),
        "cancelled" => Told::Ended(Err(AppError::new(ErrorCode::Cancelled, "phone"))),
        "rejected" => failed(ErrorCode::PhoneRejected),
        "expired" => failed(ErrorCode::PhoneExpired),
        "failed" => Told::Ended(Err(AppError::new(
            ErrorCode::AdbFailed,
            status.error.unwrap_or_default(),
        ))),
        "waiting" => Told::Asking(status.stage == "open"),
        _ => Told::Running,
    }
}

/// Hands one job to EasyAndroid and waits for it. Returns the notes of the finished job.
fn one_job(
    device: Device,
    pc: &Pc,
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
    let json = job_json(&id, now, kind, kinds, pc);
    reporter.progress("phone_wait", "", 0.0, 0.0);
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
    let mut heard = Instant::now();
    let result = loop {
        std::thread::sleep(Duration::from_secs(1));
        if task.is_cancelled() && cancelled_at.is_none() {
            let _ = device.script(&format!(
                "printf %s {} > {BOX}/job-cancel",
                shell::quote(&id)
            ));
            cancelled_at = Some(Instant::now());
        }
        let text = match device.script(&format!("cat {BOX}/job-status.json 2>/dev/null; true")) {
            Ok(text) => {
                heard = Instant::now();
                text
            }
            Err(err) if heard.elapsed() > LOST_WAIT => break Err(err),
            Err(_) => String::new(),
        };
        if let Some(status) = parse_status(&text, &id) {
            seen = true;
            let (stage, item) = (stage_key(&status.stage), status.item.clone());
            let (done, total) = (status.done as f64, status.total as f64);
            match told(status) {
                Told::Ended(result) => break result,
                Told::Asking(open) => {
                    reporter.progress("phone_approval", "", 0.0, 0.0);
                    if open && !opened {
                        opened = true;
                        open_app(device);
                    }
                }
                Told::Running => reporter.progress(stage, &item, done, total),
            }
        }
        if let Some(at) = cancelled_at {
            if at.elapsed() > CANCEL_WAIT {
                break Err(AppError::cancelled());
            }
        }
        if !seen && !opened && started.elapsed() > START_WAIT {
            opened = true;
            reporter.progress("phone_open", "", 0.0, 0.0);
            open_app(device);
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

fn open_app(device: Device) {
    let _ = device.shell(&[
        "am",
        "start",
        "--user",
        "0",
        "-n",
        &format!("{EASYANDROID_PACKAGE}/.MainActivity"),
    ]);
}

/// Asks EasyAndroid for the backups and copies them to the PC. A system snapshot never holds
/// Wi-Fi passwords here, because the phone leaves the networks out.
pub fn run(
    device: Device,
    pc: &Pc,
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
        let (a, b) = made(&one_job(device, pc, "files", kinds, task, reporter)?);
        ids.extend(a);
        files.extend(b);
    }
    if system {
        let (a, b) = made(&one_job(device, pc, "system", &[], task, reporter)?);
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
    let _hold = state.requests.hold(&serial)?;
    let task = state.tasks.start(&task_id);
    let reporter = Reporter::new(app.clone(), &task_id);
    let result = blocking(move || {
        let root = backup_root(&app)?;
        let pc = Pc {
            id: phone_requests::pc_id(&app),
            name: phone_requests::pc_name(),
        };
        let result = run(
            Device::new(&*runner, &serial),
            &pc,
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

    fn pc() -> Pc {
        Pc {
            id: "abc".into(),
            name: "DESK".into(),
        }
    }

    #[test]
    fn tells_a_refusal_from_a_failure() {
        let status =
            |json: &str| told(parse_status(&format!(r#"{{"id":"x",{json}}}"#), "x").unwrap());
        let code = |json: &str| match status(json) {
            Told::Ended(Err(err)) => err.code,
            other => panic!("{other:?}"),
        };
        assert_eq!(code(r#""state":"rejected""#), ErrorCode::PhoneRejected);
        assert_eq!(code(r#""state":"expired""#), ErrorCode::PhoneExpired);
        assert_eq!(code(r#""state":"cancelled""#), ErrorCode::Cancelled);
        assert_eq!(code(r#""state":"failed""#), ErrorCode::AdbFailed);
        assert!(matches!(
            status(r#""state":"waiting""#),
            Told::Asking(false)
        ));
        assert!(matches!(
            status(r#""state":"waiting","stage":"open""#),
            Told::Asking(true)
        ));
        assert!(matches!(status(r#""state":"running""#), Told::Running));
        assert!(matches!(status(r#""state":"done""#), Told::Ended(Ok(_))));
    }

    #[test]
    fn writes_a_job_the_phone_can_read() {
        let json = job_json("pc-1-0", 1000, "files", &["messages".to_string()], &pc());
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["format"], "easyandroid-job");
        assert_eq!(value["type"], "files");
        assert_eq!(value["kinds"][0], "messages");
        assert_eq!(value["created"], 1000);
        assert_eq!(value["pc"], "abc");
        assert_eq!(value["pcName"], "DESK");
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
                &pc(),
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
            &pc(),
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
