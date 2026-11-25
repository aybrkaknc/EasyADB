//! Jobs that the phone asks of the PC, and the record of what the PC has taken.
//!
//! EasyAndroid cannot reach the PC over the network (it has no INTERNET permission), so the two
//! talk through a folder on the phone that the PC reads with adb. See "Posta kutusu" in
//! `docs/specs/EASYANDROID_INTEROP.md`.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, State};
use tauri_specta::Event;

use crate::adb::parse::DeviceState;
use crate::adb::{AdbRunner, Device, shell};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::events::{PhoneJobEvent, PhoneRequestAsk, TaskState};
use crate::features::backup::create::{self, BackupOptions, Job};
use crate::features::backup::{folders, phone};
use crate::features::device::{self, EASYANDROID_PACKAGE};
use crate::features::settings::backup_root;
use crate::features::system_backup;
use crate::state::{AppState, blocking};
use crate::store;
use crate::tasks::{Reporter, TaskHandle};

/// The folder on the phone that both apps read and write.
pub const BOX: &str = "/data/local/tmp/easyandroid";
const PROTOCOL: u32 = 1;
/// A request older than this is not carried out: nobody is waiting for it anymore.
const MAX_AGE: u64 = 600;
const POLL_IDLE: Duration = Duration::from_secs(3);
const POLL_BUSY: Duration = Duration::from_secs(1);
const TRUSTED_KEY: &str = "trustedPhones";

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub format: String,
    pub version: u32,
    pub id: String,
    pub created: u64,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub package: String,
    #[serde(default)]
    pub data: bool,
    #[serde(default)]
    pub obb: bool,
    #[serde(default)]
    pub external_data: bool,
    #[serde(default)]
    pub names: Vec<String>,
    #[serde(default)]
    pub ids: Vec<String>,
    /// System snapshot files (`system_*.json`) for `pull`.
    #[serde(default)]
    pub system: Vec<String>,
}

/// What a checked request asks for.
#[derive(Debug, Clone, PartialEq)]
pub enum Work {
    App {
        package: String,
        options: BackupOptions,
    },
    Folders(Vec<String>),
    Pull {
        ids: Vec<String>,
        system: Vec<String>,
    },
}

