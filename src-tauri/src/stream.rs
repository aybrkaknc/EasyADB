//! Line-by-line streaming of a child process' stdout and stderr.

use std::io::Read;
use std::process::Child;
use std::sync::mpsc;
use std::thread;

use crate::error::{AppError, AppResult, ErrorCode};
use crate::events::StreamKind;
use crate::tasks::TaskHandle;

/// Splits a byte stream into lines on `\n` or `\r` (adb redraws progress with `\r`).
pub fn split_lines(reader: impl Read, mut on_line: impl FnMut(String)) {
    let mut reader = reader;
    let mut buf = [0u8; 8192];
    let mut line = Vec::new();
    while let Ok(n) = reader.read(&mut buf) {
        if n == 0 {
            break;
        }
        for &b in &buf[..n] {
            if b == b'\n' || b == b'\r' {
                if !line.is_empty() {
                    on_line(String::from_utf8_lossy(&line).into_owned());
                    line.clear();
                }
            } else {
                line.push(b);
            }
        }
    }
    if !line.is_empty() {
        on_line(String::from_utf8_lossy(&line).into_owned());
    }
}

/// Streams both pipes of `child` through `on_line` until it exits; returns the exit code.
/// The child is attached to `task` so cancelling the task kills it.
pub fn run(
    task: &TaskHandle,
    mut child: Child,
    mut on_line: impl FnMut(StreamKind, String),
) -> AppResult<Option<i32>> {
    let (tx, rx) = mpsc::channel::<(StreamKind, String)>();
    let mut readers = Vec::new();
    if let Some(out) = child.stdout.take() {
        let tx = tx.clone();
        readers.push(thread::spawn(move || {
            split_lines(out, |l| drop(tx.send((StreamKind::Stdout, l))))
        }));
    }
    if let Some(err) = child.stderr.take() {
        let tx = tx.clone();
        readers.push(thread::spawn(move || {
            split_lines(err, |l| drop(tx.send((StreamKind::Stderr, l))))
        }));
    }
    drop(tx);
    task.attach(child);
    for (kind, line) in rx {
        on_line(kind, line);
    }
    for reader in readers {
        let _ = reader.join();
    }
    let status = match task.detach() {
        Some(mut child) => child.wait()?,
        None => return Err(AppError::new(ErrorCode::Internal, "process handle lost")),
    };
    task.check()?;
    Ok(status.code())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_on_newlines_and_carriage_returns() {
        let mut lines = Vec::new();
        split_lines(
            "a\r\nserving (~10%)\rserving (~20%)\nlast".as_bytes(),
            |l| lines.push(l),
        );
        assert_eq!(lines, vec!["a", "serving (~10%)", "serving (~20%)", "last"]);
    }
}
