//! Copies files between the PC and the phone with progress in bytes.
//!
//! `adb push` and `adb pull` report nothing when their output is not a terminal. A large file is
//! therefore streamed into `cat` on the phone and counted on the way, and a download is measured
//! by what has arrived on the PC.

use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use specta::Type;

use crate::adb::{Device, shell};
use crate::diskspace;
use crate::error::{AppError, AppResult, ErrorCode};
use crate::tasks::{Reporter, TaskHandle};

/// Files from this size on are streamed. Smaller ones travel together with `adb push`.
const STREAM_FROM: u64 = 8 * 1024 * 1024;
/// The longest command line that is built from many paths. Windows allows about 32,000.
const LINE: usize = 8_000;
const CHUNK: usize = 1 << 20;
/// The first piece of a streamed file, and the limits of the pieces after it.
const PIECE: u64 = 4 * 1024 * 1024;
const PIECE_MIN: u64 = 1024 * 1024;
const PIECE_MAX: u64 = 32 * 1024 * 1024;
/// How long one piece should take, in seconds.
const PIECE_SECONDS: f64 = 2.0;
const WATCH: Duration = Duration::from_millis(500);
const MEDIA: [&str; 16] = [
    "jpg", "jpeg", "png", "gif", "webp", "heic", "bmp", "mp4", "mkv", "mov", "avi", "webm", "mp3",
    "m4a", "flac", "ogg",
];

/// How a transfer ended. A transfer that was cut off is not an error of the command, because what
/// did arrive matters to the user.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TransferReport {
    /// Selected items that arrived completely.
    pub done: u32,
    pub total: u32,
    pub bytes: f64,
    /// A file that may be incomplete on the receiving side.
    pub partial: Option<String>,
    /// Why it stopped; null when everything arrived.
    pub error: Option<AppError>,
}

fn join(dir: &str, name: &str) -> String {
    if dir.ends_with('/') {
        format!("{dir}{name}")
    } else {
        format!("{dir}/{name}")
    }
}

/// One file on the PC and where it goes on the phone.
#[derive(Debug, Clone, PartialEq)]
pub struct Source {
    pub local: PathBuf,
    pub remote: String,
    pub size: u64,
    /// Unix seconds.
    pub modified: u64,
}

/// One selected item with everything below it.
#[derive(Debug, Default)]
pub struct Item {
    pub name: String,
    /// Folders to make on the phone, parents first.
    pub dirs: Vec<String>,
    pub files: Vec<Source>,
}

fn walk(local: &Path, remote: String, item: &mut Item, task: &TaskHandle) -> AppResult<()> {
    task.check()?;
    let meta = fs::metadata(local)?;
    if !meta.is_dir() {
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_secs());
        item.files.push(Source {
            local: local.to_path_buf(),
            remote,
            size: meta.len(),
            modified,
        });
        return Ok(());
    }
    item.dirs.push(remote.clone());
    let mut entries: Vec<_> = fs::read_dir(local)?.collect::<Result<_, _>>()?;
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        // A link to a folder is left out: it can point back to a folder above it.
        if entry.file_type()?.is_symlink() && entry.path().is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        walk(&entry.path(), join(&remote, &name), item, task)?;
    }
    Ok(())
}

/// What there is to send from the selected paths into `target`.
pub fn scan(paths: &[String], target: &str, task: &TaskHandle) -> AppResult<Vec<Item>> {
    paths
        .iter()
        .map(|path| {
            let path = Path::new(path);
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .ok_or_else(|| AppError::new(ErrorCode::InvalidPath, path.display().to_string()))?;
            let mut item = Item {
                name: name.clone(),
                ..Item::default()
            };
            walk(path, join(target, &name), &mut item, task)?;
            Ok(item)
        })
        .collect()
}

/// The free bytes in a `df -k` line, which stand before the percentage.
fn parse_df(output: &str) -> Option<u64> {
    let fields: Vec<&str> = output.lines().last()?.split_whitespace().collect();
    let percent = fields.iter().position(|f| f.ends_with('%'))?;
    let kilobytes: u64 = fields.get(percent.checked_sub(1)?)?.parse().ok()?;
    Some(kilobytes.saturating_mul(1024))
}

/// The detail of a lack of space: what is needed and what is free, in bytes.
fn no_space(code: ErrorCode, needed: u64, free: u64) -> AppError {
    AppError::new(code, format!("{needed}/{free}"))
}