fn is_request_id(id: &str) -> bool {
    (1..=64).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

impl Request {
    /// Checks everything the phone sent before any of it reaches a command line.
    pub fn check(&self, now: u64) -> AppResult<Work> {
        if self.format != "easyandroid-request" || self.version != PROTOCOL {
            return Err(AppError::new(ErrorCode::BackupInvalid, self.format.clone()));
        }
        if !is_request_id(&self.id) {
            return Err(AppError::invalid_input(self.id.clone()));
        }
        if now.saturating_sub(self.created) > MAX_AGE || self.created > now + 60 {
            return Err(AppError::invalid_input("stale request"));
        }
        match self.kind.as_str() {
            "app" => {
                shell::validate_package(&self.package)?;
                Ok(Work::App {
                    package: self.package.clone(),
                    options: BackupOptions {
                        include_obb: self.obb,
                        include_data: self.data,
                        include_external: self.external_data,
                    },
                })
            }
            "folders" => folders::check_names(&self.names).map(Work::Folders),
            "pull" => {
                let named = !self.ids.is_empty() || !self.system.is_empty();
                let valid = self.ids.iter().all(|id| phone::is_id(id))
                    && self.system.iter().all(|s| system_backup::is_file_name(s));
                if !named || !valid {
                    return Err(AppError::invalid_input("ids"));
                }
                Ok(Work::Pull {
                    ids: self.ids.clone(),
                    system: self.system.clone(),
                })
            }
            other => Err(AppError::invalid_input(other)),
        }
    }

    fn count(&self) -> u32 {
        match self.kind.as_str() {
            "folders" => self.names.len() as u32,
            "pull" => (self.ids.len() + self.system.len()) as u32,
            _ => 1,
        }
    }
}

/// What one visit to the mailbox found.
#[derive(Debug, Default, PartialEq)]
pub struct Poll {
    pub now: u64,
    pub phone: String,
    pub request: Option<String>,
    pub cancel: Option<String>,
}

/// Reads the output of [`poll_script`]. `None` means EasyAndroid is not on the phone.
pub fn parse_poll(out: &str) -> Option<Poll> {
    if out.trim_start().starts_with("@@none") {
        return None;
    }
    let mut poll = Poll::default();
    let mut section = "";
    let mut text = String::new();
    let finish = |section: &str, text: &str, poll: &mut Poll| {
        let value = text.trim();
        match section {
            "now" => poll.now = value.parse().unwrap_or(0),
            "phone" => poll.phone = value.to_string(),
            "request" if !value.is_empty() => poll.request = Some(value.to_string()),
            "cancel" if !value.is_empty() => poll.cancel = Some(value.to_string()),
            _ => {}
        }
    };
    for line in out.lines() {
        if let Some(name) = line.strip_prefix("@@") {
            finish(section, &text, &mut poll);
            section = name.trim();
            text.clear();
        } else {
            text.push_str(line);
            text.push('\n');
        }
    }
    finish(section, &text, &mut poll);
    (poll.now > 0 && !poll.phone.is_empty()).then_some(poll)
}

/// One adb call: say that the PC is here, optionally publish a status, read what the phone wants.
fn poll_script(status: Option<&str>) -> String {
    let publish = status
        .map(|json| {
            format!(
                "printf %s {} > {BOX}/status.tmp && mv {BOX}/status.tmp {BOX}/status.json;",
                shell::quote(json)
            )
        })
        .unwrap_or_default();
    format!(
        "pm path {EASYANDROID_PACKAGE} >/dev/null 2>&1 || {{ echo @@none; exit 0; }}; \
         mkdir -p {BOX}; chmod 0770 {BOX}; \
         echo \"$PROTOCOL $(date +%s)\" > {BOX}/pc.tmp && mv {BOX}/pc.tmp {BOX}/pc; {publish} \
         echo @@now; date +%s; echo @@phone; getprop ro.serialno; \
         echo @@request; cat {BOX}/request.json 2>/dev/null; \
         echo @@cancel; cat {BOX}/cancel 2>/dev/null; echo @@end"
    )
    .replace("$PROTOCOL", &PROTOCOL.to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Status<'a> {
    id: &'a str,
    state: &'a str,
    stage: &'a str,
    item: &'a str,
    done: u64,
    total: u64,
    error: Option<String>,
    notes: Vec<String>,
}

#[derive(Default)]
struct Latest {
    stage: String,
    item: String,
    done: f64,
    total: f64,
    finished: bool,
}

struct Active {
    id: String,
    task: Arc<TaskHandle>,
    latest: Arc<Mutex<Latest>>,
}

/// An untrusted phone's request, waiting for the user.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Ask {
    Pending,
    Rejected,
    Once,
    Trust,
}

#[derive(Default)]
pub struct Requests {
    active: Mutex<HashMap<String, Active>>,
    asked: Mutex<HashMap<String, Ask>>,
}

#[derive(Debug, Clone, Copy, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Decision {
    Reject,
    Once,
    Trust,
}

fn status_json(
    id: &str,
    state: &str,
    latest: Option<&Latest>,
    error: Option<String>,
    notes: Vec<String>,
) -> String {
    let (stage, item, done, total) = latest
        .map(|l| (l.stage.as_str(), l.item.as_str(), l.done, l.total))
        .unwrap_or(("", "", 0.0, 0.0));
    serde_json::to_string(&Status {
        id,
        state,
        stage,
        item,
        done: done as u64,
        total: total as u64,
        error,
        notes,
    })
    .unwrap_or_default()
}

fn publish(device: Device, json: &str) {
    let _ = device.script(&format!(
        "printf %s {} > {BOX}/status.tmp && mv {BOX}/status.tmp {BOX}/status.json",
        shell::quote(json)
    ));
}

fn trusted(app: &AppHandle) -> Vec<String> {
    store::load(app, TRUSTED_KEY)
}

#[tauri::command]
#[specta::specta]
pub fn list_trusted_phones(app: AppHandle) -> Vec<String> {
    trusted(&app)
}

#[tauri::command]
#[specta::specta]
pub fn forget_trusted_phone(app: AppHandle, phone: String) -> AppResult<()> {
    let list: Vec<String> = trusted(&app).into_iter().filter(|p| *p != phone).collect();
    store::save(&app, TRUSTED_KEY, &list)
}

