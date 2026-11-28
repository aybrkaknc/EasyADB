//! Jobs that this PC leaves on the phone: backups that the phone makes for it (messages, call
//! logs, wallpapers and system settings), and files that it is about to send.
//!
//! These are made by EasyAndroid, as root, so EasyADB leaves it a job in the shared folder, waits
//! for it to say that it is done and then copies what it made. See "Posta kutusu" in
//! `docs/specs/EASYANDROID_INTEROP.md`.

use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
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
    let now = phone_clock(device)?;
    let id = job_id(now);
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

    // The app itself is the way in when root may not start the service.
    start_service(device);
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

/// How long the phone gets to answer before files are sent without asking it.
const ANSWER_WAIT: Duration = Duration::from_secs(15);

/// What the phone is asked to allow: names that will arrive in a folder.
pub struct Incoming<'a> {
    pub names: Vec<&'a str>,
    pub target: &'a str,
    pub bytes: u64,
}

fn receive_json(id: &str, created: u64, incoming: &Incoming, pc: &Pc) -> String {
    serde_json::json!({
        "format": JOB_FORMAT,
        "version": 1,
        "id": id,
        "created": created,
        "type": "receive",
        "names": incoming.names,
        "target": incoming.target,
        "bytes": incoming.bytes,
        "pc": pc.id,
        "pcName": pc.name,
    })
    .to_string()
}

/// What the answer of the phone means for files that wait to be sent.
#[derive(Debug)]
enum Answer {
    /// Nothing yet; `true` when the app has to be opened to show the question.
    Waiting(bool),
    Yes,
    No(AppError),
}

fn answer(status: &JobStatus) -> Answer {
    let no = |code, detail: &str| Answer::No(AppError::new(code, detail));
    match status.state.as_str() {
        "waiting" => Answer::Waiting(status.stage == "open"),
        "running" => Answer::Yes,
        "rejected" => no(ErrorCode::PhoneRejected, ""),
        "expired" => no(ErrorCode::PhoneExpired, ""),
        "cancelled" => no(ErrorCode::Cancelled, "phone"),
        // An EasyAndroid that does not know this kind of job says so.
        "failed" => match &status.error {
            Some(error) if error.starts_with("unsupported") => no(ErrorCode::PhoneOutdated, ""),
            error => no(ErrorCode::Busy, error.as_deref().unwrap_or_default()),
        },
        _ => Answer::Waiting(false),
    }
}

/// A transfer that the phone allowed and now follows.
#[derive(Debug)]
pub struct Receiving {
    id: String,
}

fn job_id(now: u64) -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    format!("pc-{now}-{}", COUNTER.fetch_add(1, Ordering::SeqCst))
}

fn phone_clock(device: Device) -> AppResult<u64> {
    device
        .shell(&["date", "+%s"])?
        .trim()
        .parse()
        .map_err(|_| AppError::new(ErrorCode::AdbFailed, "phone clock"))
}