/// Fails when the phone says that `needed` bytes do not fit. An unknown free space passes.
fn ensure_phone_space(device: Device, target: &str, needed: u64) -> AppResult<()> {
    let out = device.script(&format!("df -k {}", shell::quote(target)));
    match out.ok().as_deref().and_then(parse_df) {
        Some(free) if free < needed => Err(no_space(ErrorCode::PhoneNoSpace, needed, free)),
        _ => Ok(()),
    }
}

/// Splits `words` into runs whose joined length stays below [`LINE`].
fn runs<T>(words: &[T], length: impl Fn(&T) -> usize) -> Vec<&[T]> {
    let mut out = Vec::new();
    let (mut start, mut used) = (0, 0);
    for (i, word) in words.iter().enumerate() {
        let n = length(word) + 3;
        if i > start && used + n > LINE {
            out.push(&words[start..i]);
            (start, used) = (i, 0);
        }
        used += n;
    }
    if start < words.len() {
        out.push(&words[start..]);
    }
    out
}

/// Splits small files into calls that stay short and carry no more than [`STREAM_FROM`] bytes.
fn batches<'a, 'b>(files: &'a [&'b Source]) -> Vec<&'a [&'b Source]> {
    let mut out = Vec::new();
    for run in runs(files, |f| f.local.as_os_str().len()) {
        let (mut start, mut bytes) = (0, 0);
        for (i, file) in run.iter().enumerate() {
            if i > start && bytes + file.size > STREAM_FROM {
                out.push(&run[start..i]);
                (start, bytes) = (i, 0);
            }
            bytes += file.size;
        }
        out.push(&run[start..]);
    }
    out
}

fn parent(remote: &str) -> &str {
    remote.rsplit_once('/').map_or("/", |(dir, _)| dir)
}

/// Told the place of the item that is being sent, and its bytes that went and that it has.
pub type Watch<'a> = &'a dyn Fn(usize, u64, u64);

/// Where the bytes of an upload are counted.
struct Count<'a> {
    reporter: &'a Reporter,
    watch: Watch<'a>,
    done: u64,
    total: u64,
    /// The item that is being sent, the bytes before it and its own.
    item: usize,
    before: u64,
    size: u64,
}

impl Count<'_> {
    fn add(&mut self, bytes: u64, name: &str) {
        self.done += bytes;
        self.report(name);
    }

    fn report(&self, name: &str) {
        (self.watch)(self.item, self.done - self.before, self.size);
        self.reporter
            .progress("push", name, self.done as f64, self.total as f64);
    }
}

fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

/// The size of the next piece: what went in [`PIECE_SECONDS`] at the speed of the last one.
fn next_piece(bytes: u64, elapsed: Duration) -> u64 {
    let wanted = bytes as f64 / elapsed.as_secs_f64().max(0.001) * PIECE_SECONDS;
    (wanted as u64).clamp(PIECE_MIN, PIECE_MAX)
}

/// Appends the next `length` bytes of `source` to a file on the phone.
fn append(
    device: Device,
    source: &mut fs::File,
    quoted: &str,
    length: u64,
    task: &TaskHandle,
) -> AppResult<()> {
    let mut child = device.spawn_with_input(&["exec-in", &format!("cat >> {quoted}")])?;
    let mut input = child
        .stdin
        .take()
        .ok_or_else(|| AppError::new(ErrorCode::Internal, "no stdin"))?;
    task.attach(child);
    let mut chunk = vec![0u8; CHUNK];
    let sent = (|| -> AppResult<()> {
        let mut left = length;
        while left > 0 {
            task.check()?;
            let most = left.min(CHUNK as u64) as usize;
            let n = source.read(&mut chunk[..most])?;
            if n == 0 {
                return Err(AppError::new(ErrorCode::Io, "the file got shorter"));
            }
            input.write_all(&chunk[..n])?;
            left -= n as u64;
        }
        Ok(())
    })();
    drop(input);
    if let Some(mut child) = task.detach() {
        let _ = child.wait();
    }
    // A cancel kills adb, which shows up as a failed write.
    task.check()?;
    sent
}