/// The user's answer to a [`PhoneRequestAsk`].
#[tauri::command]
#[specta::specta]
pub fn answer_phone_request(
    app: AppHandle,
    state: State<'_, AppState>,
    phone: String,
    id: String,
    decision: Decision,
) -> AppResult<()> {
    let ask = match decision {
        Decision::Reject => Ask::Rejected,
        Decision::Once => Ask::Once,
        Decision::Trust => {
            let mut list = trusted(&app);
            if !list.contains(&phone) {
                list.push(phone.clone());
                store::save(&app, TRUSTED_KEY, &list)?;
            }
            Ask::Trust
        }
    };
    state
        .requests
        .asked
        .lock()
        .unwrap()
        .insert(format!("{phone}/{id}"), ask);
    Ok(())
}

/// Starts the loop that watches every connected phone.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        loop {
            let busy = visit_all(&app);
            std::thread::sleep(if busy { POLL_BUSY } else { POLL_IDLE });
        }
    });
}

/// Returns true while a job runs, so that the loop looks more often.
fn visit_all(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    let Ok(runner) = state.runner() else {
        return false;
    };
    let Ok(devices) = device::list(&*runner) else {
        return false;
    };
    let mut seen: Vec<String> = Vec::new();
    for entry in devices.iter().filter(|d| d.state == DeviceState::Device) {
        // The same phone can show up over USB and Wi-Fi.
        let Some(phone) = visit(app, &runner, &entry.serial, &seen) else {
            continue;
        };
        seen.push(phone);
    }
    !state.requests.active.lock().unwrap().is_empty()
}

/// One visit to one phone. Returns its `ro.serialno` when EasyAndroid is installed on it.
fn visit(
    app: &AppHandle,
    runner: &Arc<dyn AdbRunner>,
    serial: &str,
    seen: &[String],
) -> Option<String> {
    let state = app.state::<AppState>();
    let device = Device::new(&**runner, serial);
    // The status of a running job rides along with the visit.
    let running = {
        let active = state.requests.active.lock().unwrap();
        active
            .iter()
            .find(|(_, a)| !a.latest.lock().unwrap().finished)
            .map(|(phone, a)| (phone.clone(), a.id.clone(), a.latest.clone()))
    };
    let status = running.as_ref().map(|(_, id, latest)| {
        status_json(id, "running", Some(&latest.lock().unwrap()), None, vec![])
    });
    let out = device.script(&poll_script(status.as_deref())).ok()?;
    let poll = parse_poll(&out)?;
    if seen.contains(&poll.phone) {
        return Some(poll.phone);
    }

    if let Some(active) = state.requests.active.lock().unwrap().get(&poll.phone) {
        if poll.cancel.as_deref() == Some(active.id.as_str()) {
            active.task.cancel();
        }
        return Some(poll.phone);
    }
    if let Some(text) = &poll.request {
        handle(app, runner, serial, &poll, text);
    }
    Some(poll.phone)
}