/// Asks EasyAndroid to allow files from this PC. `None` means that the phone cannot ask (no
/// EasyAndroid, no root, or no answer from it), and the files go without a question.
pub fn ask_to_receive(
    device: Device,
    pc: &Pc,
    incoming: &Incoming,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<Option<Receiving>> {
    let installed = device
        .shell(&["pm", "path", EASYANDROID_PACKAGE])
        .is_ok_and(|out| out.contains("package:"));
    if !installed || device.su("true").is_err() {
        return Ok(None);
    }
    let now = phone_clock(device)?;
    let id = job_id(now);
    let json = receive_json(&id, now, incoming, pc);
    reporter.progress("phone_wait", "", 0.0, 0.0);
    device.script(&format!(
        "mkdir -p {BOX}; chmod 0770 {BOX}; \
         rm -f {BOX}/job-status.json {BOX}/job-cancel {BOX}/job-progress.json; \
         printf %s {} > {BOX}/job.tmp && mv {BOX}/job.tmp {BOX}/job.json",
        shell::quote(&json)
    ))?;
    start_service(device);
    let withdraw = || {
        let _ = device.script(&format!("rm -f {BOX}/job.json"));
    };
    let started = Instant::now();
    let mut heard = Instant::now();
    let (mut seen, mut opened) = (false, false);
    loop {
        std::thread::sleep(Duration::from_secs(1));
        if task.is_cancelled() {
            let _ = device.script(&format!(
                "rm -f {BOX}/job.json; printf %s {} > {BOX}/job-cancel",
                shell::quote(&id)
            ));
            return Err(AppError::cancelled());
        }
        let text = match device.script(&format!("cat {BOX}/job-status.json 2>/dev/null; true")) {
            Ok(text) => {
                heard = Instant::now();
                text
            }
            Err(err) if heard.elapsed() > LOST_WAIT => return Err(err),
            Err(_) => String::new(),
        };
        if let Some(status) = parse_status(&text, &id) {
            seen = true;
            match answer(&status) {
                Answer::Yes => return Ok(Some(Receiving { id })),
                Answer::No(err) => return Err(err),
                Answer::Waiting(open) => {
                    reporter.progress("phone_approval", "", 0.0, 0.0);
                    if open && !opened {
                        opened = true;
                        open_app(device);
                    }
                }
            }
        }
        if !seen && started.elapsed() > ANSWER_WAIT {
            withdraw();
            return Ok(None);
        }
        if started.elapsed() > TIMEOUT {
            withdraw();
            return Err(AppError::new(ErrorCode::PhoneExpired, ""));
        }
    }
}

/// How far the transfer is, as the phone is told.
#[derive(Debug, Default, Clone, Copy)]
struct Progress {
    index: usize,
    done: u64,
    total: u64,
}

fn progress_json(id: &str, state: &str, at: Progress, beat: u64) -> String {
    serde_json::json!({
        "id": id,
        "state": state,
        "index": at.index,
        "done": at.done,
        "total": at.total,
        "beat": beat,
    })
    .to_string()
}

impl Receiving {
    /// Writes the progress and returns the status that the phone left.
    fn tell(&self, device: Device, state: &str, at: Progress, beat: u64) -> Option<JobStatus> {
        let json = progress_json(&self.id, state, at, beat);
        let out = device.script(&format!(
            "printf %s {} > {BOX}/job-progress.tmp && mv {BOX}/job-progress.tmp \
             {BOX}/job-progress.json; cat {BOX}/job-status.json 2>/dev/null; true",
            shell::quote(&json)
        ));
        parse_status(&out.ok()?, &self.id)
    }

    /// Runs `send` while the phone is told every second how far it is. A cancel on the phone
    /// cancels `task`. `send` reports its progress to the function it is given and returns whether
    /// all of it arrived.
    pub fn follow<T>(
        &self,
        device: Device,
        task: &TaskHandle,
        send: impl FnOnce(&dyn Fn(usize, u64, u64)) -> T,
        complete: impl Fn(&T) -> bool,
    ) -> (T, bool) {
        let at = Mutex::new(Progress::default());
        let over = AtomicBool::new(false);
        let stopped_there = AtomicBool::new(false);
        let mut beat = 0;
        let result = std::thread::scope(|scope| {
            let watcher = scope.spawn(|| {
                let mut beat = 0u64;
                while !over.load(Ordering::SeqCst) {
                    beat += 1;
                    let now = *at.lock().unwrap();
                    let status = self.tell(device, "running", now, beat);
                    if status.is_some_and(|s| s.state == "cancelled") && !task.is_cancelled() {
                        stopped_there.store(true, Ordering::SeqCst);
                        task.cancel();
                    }
                    std::thread::park_timeout(Duration::from_secs(1));
                }
                beat
            });
            let result = send(&|index, done, total| {
                *at.lock().unwrap() = Progress { index, done, total };
            });
            over.store(true, Ordering::SeqCst);
            watcher.thread().unpark();
            beat = watcher.join().unwrap_or_default();
            result
        });
        let state = if complete(&result) {
            "done"
        } else if task.is_cancelled() {
            "cancelled"
        } else {
            "failed"
        };
        let last = *at.lock().unwrap();
        self.tell(device, state, last, beat + 1);
        (result, stopped_there.load(Ordering::SeqCst))
    }
}

/// The service is private to EasyAndroid; root may start it.
fn start_service(device: Device) {
    let _ = device.su(&format!(
        "am start-foreground-service --user 0 -n {EASYANDROID_PACKAGE}/.job.JobService"
    ));
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

    fn incoming() -> Incoming<'static> {
        Incoming {
            names: vec!["a.zip"],
            target: "/sdcard/Download",
            bytes: 7,
        }
    }

    #[test]
    fn writes_what_is_about_to_arrive() {
        let json = receive_json("pc-1-0", 1000, &incoming(), &pc());
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["type"], "receive");
        assert_eq!(value["names"][0], "a.zip");
        assert_eq!(value["target"], "/sdcard/Download");
        assert_eq!(value["bytes"], 7);
        let progress = progress_json(
            "pc-1-0",
            "running",
            Progress {
                index: 1,
                done: 2,
                total: 3,
            },
            4,
        );
        let value: serde_json::Value = serde_json::from_str(&progress).unwrap();
        assert_eq!((&value["index"], &value["beat"]), (&1.into(), &4.into()));
    }

    #[test]
    fn reads_the_answer_to_incoming_files() {
        let status =
            |json: &str| answer(&parse_status(&format!(r#"{{"id":"x",{json}}}"#), "x").unwrap());
        let code = |json: &str| match status(json) {
            Answer::No(err) => err.code,
            other => panic!("{other:?}"),
        };
        assert!(matches!(status(r#""state":"running""#), Answer::Yes));
        assert!(matches!(
            status(r#""state":"waiting","stage":"open""#),
            Answer::Waiting(true)
        ));
        assert_eq!(code(r#""state":"rejected""#), ErrorCode::PhoneRejected);
        assert_eq!(code(r#""state":"expired""#), ErrorCode::PhoneExpired);
        assert_eq!(code(r#""state":"cancelled""#), ErrorCode::Cancelled);
        assert_eq!(
            code(r#""state":"failed","error":"unsupported: receive""#),
            ErrorCode::PhoneOutdated
        );
        assert_eq!(code(r#""state":"failed","error":"busy""#), ErrorCode::Busy);
    }

    #[test]
    fn sends_without_asking_when_the_phone_cannot_ask() {
        for fake in [
            FakeAdb::new().on_fail("pm path", ""),
            FakeAdb::new()
                .on("pm path", "package:/data/app/base.apk")
                .on_fail("su -c", "su: not found"),
        ] {
            let answer = ask_to_receive(
                Device::new(&fake, "X"),
                &pc(),
                &incoming(),
                &TaskHandle::default(),
                &Reporter::silent(),
            );
            assert!(matches!(answer, Ok(None)));
            assert!(!fake.calls().iter().any(|c| c.contains("job.json")));
        }
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
