//! Jobs that the phone asks of the PC, and the record of what the PC has taken.
//!
//! EasyAndroid cannot reach the PC over the network (it has no INTERNET permission), so the two
//! talk through a folder on the phone that the PC reads with adb. See "Posta kutusu" in
//! `docs/specs/EASYANDROID_INTEROP.md`.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager, State};
use tauri_specta::Event;

use crate::adb::parse::DeviceState;
use crate::adb::{AdbRunner, Device, shell};
use crate::awake::Awake;
use crate::error::{AppError, AppResult, ErrorCode};
use crate::events::{PhoneBatchEnd, PhoneJobEvent, PhoneRequestAsk, TaskState};
use crate::features::backup::create::{self, BackupOptions, Job};
use crate::features::backup::{folders, phone};
use crate::features::device::{self, EASYANDROID_PACKAGE};
use crate::features::phone_batches::{Book, EndReason, Step};
use crate::features::settings::backup_root;
use crate::features::speed;
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
/// Phones whose trust question the user does not want to see again.
const NEVER_ASK_KEY: &str = "neverAskPhones";
const PC_ID_KEY: &str = "pcId";
const MAX_COUNT: u32 = 1000;
/// How many names a question or a progress window lists.
const SHOWN_NAMES: usize = 5;
/// The longest app name that is taken from the phone.
const SHOWN_LABEL: usize = 80;

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
    /// The name the phone shows for `package`. Only ever shown, never part of a command.
    #[serde(default)]
    pub label: String,
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
    /// How much to send each way for `speed`.
    #[serde(default)]
    pub megabytes: u32,
    /// The requests of one tap on the phone share this. Empty means a group of its own.
    #[serde(default)]
    pub batch: String,
    /// Place of this request in its group, from 0.
    #[serde(default)]
    pub index: u32,
    /// How many requests the group has.
    #[serde(default)]
    pub size: u32,
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
    Speed(u32),
}

