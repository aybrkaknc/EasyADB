//! Streaming helpers: device stdout to a local file with hashing, progress and
//! cancellation, plus in-place verification of stored files.

use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::Path;

use sha2::{Digest, Sha256};

use crate::adb::Device;
use crate::error::{AppError, AppResult, ErrorCode};
use crate::tasks::TaskHandle;

pub fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Wraps a reader, hashing and counting everything that passes through.
struct Tap<'a, R> {
    inner: R,
    hasher: Sha256,
    count: u64,
    task: &'a TaskHandle,
    on_bytes: &'a mut dyn FnMut(u64),
}

impl<R: Read> Read for Tap<'_, R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.task.is_cancelled() {
            // Not `Interrupted`: `io::copy` retries those forever.
            return Err(std::io::Error::other("cancelled"));
        }
        let n = self.inner.read(buf)?;
        self.hasher.update(&buf[..n]);
        self.count += n as u64;
        (self.on_bytes)(n as u64);
        Ok(n)
    }
}

fn map_cancel(task: &TaskHandle, err: AppError) -> AppError {
    if task.is_cancelled() {
        AppError::cancelled()
    } else {
        err
    }
}

/// Writes `reader` to `dest`. Returns the size and SHA-256.
pub fn store(
    reader: impl Read,
    dest: &Path,
    task: &TaskHandle,
    on_bytes: &mut dyn FnMut(u64),
) -> AppResult<(u64, String)> {
    let mut tap = Tap {
        inner: reader,
        hasher: Sha256::new(),
        count: 0,
        task,
        on_bytes,
    };
    let mut out = BufWriter::new(File::create(dest)?);
    std::io::copy(&mut tap, &mut out)
        .map(|_| ())
        .and_then(|_| out.flush())
        .map_err(|e| map_cancel(task, e.into()))?;
    Ok((tap.count, to_hex(&tap.hasher.finalize())))
}

/// Runs `adb exec-out <script>` and stores its stdout in `dest`.
pub fn pull(
    device: Device,
    script: &str,
    dest: &Path,
    task: &TaskHandle,
    on_bytes: &mut dyn FnMut(u64),
) -> AppResult<(u64, String)> {
    let mut child = device.spawn(&["exec-out", script])?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::new(ErrorCode::Internal, "no stdout"))?;
    let mut stderr = child.stderr.take();
    let stderr_reader = std::thread::spawn(move || {
        let mut text = String::new();
        if let Some(err) = stderr.as_mut() {
            let _ = err.read_to_string(&mut text);
        }
        text
    });
    task.attach(child);
    let stored = store(BufReader::new(stdout), dest, task, on_bytes);
    let status = task.detach().map(|mut c| c.wait()).transpose()?;
    let stderr_text = stderr_reader.join().unwrap_or_default();
    task.check()?;
    let stored = stored?;
    match status {
        Some(s) if !s.success() => Err(AppError::from_adb_output(&stderr_text)),
        _ => Ok(stored),
    }
}

/// Verifies a stored file in place without copying it: size always, SHA-256 when requested.
pub fn verify_in_place(
    path: &Path,
    expected_size: u64,
    expected_sha: Option<&str>,
    task: &TaskHandle,
    on_bytes: &mut dyn FnMut(u64),
) -> AppResult<()> {
    let actual_size = std::fs::metadata(path)?.len();
    if expected_sha.is_none() {
        return check(actual_size, "", expected_size, None, path);
    }
    let mut tap = Tap {
        inner: BufReader::new(File::open(path)?),
        hasher: Sha256::new(),
        count: 0,
        task,
        on_bytes,
    };
    std::io::copy(&mut tap, &mut std::io::sink()).map_err(|e| map_cancel(task, e.into()))?;
    check(
        tap.count,
        &to_hex(&tap.hasher.finalize()),
        expected_size,
        expected_sha,
        path,
    )
}

fn check(
    size: u64,
    sha: &str,
    expected_size: u64,
    expected_sha: Option<&str>,
    path: &Path,
) -> AppResult<()> {
    let bad_size = size != expected_size;
    let bad_hash = expected_sha.is_some_and(|want| !want.eq_ignore_ascii_case(sha));
    if bad_size || bad_hash {
        Err(AppError::new(
            ErrorCode::IntegrityFailed,
            path.display().to_string(),
        ))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ABC_SHA: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

    #[test]
    fn stores_with_size_hash_and_progress() {
        let dir = tempfile::tempdir().unwrap();
        let task = TaskHandle::default();
        let dest = dir.path().join("out");
        let mut seen = 0;
        let (size, sha) = store(&b"abc"[..], &dest, &task, &mut |n| seen += n).unwrap();
        assert_eq!((size, seen), (3, 3));
        assert_eq!(sha, ABC_SHA);
        assert_eq!(std::fs::read(&dest).unwrap(), b"abc");
    }

    #[test]
    fn verifies_size_and_hash_in_place() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("f");
        std::fs::write(&path, b"abc").unwrap();
        let task = TaskHandle::default();
        verify_in_place(&path, 3, None, &task, &mut |_| {}).unwrap();
        verify_in_place(&path, 3, Some(ABC_SHA), &task, &mut |_| {}).unwrap();
        assert!(verify_in_place(&path, 4, None, &task, &mut |_| {}).is_err());
        let err = verify_in_place(&path, 3, Some("00"), &task, &mut |_| {}).unwrap_err();
        assert_eq!(err.code, ErrorCode::IntegrityFailed);
    }

    #[test]
    fn cancelled_tasks_stop_storing() {
        let dir = tempfile::tempdir().unwrap();
        let task = TaskHandle::default();
        task.cancel_for_test();
        let err = store(&b"abc"[..], &dir.path().join("o"), &task, &mut |_| {}).unwrap_err();
        assert_eq!(err.code, ErrorCode::Cancelled);
    }
}