fn handle(app: &AppHandle, runner: &Arc<dyn AdbRunner>, serial: &str, poll: &Poll, text: &str) {
    let state = app.state::<AppState>();
    let device = Device::new(&**runner, serial);
    let reject = |id: &str, error: AppError| {
        publish(
            device,
            &status_json(id, "rejected", None, Some(error.detail), vec![]),
        );
        let _ = device.script(&format!("rm -f {BOX}/request.json"));
    };
    let request: Request = match serde_json::from_str(text) {
        Ok(request) => request,
        Err(err) => {
            reject("", AppError::new(ErrorCode::Parse, err.to_string()));
            return;
        }
    };
    let work = match request.check(poll.now) {
        Ok(work) => work,
        Err(err) => {
            reject(&request.id, err);
            return;
        }
    };

    let key = format!("{}/{}", poll.phone, request.id);
    let known = trusted(app).contains(&poll.phone);
    let decision = if known {
        Some(Ask::Trust)
    } else {
        let mut asked = state.requests.asked.lock().unwrap();
        match asked.get(&key).copied() {
            None => {
                asked.insert(key.clone(), Ask::Pending);
                None
            }
            Some(Ask::Pending) => return,
            Some(answer) => Some(answer),
        }
    };
    let Some(decision) = decision else {
        publish(
            device,
            &status_json(&request.id, "waiting", None, None, vec![]),
        );
        crate::show_main_window(app);
        let model = device
            .shell(&["getprop", "ro.product.model"])
            .unwrap_or_default();
        let _ = PhoneRequestAsk {
            phone: poll.phone.clone(),
            model: model.trim().to_string(),
            id: request.id.clone(),
            kind: request.kind.clone(),
            package: request.package.clone(),
            count: request.count(),
        }
        .emit(app);
        return;
    };
    state.requests.asked.lock().unwrap().remove(&key);
    if decision == Ask::Rejected {
        reject(
            &request.id,
            AppError::new(ErrorCode::Cancelled, "rejected by the PC"),
        );
        return;
    }

    // The move makes this PC the one that owns the request, even when the phone shows up twice.
    if device
        .script(&format!(
            "mv {BOX}/request.json {BOX}/request.running && rm -f {BOX}/cancel"
        ))
        .is_err()
    {
        return;
    }
    let task_id = format!("phone-{}", request.id);
    let task = state.tasks.start(&task_id);
    let latest = Arc::new(Mutex::new(Latest {
        stage: "prepare".into(),
        ..Default::default()
    }));
    state.requests.active.lock().unwrap().insert(
        poll.phone.clone(),
        Active {
            id: request.id.clone(),
            task: task.clone(),
            latest: latest.clone(),
        },
    );
    let job = RunningJob {
        app: app.clone(),
        runner: runner.clone(),
        serial: serial.to_string(),
        phone: poll.phone.clone(),
        request,
        work,
        task,
        task_id,
        latest,
    };
    std::thread::spawn(move || job.run());
}

struct RunningJob {
    app: AppHandle,
    runner: Arc<dyn AdbRunner>,
    serial: String,
    phone: String,
    request: Request,
    work: Work,
    task: Arc<TaskHandle>,
    task_id: String,
    latest: Arc<Mutex<Latest>>,
}

impl RunningJob {
    fn event(&self, state: TaskState, error: Option<AppError>) {
        let _ = PhoneJobEvent {
            phone: self.phone.clone(),
            id: self.request.id.clone(),
            kind: self.request.kind.clone(),
            package: self.request.package.clone(),
            state,
            error,
        }
        .emit(&self.app);
    }

    fn run(self) {
        self.event(TaskState::Running, None);
        let device = Device::new(&*self.runner, &self.serial);
        let latest = self.latest.clone();
        let reporter = Reporter::new(self.app.clone(), &self.task_id).observed(Arc::new(
            move |stage, item, done, total| {
                let mut l = latest.lock().unwrap();
                l.stage = stage.to_string();
                l.item = item.to_string();
                l.done = done;
                l.total = total;
            },
        ));
        let result = self.work(device, &reporter);
        reporter.finish(&result);

        let (state, error, notes) = match &result {
            Ok(notes) => ("done", None, notes.clone()),
            Err(err) if err.code == ErrorCode::Cancelled => {
                ("cancelled", Some(err.detail.clone()), vec![])
            }
            Err(err) => (
                "failed",
                Some(format!("{:?}: {}", err.code, err.detail)),
                vec![],
            ),
        };
        {
            // The lock keeps a late progress update from overwriting the final status.
            let mut l = self.latest.lock().unwrap();
            l.finished = true;
            publish(
                device,
                &status_json(&self.request.id, state, Some(&l), error, notes),
            );
        }
        let _ = device.script(&format!("rm -f {BOX}/request.running {BOX}/cancel"));

        let state = app_state(&self.app);
        state.tasks.finish(&self.task_id);
        state.requests.active.lock().unwrap().remove(&self.phone);
        self.event(
            match &result {
                Ok(_) => TaskState::Done,
                Err(e) if e.code == ErrorCode::Cancelled => TaskState::Cancelled,
                Err(_) => TaskState::Failed,
            },
            result.err(),
        );
    }

