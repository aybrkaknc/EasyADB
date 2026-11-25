//! Transfer speed between this PC and a phone, over the connection adb uses.
//!
//! The phone asks for it from EasyAndroid's settings. Random bytes are sent both ways, because
//! adb squeezes anything that repeats and the result would say nothing about a backup.

use std::io::{Read, Write};
use std::time::{Duration, Instant};

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, State};

use crate::adb::Device;
use crate::error::{AppError, AppResult, ErrorCode};
use crate::state::{AppState, blocking};
use crate::tasks::{Reporter, TaskHandle};

const REMOTE: &str = "/data/local/tmp/easyadb-speed.bin";
pub const MAX_MEGABYTES: u32 = 256;
/// How much goes each way when the test is started on the PC.
const MEGABYTES: u32 = 32;

/// Measured speeds in megabytes per second (1 MB = 1,000,000 bytes).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Speed {
    pub to_pc: f64,
    pub to_phone: f64,
}

impl Speed {
    /// The notes that the phone reads: `speed_to_pc:<MB/s>` and `speed_to_phone:<MB/s>`.
    pub fn notes(&self) -> Vec<String> {
        vec![
            format!("speed_to_pc:{:.2}", self.to_pc),
            format!("speed_to_phone:{:.2}", self.to_phone),
        ]
    }
}

fn rate(bytes: u64, elapsed: Duration) -> f64 {
    let secs = elapsed.as_secs_f64();
    if secs <= 0.0 {
        0.0
    } else {
        bytes as f64 / 1_000_000.0 / secs
    }
}