fn is_request_id(id: &str) -> bool {
    (1..=64).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

impl Request {
    pub fn batch(&self) -> &str {
        if self.batch.is_empty() {
            &self.id
        } else {
            &self.batch
        }
    }

    pub fn size(&self) -> u32 {
        self.size.max(1)
    }

    /// A request that waited on the phone too long is not carried out: nobody expects it anymore.
    pub fn check_age(&self, now: u64) -> AppResult<()> {
        if now.saturating_sub(self.created) > MAX_AGE || self.created > now + 60 {
            return Err(AppError::invalid_input("stale request"));
        }
        Ok(())
    }

    /// Checks everything the phone sent before any of it reaches a command line.
    pub fn check(&self) -> AppResult<Work> {
        if self.format != "easyandroid-request" || self.version != PROTOCOL {
            return Err(AppError::new(ErrorCode::BackupInvalid, self.format.clone()));
        }
        if !is_request_id(&self.id) {
            return Err(AppError::invalid_input(self.id.clone()));
        }
        if !is_request_id(self.batch()) || self.size() > MAX_COUNT || self.index >= self.size() {
            return Err(AppError::invalid_input("batch"));
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
            "speed" => {
                if (1..=speed::MAX_MEGABYTES).contains(&self.megabytes) {
                    Ok(Work::Speed(self.megabytes))
                } else {
                    Err(AppError::invalid_input("megabytes"))
                }
            }
            other => Err(AppError::invalid_input(other)),
        }
    }

    fn count(&self) -> u32 {
        match self.kind.as_str() {
            "folders" => self.names.len() as u32,
            "pull" => (self.ids.len() + self.system.len()) as u32,
            "speed" => self.megabytes,
            _ => self.size(),
        }
    }

    /// What the request is about, for people: folders, backups or the package.
    fn label(&self) -> Option<String> {
        let shown: String = self
            .label
            .chars()
            .filter(|c| !c.is_control())
            .take(SHOWN_LABEL)
            .collect();
        let shown = shown.trim();
        (self.kind == "app" && !shown.is_empty()).then(|| shown.to_string())
    }

    fn parts(&self) -> Vec<String> {
        if self.kind != "app" {
            return vec![];
        }
        [
            (true, "apk"),
            (self.obb, "obb"),
            (self.data, "data"),
            (self.external_data, "external"),
        ]
        .into_iter()
        .filter(|(on, _)| *on)
        .map(|(_, part)| part.to_string())
        .collect()
    }

    fn names(&self) -> Vec<String> {
        let all = match self.kind.as_str() {
            "app" => vec![self.package.clone()],
            "folders" => self.names.clone(),
            _ => self.ids.iter().chain(&self.system).cloned().collect(),
        };
        all.into_iter().take(SHOWN_NAMES).collect()
    }
}

/// What one visit to the mailbox found.
#[derive(Debug, Default, PartialEq)]
pub struct Poll {
    pub now: u64,
    pub phone: String,
    pub request: Option<String>,
    pub cancel: Option<String>,
    /// The PC that took the request that runs, and the request itself.
    pub owner: Option<String>,
    pub running: Option<String>,
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
            "owner" if !value.is_empty() => poll.owner = Some(value.to_string()),
            "running" if !value.is_empty() => poll.running = Some(value.to_string()),
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
         echo @@request; cat {BOX}/request.json 2>/dev/null; echo; \
         echo @@cancel; cat {BOX}/cancel 2>/dev/null; echo; \
         echo @@owner; cat {BOX}/request.owner 2>/dev/null; echo; \
         echo @@running; cat {BOX}/request.running 2>/dev/null; echo; echo @@end"
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
    /// Held while a status travels to the phone, so that they arrive in the order they were made.
    /// Apart from the lock around this struct, which progress must not wait on for that long.
    writing: Arc<Mutex<()>>,
}

struct Active {
    id: String,
    /// The connection the job runs over. Its status is only written there.
    serial: String,
    task: Arc<TaskHandle>,
    latest: Arc<Mutex<Latest>>,
    /// Who cancelled it, if anyone did.
    cancelled_by: Arc<Mutex<Option<EndReason>>>,
    event: PhoneJobEvent,
}

#[derive(Default)]
pub struct Requests {
    active: Mutex<HashMap<String, Active>>,
    book: Mutex<Book>,
    asks: Mutex<HashMap<String, PhoneRequestAsk>>,
    /// Final statuses that could not be written because the phone was away.
    unsent: Mutex<HashMap<String, String>>,
    /// Which phone an adb serial belongs to.
    phones: Mutex<HashMap<String, String>>,
    /// Jobs started on this PC, by adb serial.
    held: Arc<Mutex<HashMap<String, u32>>>,
}

/// A job that this PC started on a phone. Requests of that phone wait until it is dropped.
pub struct Hold {
    held: Arc<Mutex<HashMap<String, u32>>>,
    serial: String,
    _awake: Awake,
}

impl Drop for Hold {
    fn drop(&mut self) {
        let mut held = self.held.lock().unwrap();
        if let Some(n) = held.get_mut(&self.serial) {
            *n -= 1;
            if *n == 0 {
                held.remove(&self.serial);
            }
        }
    }
}

impl Requests {
    /// Marks the phone as busy with a job of this PC. Refused while the phone's own job runs.
    pub fn hold(&self, serial: &str) -> AppResult<Hold> {
        let phone = self.phones.lock().unwrap().get(serial).cloned();
        if let Some(phone) = phone {
            if self.active.lock().unwrap().contains_key(&phone) {
                return Err(AppError::new(ErrorCode::Busy, ""));
            }
        }
        *self
            .held
            .lock()
            .unwrap()
            .entry(serial.to_string())
            .or_default() += 1;
        Ok(Hold {
            held: self.held.clone(),
            serial: serial.to_string(),
            _awake: Awake::start(),
        })
    }

    /// [`Self::hold`] for something that drops the connection: refused while any job uses the
    /// phone.
    pub fn exclusive(&self, serial: &str) -> AppResult<Hold> {
        let phone = self.phones.lock().unwrap().get(serial).cloned();
        let held = self.held.lock().unwrap().contains_key(serial);
        if held || phone.is_some_and(|phone| self.is_held(&phone)) {
            return Err(AppError::new(ErrorCode::Busy, ""));
        }
        self.hold(serial)
    }

    /// A job of this PC runs on the phone, over whichever connection.
    fn is_held(&self, phone: &str) -> bool {
        let phones = self.phones.lock().unwrap();
        self.held
            .lock()
            .unwrap()
            .keys()
            .any(|serial| phones.get(serial).is_some_and(|p| p == phone))
    }
}

/// The name this PC goes by on a phone, made once.
pub fn pc_id(app: &AppHandle) -> String {
    let saved: String = store::load(app, PC_ID_KEY);
    if is_request_id(&saved) {
        return saved;
    }
    use std::hash::{BuildHasher, Hasher};
    let part = || {
        // `RandomState` is seeded from the system's random source.
        std::collections::hash_map::RandomState::new()
            .build_hasher()
            .finish()
    };
    let id = format!("{:016x}{:016x}", part(), part());
    let _ = store::save(app, PC_ID_KEY, &id);
    id
}

pub fn pc_name() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_else(|_| "PC".into())
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

/// Writes the status to the phone. False when it did not arrive, so that it is sent again.
fn publish(device: Device, json: &str) -> bool {
    let sent = device
        .script(&format!(
            "printf %s {} > {BOX}/status.tmp && mv {BOX}/status.tmp {BOX}/status.json",
            shell::quote(json)
        ))
        .is_ok();
    if !sent {
        log::warn!(
            "status not sent to the phone: {}",
            json.chars().take(120).collect::<String>()
        );
    }
    sent
}

/// Polls the phone and writes the progress of the job `id` on the same trip.
fn poll_with_progress(device: Device, id: &str, latest: &Mutex<Latest>) -> AppResult<String> {
    let writing = latest.lock().unwrap().writing.clone();
    let _order = writing.lock().unwrap();
    let status = {
        let latest = latest.lock().unwrap();
        (!latest.finished).then(|| status_json(id, "running", Some(&latest), None, vec![]))
    };
    device.script(&poll_script(status.as_deref()))
}

/// Closes the progress of a job and writes its final status. False when it did not arrive.
fn finish_status(device: Device, latest: &Mutex<Latest>, json: &str) -> bool {
    let writing = latest.lock().unwrap().writing.clone();
    let _order = writing.lock().unwrap();
    latest.lock().unwrap().finished = true;
    publish(device, json)
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

/// The user's answer to a [`PhoneRequestAsk`]. False when the question had ended before.
#[tauri::command]
#[specta::specta]
pub fn answer_phone_request(
    app: AppHandle,
    state: State<'_, AppState>,
    phone: String,
    batch: String,
    decision: Decision,
) -> AppResult<bool> {
    let accept = !matches!(decision, Decision::Reject);
    let open = state
        .requests
        .book
        .lock()
        .unwrap()
        .answer(&phone, &batch, accept, Instant::now());
    if open && matches!(decision, Decision::Trust) {
        trust_phone(app, phone.clone())?;
    }
    state
        .requests
        .asks
        .lock()
        .unwrap()
        .remove(&format!("{phone}/{batch}"));
    Ok(open)
}

/// What is going on between the phones and this PC, for a window that was just opened.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PhoneActivity {
    pub asks: Vec<PhoneRequestAsk>,
    pub jobs: Vec<PhoneJobEvent>,
}

#[tauri::command]
#[specta::specta]
pub fn phone_activity(state: State<'_, AppState>) -> PhoneActivity {
    let asks = state.requests.asks.lock().unwrap();
    let open = state
        .requests
        .book
        .lock()
        .unwrap()
        .asking(Instant::now())
        .into_iter()
        .filter_map(|(b, left)| {
            let mut ask = asks.get(&format!("{}/{}", b.phone, b.id))?.clone();
            ask.seconds = left;
            Some(ask)
        })
        .collect();
    let jobs = state
        .requests
        .active
        .lock()
        .unwrap()
        .values()
        .map(|a| a.event.clone())
        .collect();
    PhoneActivity { asks: open, jobs }
}

/// Starts the loop that watches every connected phone.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let pc = pc_id(&app);
        loop {
            let busy = visit_all(&app, &pc);
            std::thread::sleep(if busy { POLL_BUSY } else { POLL_IDLE });
        }
    });
}