    /// Carries the request out. Returns the notes for the phone.
    fn work(&self, device: Device, reporter: &Reporter) -> AppResult<Vec<String>> {
        let root = backup_root(&self.app)?;
        match &self.work {
            Work::App { package, options } => {
                let wants_data = options.include_data || options.include_external;
                let has_root = wants_data && device::check_root(device);
                if wants_data && !has_root {
                    return Err(AppError::new(ErrorCode::NotFound, "no root for the shell"));
                }
                let snapshot = create::snapshot(device);
                let job = Job {
                    device,
                    root: &root,
                    task: &self.task,
                    reporter,
                    snapshot: &snapshot,
                    has_root,
                };
                let created = create::create(&job, package, options)?;
                record_pc_backup(device, &created.dir);
                let mut notes = Vec::new();
                if created.data_skipped && created.data_failed.is_empty() {
                    notes.push("data_skipped".to_string());
                }
                notes.extend(
                    created
                        .data_failed
                        .iter()
                        .map(|f| format!("data_failed:{f}")),
                );
                Ok(notes)
            }
            Work::Folders(names) => {
                let snapshot = create::snapshot(device);
                folders::stream(
                    device,
                    &root,
                    names,
                    &snapshot,
                    device::check_root(device),
                    &self.task,
                    reporter,
                )?;
                Ok(vec![])
            }
            Work::Pull { ids, system } => {
                let outcomes = phone::pull(device, &root, ids, system, &self.task, reporter)?;
                match outcomes.into_iter().find_map(|o| o.error) {
                    Some(err) => Err(err),
                    None => Ok(vec![]),
                }
            }
        }
    }
}

fn app_state(app: &AppHandle) -> State<'_, AppState> {
    app.state::<AppState>()
}

/// Adds a backup made on the PC to the phone's list of what the PC holds.
pub fn record_pc_backup(device: Device, dir: &std::path::Path) {
    let Ok(manifest) = crate::features::backup::manifest::read(dir) else {
        return;
    };
    let entry = serde_json::json!({
        "package": manifest.package,
        "versionName": manifest.version_name,
        "createdAt": manifest.created_at,
    });
    let path = format!("{BOX}/pc-backups.json");
    // Only phones with EasyAndroid get the folder, and only EasyAndroid reads the file.
    let Ok(current) = device.script(&format!(
        "pm path {EASYANDROID_PACKAGE} >/dev/null 2>&1 && {{ mkdir -p {BOX}; cat {path} 2>/dev/null; true; }}"
    )) else {
        return;
    };
    let json = merge_record(&current, entry);
    let _ = device.script(&format!(
        "printf %s {} > {path}.tmp && mv {path}.tmp {path}",
        shell::quote(&json)
    ));
}

/// Appends `entry` to the list in `current`, once per package and time, keeping the newest 500.
pub fn merge_record(current: &str, entry: serde_json::Value) -> String {
    let mut list: Vec<serde_json::Value> = serde_json::from_str(current.trim()).unwrap_or_default();
    if !list.contains(&entry) {
        list.push(entry);
    }
    let skip = list.len().saturating_sub(500);
    serde_json::to_string(&list[skip..]).unwrap_or_else(|_| "[]".into())
}

/// Lets the user cancel from the PC a job that the phone asked for.
#[tauri::command]
#[specta::specta]
pub fn cancel_phone_job(state: State<'_, AppState>, phone: String) -> bool {
    state
        .requests
        .active
        .lock()
        .unwrap()
        .get(&phone)
        .map(|a| {
            a.task.cancel();
            true
        })
        .unwrap_or(false)
}