/// Waits until the phone has written `size` bytes. `exec-in` ends when the adb server holds the
/// bytes, not when they are on the phone, and does not pass on an exit code, so only the size
/// tells. Gives up when the file stops growing for ten seconds.
fn confirm(device: Device, quoted: &str, size: u64) -> AppResult<()> {
    let arrived = device.script(&format!(
        "last=; i=0; while :; do b=$(stat -c %s {quoted} 2>/dev/null); \
         [ \"$b\" = {size} ] && break; if [ \"$b\" = \"$last\" ]; then i=$((i+1)); else i=0; fi; \
         [ $i -ge 50 ] && break; last=$b; sleep 0.2; done; echo $b"
    ))?;
    if arrived.trim().parse::<u64>().ok() != Some(size) {
        return Err(AppError::new(
            ErrorCode::AdbFailed,
            format!("{} of {size} bytes", arrived.trim()),
        ));
    }
    Ok(())
}

/// Streams one file into `cat` on the phone, a piece at a time. The adb server would take a whole
/// file at once and hold every other command back until it is delivered, so each piece has to
/// arrive before the next one leaves. That also makes the progress what is really on the phone.
fn stream(device: Device, file: &Source, task: &TaskHandle, count: &mut Count) -> AppResult<()> {
    let mut source = fs::File::open(&file.local)?;
    let quoted = shell::quote(&file.remote);
    let name = file_name(&file.remote);
    device.script(&format!(": > {quoted}"))?;
    count.report(name);
    let (mut sent, mut piece) = (0, PIECE);
    while sent < file.size {
        task.check()?;
        let length = piece.min(file.size - sent);
        let started = Instant::now();
        append(device, &mut source, &quoted, length, task)?;
        sent += length;
        confirm(device, &quoted, sent)?;
        piece = next_piece(length, started.elapsed());
        count.add(length, name);
    }
    let _ = device.script(&format!(
        "touch -m -d @{} {quoted} 2>/dev/null; true",
        file.modified
    ));
    Ok(())
}

/// Tells the phone's gallery about new pictures, videos and music.
fn scan_media(device: Device, files: &[Source]) {
    let media: Vec<String> = files
        .iter()
        .filter(|f| {
            let extension = f.remote.rsplit_once('.').map(|(_, e)| e.to_lowercase());
            extension.is_some_and(|e| MEDIA.contains(&e.as_str()))
        })
        .filter_map(|f| {
            let shared = f.remote.strip_prefix("/sdcard/");
            match shared {
                Some(rest) => Some(format!("/storage/emulated/0/{rest}")),
                None => f.remote.starts_with("/storage/").then(|| f.remote.clone()),
            }
        })
        .map(|path| shell::quote(&path))
        .collect();
    for run in runs(&media, String::len) {
        let _ = device.script(&format!(
            "for f in {}; do content call --uri content://media --method scan_file --arg \"$f\" \
             >/dev/null 2>&1; done; true",
            run.join(" ")
        ));
    }
}

/// Sends one item. `partial` holds the file that is being written while it is not complete.
fn send_item(
    device: Device,
    item: &Item,
    task: &TaskHandle,
    count: &mut Count,
    partial: &mut Option<String>,
) -> AppResult<()> {
    let dirs: Vec<String> = item.dirs.iter().map(|d| shell::quote(d)).collect();
    for run in runs(&dirs, String::len) {
        task.check()?;
        device.script(&format!("mkdir -p {}", run.join(" ")))?;
    }
    let (large, small): (Vec<&Source>, Vec<&Source>) =
        item.files.iter().partition(|f| f.size >= STREAM_FROM);
    // Small files of one folder go in one call, as long as the call stays short.
    for folder in small.chunk_by(|a, b| parent(&a.remote) == parent(&b.remote)) {
        for run in batches(folder) {
            task.check()?;
            let target = format!("{}/", parent(&run[0].remote));
            let locals: Vec<String> = run
                .iter()
                .map(|f| f.local.to_string_lossy().into_owned())
                .collect();
            let name = file_name(&run[0].remote);
            count.report(name);
            *partial = Some(match run {
                [only] => only.remote.clone(),
                _ => target.clone(),
            });
            let mut args = vec!["push"];
            args.extend(locals.iter().map(String::as_str));
            // One file is pushed to its full name, so that a different local name cannot matter.
            args.push(match run {
                [only] => &only.remote,
                _ => &target,
            });
            device.adb(&args)?;
            *partial = None;
            count.add(run.iter().map(|f| f.size).sum(), name);
        }
    }
    for file in large {
        task.check()?;
        *partial = Some(file.remote.clone());
        stream(device, file, task, count)?;
        *partial = None;
    }
    Ok(())
}

/// An upload that fits on the phone and has not started yet.
#[derive(Debug)]
pub struct Upload {
    pub items: Vec<Item>,
    /// Bytes of everything.
    pub total: u64,
}