/// Returns true while something goes on, so that the loop looks more often.
fn visit_all(app: &AppHandle, pc: &str) -> bool {
    let state = app.state::<AppState>();
    if let Ok(runner) = state.runner() {
        if let Ok(devices) = device::list(&*runner) {
            let mut seen: Vec<String> = Vec::new();
            for entry in devices.iter().filter(|d| d.state == DeviceState::Device) {
                // The same phone can show up over USB and Wi-Fi.
                if let Some(phone) = visit(app, &runner, &entry.serial, pc, &seen) {
                    seen.push(phone);
                }
            }
        }
    }
    let requests = &state.requests;
    let ended = {
        let active = requests.active.lock().unwrap();
        requests
            .book
            .lock()
            .unwrap()
            .sweep(&|phone| active.contains_key(phone), Instant::now())
    };
    for (phone, batch, reason) in ended {
        end_batch(app, &phone, &batch, reason, "");
    }
    !requests.active.lock().unwrap().is_empty() || requests.book.lock().unwrap().is_active()
}

/// Tells the frontend that a group of requests is over.
fn end_batch(app: &AppHandle, phone: &str, batch: &str, reason: EndReason, detail: &str) {
    let state = app.state::<AppState>();
    state
        .requests
        .asks
        .lock()
        .unwrap()
        .remove(&format!("{phone}/{batch}"));
    let _ = PhoneBatchEnd {
        phone: phone.into(),
        batch: batch.into(),
        reason,
        detail: detail.into(),
    }
    .emit(app);
}