#[tauri::command]
#[specta::specta]
pub async fn is_easyandroid_ready(state: State<'_, AppState>, serial: String) -> AppResult<bool> {
    let runner = state.runner()?;
    blocking(move || {
        let out = Device::new(&*runner, &serial).script(&poll_script(None))?;
        Ok(parse_poll(&out).is_some())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(kind: &str, extra: &str) -> Request {
        serde_json::from_str(&format!(
            r#"{{"format":"easyandroid-request","version":1,"id":"a-1","created":1000,"type":"{kind}"{extra}}}"#
        ))
        .unwrap()
    }

    #[test]
    fn checks_an_app_request() {
        let r = request(
            "app",
            r#","package":"com.a.b","data":true,"externalData":true"#,
        );
        let Work::App { package, options } = r.check(1005).unwrap() else {
            panic!("not an app request");
        };
        assert_eq!(package, "com.a.b");
        assert!(options.include_data && options.include_external && !options.include_obb);
    }

    #[test]
    fn refuses_what_could_reach_a_shell() {
        for bad in ["com.a; reboot", "nodots", "", "com.a b"] {
            let r = request("app", &format!(r#","package":"{bad}""#));
            assert!(r.check(1005).is_err(), "{bad}");
        }
        let folders = request("folders", r#","names":["DCIM","../etc"]"#);
        assert!(folders.check(1005).is_err());
        let pull = request("pull", r#","ids":["a_1","x;y"]"#);
        assert!(pull.check(1005).is_err());
        let system = request("pull", r#","system":["../system_1.json"]"#);
        assert!(system.check(1005).is_err());
        let ok = request(
            "pull",
            r#","ids":["a_1"],"system":["system_20260101-100000.json"]"#,
        );
        assert!(matches!(ok.check(1005), Ok(Work::Pull { .. })));
        assert!(request("pull", r#","ids":[]"#).check(1005).is_err());
        assert!(request("wipe", "").check(1005).is_err());
    }

    #[test]
    fn refuses_stale_future_and_foreign_requests() {
        let r = request("pull", r#","ids":["a_1"]"#);
        assert!(r.check(1000 + MAX_AGE).is_ok());
        assert!(r.check(1000 + MAX_AGE + 1).is_err());
        assert!(r.check(900).is_err());
        let mut other = r.clone();
        other.format = "something".into();
        assert!(other.check(1005).is_err());
        let mut bad_id = r.clone();
        bad_id.id = "a/b".into();
        assert!(bad_id.check(1005).is_err());
    }

    #[test]
    fn reads_what_a_visit_found() {
        let out = "@@now\n1005\n@@phone\nABC123\n@@request\n{\"id\":\"a\"}\n@@cancel\n\n@@end\n";
        let poll = parse_poll(out).unwrap();
        assert_eq!(poll.now, 1005);
        assert_eq!(poll.phone, "ABC123");
        assert_eq!(poll.request.as_deref(), Some("{\"id\":\"a\"}"));
        assert_eq!(poll.cancel, None);
    }

    #[test]
    fn a_phone_without_easyandroid_is_skipped() {
        assert_eq!(parse_poll("@@none\n"), None);
        assert_eq!(parse_poll("garbage"), None);
    }

    #[test]
    fn the_visit_script_publishes_a_status_only_when_given_one() {
        let plain = poll_script(None);
        assert!(plain.starts_with("pm path com.aybrkaknc.easyandroid"));
        assert!(!plain.contains("status.json"));
        assert!(plain.contains("pc.tmp") && plain.contains("@@request"));
        let with = poll_script(Some("{\"id\":\"it's\"}"));
        assert!(with.contains("status.json"));
        assert!(with.contains("it'\\''s"));
    }

    #[test]
    fn keeps_a_list_of_what_the_pc_holds() {
        let a = serde_json::json!({"package":"com.a","versionName":"1","createdAt":"t1"});
        let b = serde_json::json!({"package":"com.b","versionName":"1","createdAt":"t2"});
        let first = merge_record("", a.clone());
        let second = merge_record(&first, b);
        let again = merge_record(&second, a);
        let list: Vec<serde_json::Value> = serde_json::from_str(&again).unwrap();
        assert_eq!(list.len(), 2);
        let many: Vec<serde_json::Value> = (0..600)
            .map(|n| serde_json::json!({"package":"com.a","createdAt":n.to_string()}))
            .collect();
        let capped = merge_record(
            &serde_json::to_string(&many).unwrap(),
            serde_json::json!({}),
        );
        let list: Vec<serde_json::Value> = serde_json::from_str(&capped).unwrap();
        assert_eq!(list.len(), 500);
    }

    #[test]
    fn statuses_carry_the_progress() {
        let latest = Latest {
            stage: "data".into(),
            item: "com.a".into(),
            done: 10.0,
            total: 20.0,
            finished: false,
        };
        let json = status_json("a-1", "running", Some(&latest), None, vec!["n".into()]);
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["id"], "a-1");
        assert_eq!(value["state"], "running");
        assert_eq!(value["done"], 10);
        assert_eq!(value["notes"][0], "n");
    }
}