/// Reads what is to be sent and checks that the phone has room for it.
pub fn plan(
    device: Device,
    paths: &[String],
    target: &str,
    task: &TaskHandle,
) -> AppResult<Upload> {
    shell::validate_device_path(target)?;
    let items = scan(paths, target, task)?;
    let total = items.iter().flat_map(|i| &i.files).map(|f| f.size).sum();
    ensure_phone_space(device, target, total)?;
    Ok(Upload { items, total })
}

/// Copies the planned files and folders to the phone.
pub fn push(
    device: Device,
    upload: &Upload,
    task: &TaskHandle,
    reporter: &Reporter,
    watch: Watch,
) -> TransferReport {
    let mut count = Count {
        reporter,
        watch,
        done: 0,
        total: upload.total,
        item: 0,
        before: 0,
        size: 0,
    };
    let (mut done, mut partial, mut error) = (0, None, None);
    for (index, item) in upload.items.iter().enumerate() {
        count.item = index;
        count.before = count.done;
        count.size = item.files.iter().map(|f| f.size).sum();
        match send_item(device, item, task, &mut count, &mut partial) {
            Ok(()) => {
                done += 1;
                scan_media(device, &item.files);
            }
            Err(err) => {
                error = Some(if task.is_cancelled() {
                    AppError::cancelled()
                } else {
                    err
                });
                break;
            }
        }
    }
    TransferReport {
        done,
        total: upload.items.len() as u32,
        bytes: count.done as f64,
        partial,
        error,
    }
}

/// A file below a downloaded item, by the path under the PC folder.
#[derive(Debug, Clone, PartialEq)]
struct Expected {
    local: PathBuf,
    size: u64,
}

/// Reads `size path` lines of the files below `root`, which arrive under `local_dir/<name>`.
fn parse_sizes(root: &str, local_dir: &Path, output: &str) -> Vec<Expected> {
    let base = local_dir.join(file_name(root));
    output
        .lines()
        .filter_map(|line| {
            let (size, path) = line.split_once(' ')?;
            let rest = path.strip_prefix(root)?;
            let local = rest
                .split('/')
                .filter(|part| !part.is_empty())
                .fold(base.clone(), |at, part| at.join(part));
            Some(Expected {
                local,
                size: size.parse().ok()?,
            })
        })
        .collect()
}

/// What a file looked like, to tell whether the download has touched it.
fn look(path: &Path) -> Option<(u64, Option<SystemTime>)> {
    let meta = fs::metadata(path).ok()?;
    Some((meta.len(), meta.modified().ok()))
}

/// How many bytes of `files` have arrived, and a file that is only partly there. A file that was
/// on the PC before counts once the download changes it.
fn arrived(
    files: &[Expected],
    before: &HashMap<PathBuf, (u64, Option<SystemTime>)>,
) -> (u64, Option<PathBuf>) {
    let (mut bytes, mut partial) = (0, None);
    for file in files {
        let now = look(&file.local);
        if now.is_none() || now == before.get(&file.local).copied() {
            continue;
        }
        let length = now.map_or(0, |(length, _)| length);
        bytes += length.min(file.size);
        if length < file.size {
            partial = Some(file.local.clone());
        }
    }
    (bytes, partial)
}

/// Pulls one item and reports how much of it is there.
fn receive_item(
    device: Device,
    path: &str,
    local_dir: &str,
    files: &[Expected],
    before: &HashMap<PathBuf, (u64, Option<SystemTime>)>,
    task: &TaskHandle,
    report: impl Fn(u64),
) -> AppResult<()> {
    let mut child = device.spawn(&["pull", "-a", path, local_dir])?;
    // Both pipes are read to the end, so that adb never waits for room in them.
    let drain = |pipe: Option<Box<dyn Read + Send>>| {
        std::thread::spawn(move || {
            let mut text = String::new();
            if let Some(mut pipe) = pipe {
                let mut bytes = Vec::new();
                let _ = pipe.read_to_end(&mut bytes);
                text = String::from_utf8_lossy(&bytes).into_owned();
            }
            text
        })
    };
    let out = drain(child.stdout.take().map(|p| Box::new(p) as _));
    let err = drain(child.stderr.take().map(|p| Box::new(p) as _));
    task.attach(child);
    let status = loop {
        match task.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => {}
            Err(e) => break Err(e),
        }
        std::thread::sleep(WATCH);
        report(arrived(files, before).0);
    };
    task.detach();
    task.check()?;
    if !status?.success() {
        let text = err.join().unwrap_or_default();
        let text = if text.trim().is_empty() {
            out.join().unwrap_or_default()
        } else {
            text
        };
        return Err(AppError::from_adb_output(&text));
    }
    Ok(())
}

