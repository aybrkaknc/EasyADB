//! Streaming helpers: device stdout to local file with hashing, optional
//! encryption, progress and cancellation; and the reverse for restore.

use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::Path;

use sha2::{Digest, Sha256};

use super::crypto::{self, Key};
use crate::adb::Device;
use crate::error::{AppError, AppResult, ErrorCode};
use crate::tasks::TaskHandle;

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
            return Err(std::io::Error::new(
                std::io::ErrorKind::Interrupted,
                "cancelled",
            ));
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

/// Writes `reader` to `dest` (encrypted when `key` is set). Returns plaintext size and SHA-256.
pub fn store(
    reader: impl Read,
    dest: &Path,
    key: Option<&Key>,
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
    let result = match key {
        Some(key) => crypto::encrypt_stream(key, &mut tap, &mut out).map(|_| ()),
        None => std::io::copy(&mut tap, &mut out)
            .map(|_| ())
            .map_err(AppError::from),
    };
    result
        .and_then(|_| out.flush().map_err(AppError::from))
        .map_err(|e| map_cancel(task, e))?;
    Ok((tap.count, crypto::to_hex(&tap.hasher.finalize())))
}

/// Runs `adb exec-out <script>` and stores its stdout in `dest`.
pub fn pull(
    device: Device,
    script: &str,
    dest: &Path,
    key: Option<&Key>,
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
    let stored = store(BufReader::new(stdout), dest, key, task, on_bytes);
    let status = task.detach().map(|mut c| c.wait()).transpose()?;
    let stderr_text = stderr_reader.join().unwrap_or_default();
    task.check()?;
    let stored = stored?;
    match status {
        Some(s) if !s.success() => Err(AppError::from_adb_output(&stderr_text)),
        _ => Ok(stored),
    }
}

/// Produces a plaintext copy of a stored file in `dest`, verifying size and optionally the hash.
pub fn unpack(
    src: &Path,
    dest: &Path,
    key: Option<&Key>,
    expected_size: u64,
    expected_sha: Option<&str>,
    task: &TaskHandle,
    on_bytes: &mut dyn FnMut(u64),
) -> AppResult<()> {
    let mut input = BufReader::new(File::open(src)?);
    let mut out = TapWriter {
        inner: BufWriter::new(File::create(dest)?),
        hasher: Sha256::new(),
        count: 0,
        task,
        on_bytes,
    };
    let result = match key {
        Some(key) => crypto::decrypt_stream(key, input, &mut out).map(|_| ()),
        None => std::io::copy(&mut input, &mut out)
            .map(|_| ())
            .map_err(AppError::from),
    };
    result
        .and_then(|_| out.inner.flush().map_err(AppError::from))
        .map_err(|e| map_cancel(task, e))?;
    let sha = crypto::to_hex(&out.hasher.finalize());
    check(out.count, &sha, expected_size, expected_sha, src)
}

/// Hashes and counts everything written through it.
struct TapWriter<'a, W> {
    inner: W,
    hasher: Sha256,
    count: u64,
    task: &'a TaskHandle,
    on_bytes: &'a mut dyn FnMut(u64),
}

impl<W: Write> Write for TapWriter<'_, W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        if self.task.is_cancelled() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Interrupted,
                "cancelled",
            ));
        }
        let n = self.inner.write(buf)?;
        self.hasher.update(&buf[..n]);
        self.count += n as u64;
        (self.on_bytes)(n as u64);
        Ok(n)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.inner.flush()
    }
}

/// Verifies an unencrypted stored file in place without copying it.
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
        &crypto::to_hex(&tap.hasher.finalize()),
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

    #[test]
    fn stores_and_unpacks_with_and_without_key() {
        let dir = tempfile::tempdir().unwrap();
        let task = TaskHandle::default();
        let data = vec![42u8; 3 * 1024 * 1024 + 5];
        let key = crypto::new_key("pw").unwrap().0;

        for key in [None, Some(&key)] {
            let stored = dir.path().join("stored");
            let mut seen = 0;
            let (size, sha) =
                store(data.as_slice(), &stored, key, &task, &mut |n| seen += n).unwrap();
            assert_eq!((size, seen), (data.len() as u64, data.len() as u64));

            let plain = dir.path().join("plain");
            unpack(&stored, &plain, key, size, Some(&sha), &task, &mut |_| {}).unwrap();
            assert_eq!(std::fs::read(&plain).unwrap(), data);

            let err =
                unpack(&stored, &plain, key, size, Some("00"), &task, &mut |_| {}).unwrap_err();
            assert_eq!(err.code, ErrorCode::IntegrityFailed);
        }
    }

    #[test]
    fn verifies_size_and_hash_in_place() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("f");
        std::fs::write(&path, b"abc").unwrap();
        let task = TaskHandle::default();
        let sha = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        verify_in_place(&path, 3, None, &task, &mut |_| {}).unwrap();
        verify_in_place(&path, 3, Some(sha), &task, &mut |_| {}).unwrap();
        assert!(verify_in_place(&path, 4, None, &task, &mut |_| {}).is_err());
    }
}