/// Removes the phone's cancel file, but only the one that names this request.
fn clear_cancel(id: &str) -> String {
    format!("[ \"$(cat {BOX}/cancel 2>/dev/null)\" = {id} ] && rm -f {BOX}/cancel; true")
}

/// One visit to one phone. Returns its `ro.serialno` when EasyAndroid is installed on it.
fn visit(
    app: &AppHandle,
    runner: &Arc<dyn AdbRunner>,
    serial: &str,
    pc: &str,
    seen: &[String],
) -> Option<String> {
    let state = app.state::<AppState>();
    let requests = &state.requests;
    let device = Device::new(&**runner, serial);
    // The status of the job that runs over this connection rides along with the visit.
    let job = requests
        .active
        .lock()
        .unwrap()
        .values()
        .find(|a| a.serial == serial)
        .map(|a| (a.id.clone(), a.latest.clone()));
    let out = match job {
        Some((id, latest)) => poll_with_progress(device, &id, &latest),
        None => device.script(&poll_script(None)),
    }
    .ok()?;
    let poll = parse_poll(&out)?;
    requests
        .phones
        .lock()
        .unwrap()
        .insert(serial.to_string(), poll.phone.clone());
    if seen.contains(&poll.phone) {
        return Some(poll.phone);
    }

    if let Some(active) = requests.active.lock().unwrap().get(&poll.phone) {
        requests
            .book
            .lock()
            .unwrap()
            .visited(&poll.phone, None, None, Instant::now());
        if poll.cancel.as_deref() == Some(active.id.as_str()) {
            active
                .cancelled_by
                .lock()
                .unwrap()
                .get_or_insert(EndReason::Phone);
            active.task.cancel();
        }
        return Some(poll.phone);
    }
    if let Some(json) = requests.unsent.lock().unwrap().remove(&poll.phone) {
        publish(device, &json);
        let _ = device.script(&format!("rm -f {BOX}/request.running {BOX}/request.owner"));
    } else if let (Some(text), Some(owner)) = (&poll.running, &poll.owner) {
        // This PC took the request and was closed before it ended.
        if owner == pc {
            if let Ok(request) = serde_json::from_str::<Request>(text) {
                let json = status_json(
                    &request.id,
                    "failed",
                    None,
                    Some("interrupted".into()),
                    vec![],
                );
                publish(device, &json);
            }
            let _ = device.script(&format!("rm -f {BOX}/request.running {BOX}/request.owner"));
        }
    }

    let request = poll
        .request
        .as_ref()
        .map(|text| serde_json::from_str::<Request>(text));
    let id = match &request {
        Some(Ok(r)) => Some(r.id.as_str()),
        _ => None,
    };
    let ended = requests.book.lock().unwrap().visited(
        &poll.phone,
        id,
        poll.cancel.as_deref(),
        Instant::now(),
    );
    for (batch, reason) in ended {
        if let Some(id) = poll.cancel.as_deref().filter(|id| is_request_id(id)) {
            let _ = device.script(&clear_cancel(id));
        }
        end_batch(app, &poll.phone, &batch, reason, "");
    }
    // A request that the phone has cancelled already is not taken up again.
    let cancelled = id.is_some() && id == poll.cancel.as_deref();
    match request {
        Some(Ok(request)) if !cancelled => handle(app, runner, serial, pc, &poll, request),
        Some(Err(err)) => {
            reject(device, "", "unreadable");
            end_batch(app, &poll.phone, "", EndReason::Invalid, &err.to_string());
        }
        _ => {}
    }
    Some(poll.phone)
}

fn reject(device: Device, id: &str, reason: &str) {
    publish(
        device,
        &status_json(id, "rejected", None, Some(reason.into()), vec![]),
    );
    let _ = device.script(&format!("rm -f {BOX}/request.json"));
}