/// Reads `megabytes` of random bytes from the phone. The clock starts with the first chunk, so that
/// starting adb is not counted.
fn from_phone(
    device: Device,
    megabytes: u32,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<f64> {
    let bytes = megabytes as u64 * 1_000_000;
    let mut child = device.spawn(&["exec-out", &format!("head -c {bytes} /dev/urandom")])?;
    let mut out = child
        .stdout
        .take()
        .ok_or_else(|| AppError::new(ErrorCode::Internal, "no stdout"))?;
    task.attach(child);
    let mut buffer = vec![0u8; 1 << 17];
    let (mut total, mut first, mut start) = (0u64, 0u64, None::<Instant>);
    let read = loop {
        if task.is_cancelled() {
            break Ok(());
        }
        match out.read(&mut buffer) {
            Ok(0) => break Ok(()),
            Ok(n) => {
                if start.is_none() {
                    start = Some(Instant::now());
                    first = n as u64;
                }
                total += n as u64;
                reporter.progress("speed", "to_pc", total as f64, bytes as f64);
            }
            Err(e) => break Err(e),
        }
    };
    let elapsed = start.map(|s| s.elapsed()).unwrap_or_default();
    if let Some(mut child) = task.detach() {
        let _ = child.wait();
    }
    task.check()?;
    read?;
    if total < bytes {
        return Err(AppError::new(
            ErrorCode::AdbFailed,
            format!("{total} of {bytes} bytes"),
        ));
    }
    Ok(rate(total - first, elapsed))
}

/// Streams `megabytes` of random bytes into a file on the phone, then removes it. The bytes go
/// through adb's stdin, so the progress is the real number of bytes sent.
fn to_phone(
    device: Device,
    megabytes: u32,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<f64> {
    let bytes = megabytes as u64 * 1_000_000;
    let mut child = device.spawn_with_input(&["exec-in", &format!("cat > {REMOTE}")])?;
    let mut input = child
        .stdin
        .take()
        .ok_or_else(|| AppError::new(ErrorCode::Internal, "no stdin"))?;
    task.attach(child);
    let mut chunk = vec![0u8; 1 << 20];
    // A cheap generator is enough: the bytes only have to not compress.
    let mut state = 0x9E37_79B9_7F4A_7C15_u64 ^ bytes;
    let (mut sent, mut start) = (0u64, None::<Instant>);
    let mut written: AppResult<()> = Ok(());
    while sent < bytes {
        if let Err(e) = task.check() {
            written = Err(e);
            break;
        }
        for part in chunk.chunks_mut(8) {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            part.copy_from_slice(&state.to_le_bytes()[..part.len()]);
        }
        let n = (bytes - sent).min(chunk.len() as u64) as usize;
        start.get_or_insert_with(Instant::now);
        if let Err(e) = input.write_all(&chunk[..n]) {
            written = Err(e.into());
            break;
        }
        sent += n as u64;
        reporter.progress("speed", "to_phone", sent as f64, bytes as f64);
    }
    drop(input);
    if let Some(mut child) = task.detach() {
        let _ = child.wait();
    }
    // adb still holds sent bytes until it ends, so the clock stops here and not at the last write.
    let elapsed = start.map(|s| s.elapsed()).unwrap_or_default();
    let arrived = take_size(device);
    task.check()?;
    written?;
    check_arrived(arrived, bytes)?;
    Ok(rate(bytes, elapsed))
}

/// How much of the test file is on the phone. Removes the file on every path.
fn take_size(device: Device) -> Option<u64> {
    // The phone may still be writing what it got, so the size is read until it settles.
    device
        .script(&format!(
            "a=-1; for i in 1 2 3 4 5 6 7 8 9 10; do b=$(stat -c %s {REMOTE} 2>/dev/null); \
             [ \"$a\" = \"$b\" ] && break; a=$b; sleep 0.2; done; echo $b; rm -f {REMOTE}"
        ))
        .ok()?
        .trim()
        .parse()
        .ok()
}

/// `adb exec-in` does not pass the exit code on, so only the size tells a cut-off transfer.
fn check_arrived(arrived: Option<u64>, bytes: u64) -> AppResult<()> {
    if arrived == Some(bytes) {
        return Ok(());
    }
    Err(AppError::new(
        ErrorCode::AdbFailed,
        format!("{} of {bytes} bytes", arrived.unwrap_or(0)),
    ))
}

/// Measures both directions with `megabytes` each.
pub fn measure(
    device: Device,
    megabytes: u32,
    task: &TaskHandle,
    reporter: &Reporter,
) -> AppResult<Speed> {
    if megabytes == 0 || megabytes > MAX_MEGABYTES {
        return Err(AppError::invalid_input("megabytes"));
    }
    let to_pc = from_phone(device, megabytes, task, reporter)?;
    let to_phone = to_phone(device, megabytes, task, reporter)?;
    Ok(Speed { to_pc, to_phone })
}

/// The speed test started on the PC. It only needs adb, so EasyAndroid is not involved.
#[tauri::command]
#[specta::specta]
pub async fn start_speed_test(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    serial: String,
) -> AppResult<Speed> {
    let runner = state.runner()?;
    let _hold = state.requests.hold(&serial)?;
    let task = state.tasks.start(&task_id);
    let reporter = Reporter::new(app, &task_id);
    let result = blocking(move || {
        let result = measure(Device::new(&*runner, &serial), MEGABYTES, &task, &reporter);
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
    fn rates_are_megabytes_per_second() {
        assert_eq!(rate(32_000_000, Duration::from_secs(2)), 16.0);
        assert_eq!(rate(1, Duration::ZERO), 0.0);
    }

    #[test]
    fn the_phone_reads_the_speeds_from_notes() {
        let speed = Speed {
            to_pc: 12.345,
            to_phone: 9.0,
        };
        assert_eq!(speed.notes(), ["speed_to_pc:12.35", "speed_to_phone:9.00"]);
    }

    #[test]
    fn refuses_sizes_that_are_not_a_test() {
        let fake = FakeAdb::new();
        for mb in [0, MAX_MEGABYTES + 1] {
            let err = measure(
                Device::new(&fake, "X"),
                mb,
                &TaskHandle::default(),
                &Reporter::silent(),
            )
            .unwrap_err();
            assert_eq!(err.code, ErrorCode::InvalidInput);
        }
        assert!(fake.calls().is_empty());
    }

    #[test]
    fn a_cut_off_transfer_is_not_a_result() {
        assert!(check_arrived(Some(1_000_000), 1_000_000).is_ok());
        for arrived in [None, Some(0), Some(999_999)] {
            let err = check_arrived(arrived, 1_000_000).unwrap_err();
            assert_eq!(err.code, ErrorCode::AdbFailed);
        }
    }

    #[test]
    fn leaves_nothing_on_the_phone() {
        let fake = FakeAdb::new().on("stat -c", "1000000\n");
        assert_eq!(take_size(Device::new(&fake, "X")), Some(1_000_000));
        let calls = fake.calls();
        assert!(calls.iter().any(|c| c.contains(&format!("rm -f {REMOTE}"))));
    }
}