/// The files below a phone path, as `size path` lines.
fn list_sizes(device: Device, path: &str) -> AppResult<String> {
    shell::validate_device_path(path)?;
    device.script(&format!(
        "find -H {} -type f -exec stat -c '%s %n' {{}} + 2>/dev/null; true",
        shell::quote(path)
    ))
}

/// The bytes of each phone path.
pub fn sizes(device: Device, paths: &[String]) -> AppResult<Vec<f64>> {
    paths
        .iter()
        .map(|path| {
            let out = list_sizes(device, path)?;
            let files = parse_sizes(path, Path::new(""), &out);
            Ok(files.iter().map(|f| f.size).sum::<u64>() as f64)
        })
        .collect()
}

/// Copies phone files and folders into a folder of the PC.
pub fn pull(
    device: Device,
    paths: &[String],
    local_dir: &str,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<TransferReport> {
    let root = Path::new(local_dir);
    let items = paths
        .iter()
        .map(|path| {
            task.check()?;
            let out = list_sizes(device, path)?;
            Ok((path, parse_sizes(path, root, &out)))
        })
        .collect::<AppResult<Vec<_>>>()?;
    let total: u64 = items.iter().flat_map(|(_, f)| f).map(|f| f.size).sum();
    if let Some(free) = diskspace::free_bytes(root) {
        if free < total {
            return Err(no_space(ErrorCode::NoSpace, total, free));
        }
    }
    let (mut done, mut sum, mut partial, mut error) = (0, 0u64, None, None);
    for (path, files) in &items {
        let name = file_name(path);
        reporter.progress("pull", name, sum as f64, total as f64);
        let before: HashMap<_, _> = files
            .iter()
            .filter_map(|f| Some((f.local.clone(), look(&f.local)?)))
            .collect();
        let result = receive_item(device, path, local_dir, files, &before, task, |bytes| {
            reporter.progress("pull", name, (sum + bytes) as f64, total as f64);
        });
        match result {
            Ok(()) => {
                done += 1;
                sum += files.iter().map(|f| f.size).sum::<u64>();
            }
            Err(err) => {
                let (bytes, half) = arrived(files, &before);
                sum += bytes;
                partial = half.map(|p| p.display().to_string());
                error = Some(if task.is_cancelled() {
                    AppError::cancelled()
                } else {
                    err
                });
                break;
            }
        }
    }
    Ok(TransferReport {
        done,
        total: items.len() as u32,
        bytes: sum as f64,
        partial,
        error,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adb::fake::FakeAdb;

    fn tree() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("album/empty")).unwrap();
        fs::write(dir.path().join("album/a.jpg"), b"12345").unwrap();
        fs::write(dir.path().join("album/b.txt"), b"123").unwrap();
        fs::write(dir.path().join("note's.txt"), b"12").unwrap();
        dir
    }

    fn selected(dir: &tempfile::TempDir) -> Vec<String> {
        ["album", "note's.txt"]
            .iter()
            .map(|n| dir.path().join(n).display().to_string())
            .collect()
    }

    fn send(fake: &FakeAdb, paths: &[String]) -> AppResult<TransferReport> {
        let device = Device::new(fake, "X");
        let task = TaskHandle::default();
        let upload = plan(device, paths, "/sdcard/Download", &task)?;
        Ok(push(
            device,
            &upload,
            &task,
            &Reporter::silent(),
            &|_, _, _| {},
        ))
    }

    #[test]
    fn walks_folders_and_adds_up_the_bytes() {
        let dir = tree();
        let items = scan(&selected(&dir), "/sdcard/Download", &TaskHandle::default()).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(
            items[0].dirs,
            ["/sdcard/Download/album", "/sdcard/Download/album/empty"]
        );
        assert_eq!(items[0].files.iter().map(|f| f.size).sum::<u64>(), 8);
        assert_eq!(items[1].files[0].remote, "/sdcard/Download/note's.txt");
    }

    #[test]
    fn sends_small_files_of_a_folder_together_and_scans_media() {
        let dir = tree();
        let fake = FakeAdb::new()
            .on("df -k", "/dev/fuse 100 1 99 1% /storage/emulated")
            .on("mkdir -p", "")
            .on(" push ", "")
            .on("scan_file", "");
        let report = send(&fake, &selected(&dir)).unwrap();
        assert!(report.error.is_none(), "{:?}", report.error);
        assert_eq!((report.done, report.total, report.bytes), (2, 2, 10.0));
        let pushes: Vec<_> = fake
            .calls()
            .into_iter()
            .filter(|c| c.contains(" push "))
            .collect();
        assert_eq!(pushes.len(), 2);
        assert!(pushes[0].ends_with("/sdcard/Download/album/"));
        let scans = fake.calls().join("\n");
        assert!(scans.contains("/storage/emulated/0/Download/album/a.jpg"));
        assert!(!scans.contains("emulated/0/Download/album/b.txt"));
    }

    #[test]
    fn a_failed_push_names_what_may_be_incomplete() {
        let dir = tree();
        let mut paths = selected(&dir);
        paths.reverse();
        let failing = FakeAdb::new()
            .on("df -k", "")
            .on("mkdir -p", "")
            .on_fail("b.txt", "remote write failed")
            .on(" push ", "")
            .on("scan_file", "");
        let report = send(&failing, &paths).unwrap();
        assert_eq!((report.done, report.total), (1, 2));
        assert!(report.error.is_some());
    }

    #[test]
    fn refuses_what_does_not_fit_on_the_phone() {
        let dir = tree();
        let fake = FakeAdb::new().on("df -k", "/dev/fuse 100 100 0 100% /storage/emulated");
        let err = send(&fake, &selected(&dir)).unwrap_err();
        assert_eq!(err.code, ErrorCode::PhoneNoSpace);
        assert_eq!(err.detail, "10/0");
    }

    #[test]
    fn sizes_a_piece_by_the_speed_of_the_link() {
        let second = Duration::from_secs(1);
        assert_eq!(next_piece(8 << 20, second), 16 << 20);
        assert_eq!(next_piece(100 << 20, second), PIECE_MAX);
        assert_eq!(next_piece(1 << 10, second), PIECE_MIN);
        assert_eq!(next_piece(PIECE, Duration::ZERO), PIECE_MAX);
    }

    #[test]
    fn limits_the_bytes_of_one_call() {
        let file = |size| Source {
            local: PathBuf::from("a"),
            remote: "/sdcard/a".into(),
            size,
            modified: 0,
        };
        let files: Vec<Source> = (0..5).map(|_| file(3 << 20)).collect();
        let refs: Vec<&Source> = files.iter().collect();
        let split = batches(&refs);
        assert_eq!(split.iter().map(|b| b.len()).sum::<usize>(), 5);
        assert!(
            split
                .iter()
                .all(|b| b.len() == 1 || b.iter().map(|f| f.size).sum::<u64>() <= STREAM_FROM)
        );
    }

    #[test]
    fn counts_what_a_download_has_brought() {
        let dir = tempfile::tempdir().unwrap();
        let files = parse_sizes(
            "/sdcard/Download/album",
            dir.path(),
            "10 /sdcard/Download/album/a b.jpg\n4 /sdcard/Download/album/sub/c\n",
        );
        assert_eq!(files[0].local, dir.path().join("album").join("a b.jpg"));
        fs::create_dir_all(dir.path().join("album")).unwrap();
        fs::write(&files[0].local, b"123").unwrap();
        assert_eq!(
            arrived(&files, &HashMap::new()),
            (3, Some(files[0].local.clone()))
        );
        // Untouched files that were there before do not count.
        let before = HashMap::from([(files[0].local.clone(), look(&files[0].local).unwrap())]);
        assert_eq!(arrived(&files, &before), (0, None));
        assert_eq!(
            parse_sizes("/sdcard/x.zip", dir.path(), "7 /sdcard/x.zip\n")[0].local,
            dir.path().join("x.zip")
        );
    }

    #[test]
    fn reads_the_free_space_and_keeps_command_lines_short() {
        let df = "Filesystem 1K-blocks Used Available Use% Mounted on\n/dev/fuse 100 40 60 40% /x";
        assert_eq!(parse_df(df), Some(60 * 1024));
        assert_eq!(parse_df("df: nothing"), None);
        let words = vec!["x".repeat(3000); 5];
        let split = runs(&words, String::len);
        assert_eq!(split.iter().map(|r| r.len()).collect::<Vec<_>>(), [2, 2, 1]);
    }
}