/// Tells the phone what its request waits for.
fn wait(device: Device, id: &str, what: &str) {
    let latest = Latest {
        stage: what.into(),
        ..Default::default()
    };
    publish(
        device,
        &status_json(id, "waiting", Some(&latest), None, vec![]),
    );
}

fn handle(
    app: &AppHandle,
    runner: &Arc<dyn AdbRunner>,
    serial: &str,
    pc: &str,
    poll: &Poll,
    request: Request,
) {
    let state = app.state::<AppState>();
    let requests = &state.requests;
    let device = Device::new(&**runner, serial);
    let known = requests
        .book
        .lock()
        .unwrap()
        .knows(&poll.phone, request.batch(), &request.id);
    let checked = request.check().and_then(|work| {
        // The age only counts when the request is first seen; waiting here does not age it.
        if !known {
            request.check_age(poll.now)?;
        }
        Ok(work)
    });
    let work = match checked {
        Ok(work) => work,
        Err(err) => {
            let id = if is_request_id(&request.id) {
                request.id.as_str()
            } else {
                ""
            };
            reject(device, id, &err.detail);
            end_batch(app, &poll.phone, "", EndReason::Invalid, &err.detail);
            return;
        }
    };

    // A speed test always asks, even from a trusted phone: the user may not want one now.
    let allowed = trusted(app).contains(&poll.phone) && !matches!(work, Work::Speed(_));
    let step = requests.book.lock().unwrap().found(
        &poll.phone,
        request.batch(),
        &request.id,
        allowed,
        requests.is_held(&poll.phone),
        Instant::now(),
    );
    match step {
        Step::Wait => return,
        Step::Busy => return wait(device, &request.id, "busy"),
        Step::Reject(reason) => {
            let word = match reason {
                EndReason::Expired => "expired",
                EndReason::Rejected => "rejected",
                _ => "ended",
            };
            reject(device, &request.id, word);
            if reason == EndReason::Expired {
                end_batch(app, &poll.phone, request.batch(), reason, "");
            }
            return;
        }
        Step::Ask => {
            wait(device, &request.id, "approval");
            let ask = PhoneRequestAsk {
                phone: poll.phone.clone(),
                model: model(device),
                batch: request.batch().into(),
                kind: request.kind.clone(),
                names: request.names(),
                label: request.label().unwrap_or_default(),
                count: request.count(),
                data: request.data,
                obb: request.obb,
                external_data: request.external_data,
                seconds: crate::features::phone_batches::ASK_WAIT.as_secs() as u32,
            };
            requests
                .asks
                .lock()
                .unwrap()
                .insert(format!("{}/{}", poll.phone, request.batch()), ask.clone());
            crate::show_main_window(app);
            log::info!(
                "phone ask {} {} {}",
                poll.phone,
                request.batch(),
                request.kind
            );
            let _ = ask.emit(app);
            return;
        }
        Step::Run => {}
    }

    // The move makes this PC the one that owns the request, even when the phone shows up twice.
    if device
        .script(&format!(
            "mv {BOX}/request.json {BOX}/request.running && printf %s {pc} > {BOX}/request.owner"
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
    let cancelled_by = Arc::new(Mutex::new(None));
    let event = PhoneJobEvent {
        phone: poll.phone.clone(),
        model: model(device),
        batch: request.batch().into(),
        index: request.index,
        size: request.size(),
        id: request.id.clone(),
        kind: request.kind.clone(),
        names: request.names(),
        label: request.label().unwrap_or_default(),
        parts: request.parts(),
        state: TaskState::Running,
        error: None,
        reason: None,
        notes: vec![],
    };
    requests.active.lock().unwrap().insert(
        poll.phone.clone(),
        Active {
            id: request.id.clone(),
            serial: serial.to_string(),
            task: task.clone(),
            latest: latest.clone(),
            cancelled_by: cancelled_by.clone(),
            event: event.clone(),
        },
    );
    if request.index == 0 {
        crate::show_main_window(app);
    }
    let job = RunningJob {
        app: app.clone(),
        runner: runner.clone(),
        serial: serial.to_string(),
        event,
        work,
        task,
        task_id,
        latest,
        cancelled_by,
        _awake: Awake::start(),
    };
    std::thread::spawn(move || job.run());
}

/// The name the phone is sold under, or its model code when it does not say.
fn model(device: Device) -> String {
    ["ro.product.marketname", "ro.product.model"]
        .into_iter()
        .filter_map(|key| device.shell(&["getprop", key]).ok())
        .map(|value| value.trim().to_string())
        .find(|value| !value.is_empty())
        .unwrap_or_default()
}

struct RunningJob {
    app: AppHandle,
    runner: Arc<dyn AdbRunner>,
    serial: String,
    /// The event that announced the job; its end is the same event with the outcome filled in.
    event: PhoneJobEvent,
    work: Work,
    task: Arc<TaskHandle>,
    task_id: String,
    latest: Arc<Mutex<Latest>>,
    cancelled_by: Arc<Mutex<Option<EndReason>>>,
    _awake: Awake,
}

/// Why a failed job failed, as far as the connection goes.
pub fn is_connected(device: Device) -> bool {
    device.script("true").is_ok()
}

impl RunningJob {
    fn run(self) {
        log::info!(
            "phone job start {} {} {}",
            self.event.phone,
            self.event.id,
            self.event.kind
        );
        let _ = self.event.emit(&self.app);
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
        let connected = is_connected(device);
        let (phone, batch) = (&self.event.phone, &self.event.batch);
        let requests = &app_state(&self.app).requests;
        {
            let json = {
                let l = self.latest.lock().unwrap();
                status_json(&self.event.id, state, Some(&l), error, notes.clone())
            };
            // A status that did not arrive is kept for the next poll of the phone.
            if !finish_status(device, &self.latest, &json) || !connected {
                // Without its end the phone would wait for this job as soon as it is back.
                requests.unsent.lock().unwrap().insert(phone.clone(), json);
            }
        }
        if connected {
            let _ = device.script(&format!(
                "rm -f {BOX}/request.running {BOX}/request.owner; {}",
                clear_cancel(&self.event.id)
            ));
        }

        app_state(&self.app).tasks.finish(&self.task_id);
        let state = match &result {
            Ok(_) => TaskState::Done,
            Err(e) if e.code == ErrorCode::Cancelled => TaskState::Cancelled,
            Err(_) => TaskState::Failed,
        };
        let reason = match state {
            TaskState::Cancelled => {
                Some((*self.cancelled_by.lock().unwrap()).unwrap_or(EndReason::Pc))
            }
            TaskState::Failed if !connected => Some(EndReason::Disconnected),
            _ => None,
        };
        let last = self.event.index + 1 >= self.event.size;
        let ended = match reason {
            Some(EndReason::Disconnected) => None,
            Some(reason) => Some(reason),
            None => last.then_some(EndReason::Finished),
        }
        // The last one cannot be followed by anything, whatever happened to it.
        .or(reason.filter(|_| last));
        {
            let mut book = requests.book.lock().unwrap();
            book.touched(phone, batch, Instant::now());
            if ended.is_some() {
                book.end(phone, batch, Instant::now());
            }
        }
        requests.active.lock().unwrap().remove(phone);
        let _ = PhoneJobEvent {
            state,
            error: result.err(),
            reason,
            notes,
            ..self.event.clone()
        }
        .emit(&self.app);
        log::info!(
            "phone job end {} {} {state:?} {reason:?}",
            phone,
            self.event.id
        );
        if let Some(reason) = ended {
            end_batch(&self.app, phone, batch, reason, "");
        }
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
            Work::Speed(megabytes) => {
                let speed = speed::measure(device, *megabytes, &self.task, reporter)?;
                Ok(speed.notes())
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

/// Lets the user cancel from the PC what the phone asked for, also between two of its requests.
#[tauri::command]
#[specta::specta]
pub fn cancel_phone_job(app: AppHandle, state: State<'_, AppState>, phone: String, batch: String) {
    {
        let active = state.requests.active.lock().unwrap();
        if let Some(a) = active.get(&phone).filter(|a| a.event.batch == batch) {
            a.cancelled_by.lock().unwrap().get_or_insert(EndReason::Pc);
            a.task.cancel();
            return;
        }
    }
    state
        .requests
        .book
        .lock()
        .unwrap()
        .end(&phone, &batch, Instant::now());
    end_batch(&app, &phone, &batch, EndReason::Pc, "");
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

/// For a phone with EasyAndroid that the PC does not trust yet: its id, which trust is kept by.
#[tauri::command]
#[specta::specta]
pub async fn new_phone_to_trust(
    app: AppHandle,
    state: State<'_, AppState>,
    serial: String,
) -> AppResult<Option<String>> {
    let runner = state.runner()?;
    let id = blocking(move || {
        let device = Device::new(&*runner, &serial);
        let out = device.script(&poll_script(None))?;
        if parse_poll(&out).is_none() {
            return Ok(None);
        }
        Ok(Some(
            device
                .shell(&["getprop", "ro.serialno"])?
                .trim()
                .to_string(),
        ))
    })
    .await?;
    let never: Vec<String> = store::load(&app, NEVER_ASK_KEY);
    Ok(id.filter(|id| !trusted(&app).contains(id) && !never.contains(id)))
}

#[tauri::command]
#[specta::specta]
pub fn list_never_ask_phones(app: AppHandle) -> Vec<String> {
    store::load(&app, NEVER_ASK_KEY)
}

/// Stops or resumes asking whether a phone should be trusted.
#[tauri::command]
#[specta::specta]
pub fn never_ask_phone(app: AppHandle, phone: String, never: bool) -> AppResult<()> {
    let mut list: Vec<String> = store::load(&app, NEVER_ASK_KEY);
    list.retain(|p| *p != phone);
    if never {
        list.push(phone);
    }
    store::save(&app, NEVER_ASK_KEY, &list)
}

/// Adds a phone to the trusted list. Its requests start without asking after this.
#[tauri::command]
#[specta::specta]
pub fn trust_phone(app: AppHandle, phone: String) -> AppResult<()> {
    let mut list = trusted(&app);
    if !list.contains(&phone) {
        list.push(phone);
        store::save(&app, TRUSTED_KEY, &list)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adb::Tool;
    use crate::adb::client::Output;
    use std::process::Child;

    fn request(kind: &str, extra: &str) -> Request {
        serde_json::from_str(&format!(
            r#"{{"format":"easyandroid-request","version":1,"id":"a-1","created":1000,"type":"{kind}"{extra}}}"#
        ))
        .unwrap()
    }

    /// Records the status writes; the progress poll is slow to arrive.
    struct SlowPoll {
        entered: Mutex<std::sync::mpsc::Sender<()>>,
        writes: Mutex<Vec<String>>,
    }

    impl AdbRunner for SlowPoll {
        fn exec(&self, _: Tool, args: &[&str]) -> AppResult<Output> {
            let script = args.join(" ");
            if script.contains("@@request") {
                self.entered.lock().unwrap().send(()).unwrap();
                std::thread::sleep(Duration::from_millis(200));
            }
            self.writes.lock().unwrap().push(script);
            Ok(Output {
                success: true,
                stdout: String::new(),
                stderr: String::new(),
            })
        }

        fn spawn(&self, _: Tool, _: &[&str]) -> AppResult<Child> {
            unreachable!()
        }

        fn spawn_with_input(&self, _: Tool, _: &[&str]) -> AppResult<Child> {
            unreachable!()
        }
    }

    #[test]
    fn late_progress_never_lands_on_the_final_status() {
        let (entered, wait) = std::sync::mpsc::channel();
        let runner = SlowPoll {
            entered: Mutex::new(entered),
            writes: Mutex::new(vec![]),
        };
        let latest = Mutex::new(Latest::default());
        std::thread::scope(|scope| {
            scope.spawn(|| poll_with_progress(Device::new(&runner, "x"), "a-1", &latest));
            wait.recv().unwrap();
            let json = status_json("a-1", "done", None, None, vec![]);
            finish_status(Device::new(&runner, "x"), &latest, &json);
        });
        let writes = runner.writes.lock().unwrap();
        assert!(
            writes.last().unwrap().contains(r#""state":"done""#),
            "{writes:?}"
        );
    }

    #[test]
    fn names_the_app_and_its_parts() {
        let r = request(
            "app",
            r#","package":"com.a.b","label":" Tik\u0009Tok ","externalData":true"#,
        );
        assert_eq!(r.label().as_deref(), Some("TikTok"));
        assert_eq!(r.parts(), ["apk", "external"]);
        let old = request("app", r#","package":"com.a.b","data":true,"obb":true"#);
        assert_eq!(old.label(), None);
        assert_eq!(old.parts(), ["apk", "obb", "data"]);
        let other = request("pull", r#","ids":["a_1"],"label":"x""#);
        assert!(other.label().is_none() && other.parts().is_empty());
    }

    #[test]
    fn checks_an_app_request() {
        let r = request(
            "app",
            r#","package":"com.a.b","data":true,"externalData":true"#,
        );
        let Work::App { package, options } = r.check().unwrap() else {
            panic!("not an app request");
        };
        assert_eq!(package, "com.a.b");
        assert!(options.include_data && options.include_external && !options.include_obb);
    }

    #[test]
    fn refuses_what_could_reach_a_shell() {
        for bad in ["com.a; reboot", "nodots", "", "com.a b"] {
            let r = request("app", &format!(r#","package":"{bad}""#));
            assert!(r.check().is_err(), "{bad}");
        }
        let folders = request("folders", r#","names":["DCIM","../etc"]"#);
        assert!(folders.check().is_err());
        let pull = request("pull", r#","ids":["a_1","x;y"]"#);
        assert!(pull.check().is_err());
        let system = request("pull", r#","system":["../system_1.json"]"#);
        assert!(system.check().is_err());
        let ok = request(
            "pull",
            r#","ids":["a_1"],"system":["system_20260101-100000.json"]"#,
        );
        assert!(matches!(ok.check(), Ok(Work::Pull { .. })));
        assert!(request("pull", r#","ids":[]"#).check().is_err());
        assert!(request("wipe", "").check().is_err());
        assert!(request("speed", "").check().is_err());
        assert!(request("speed", r#","megabytes":257"#).check().is_err());
        assert_eq!(
            request("speed", r#","megabytes":32"#).check().unwrap(),
            Work::Speed(32)
        );
    }

    #[test]
    fn refuses_stale_future_and_foreign_requests() {
        let r = request("pull", r#","ids":["a_1"]"#);
        assert!(r.check_age(1000 + MAX_AGE).is_ok());
        assert!(r.check_age(1000 + MAX_AGE + 1).is_err());
        assert!(r.check_age(900).is_err());
        let mut other = r.clone();
        other.format = "something".into();
        assert!(other.check().is_err());
        let mut bad_id = r.clone();
        bad_id.id = "a/b".into();
        assert!(bad_id.check().is_err());
    }

    #[test]
    fn a_request_without_a_group_is_a_group_of_one() {
        let r = request("pull", r#","ids":["a_1"]"#);
        assert_eq!((r.batch(), r.index, r.size()), ("a-1", 0, 1));
        assert!(r.check().is_ok());
        let third = request("pull", r#","ids":["a_1"],"batch":"g-1","index":2,"size":3"#);
        assert_eq!((third.batch(), third.size()), ("g-1", 3));
        assert!(third.check().is_ok());
        for bad in [
            r#","batch":"g;1""#,
            r#","batch":"g","index":3,"size":3"#,
            r#","batch":"g","index":0,"size":1001"#,
        ] {
            let r = request("pull", &format!(r#","ids":["a_1"]{bad}"#));
            assert!(r.check().is_err(), "{bad}");
        }
    }

    #[test]
    fn only_the_cancel_of_this_request_is_removed() {
        let script = clear_cancel("a-1");
        assert!(script.contains("= a-1 ] && rm -f"));
    }

    #[test]
    fn a_held_phone_is_busy_until_the_job_ends() {
        let requests = Requests::default();
        requests
            .phones
            .lock()
            .unwrap()
            .extend([("usb".into(), "P".into()), ("wifi".into(), "P".into())]);
        let first = requests.hold("usb").unwrap();
        let second = requests.hold("wifi").unwrap();
        assert!(requests.is_held("P") && !requests.is_held("Q"));
        drop(first);
        assert!(requests.is_held("P"));
        drop(second);
        assert!(!requests.is_held("P"));
    }

    #[test]
    fn reads_who_took_the_running_request() {
        let out =
            "@@now\n5\n@@phone\nP\n@@request\n\n@@cancel\n\n@@owner\npc1\n@@running\n{}\n@@end\n";
        let poll = parse_poll(out).unwrap();
        assert_eq!(poll.owner.as_deref(), Some("pc1"));
        assert_eq!(poll.running.as_deref(), Some("{}"));
        assert_eq!(poll.request, None);
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
        // A request file without a final newline must not run into the next marker.
        assert!(plain.contains("request.json 2>/dev/null; echo;"));
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
            ..Default::default()
        };
        let json = status_json("a-1", "running", Some(&latest), None, vec!["n".into()]);
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["id"], "a-1");
        assert_eq!(value["state"], "running");
        assert_eq!(value["done"], 10);
        assert_eq!(value["notes"][0], "n");
    }
}
