//! Keeps Windows from going to sleep while a job runs, and counts the jobs that run.

use std::sync::OnceLock;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{Sender, channel};

static RUNNING: AtomicUsize = AtomicUsize::new(0);

/// How many long jobs run right now.
pub fn running() -> usize {
    RUNNING.load(Ordering::SeqCst)
}

/// One running job. The PC may sleep again once the last guard is dropped.
pub struct Awake(());

impl Awake {
    pub fn start() -> Self {
        if RUNNING.fetch_add(1, Ordering::SeqCst) == 0 {
            changed();
        }
        Self(())
    }
}

impl Drop for Awake {
    fn drop(&mut self) {
        if RUNNING.fetch_sub(1, Ordering::SeqCst) == 1 {
            changed();
        }
    }
}

/// The sleep state belongs to the thread that set it, so one thread that never ends sets it.
fn changed() {
    static THREAD: OnceLock<Sender<()>> = OnceLock::new();
    let sender = THREAD.get_or_init(|| {
        let (sender, receiver) = channel();
        std::thread::spawn(move || {
            while receiver.recv().is_ok() {
                keep_awake(running() > 0);
            }
        });
        sender
    });
    let _ = sender.send(());
}

#[cfg(windows)]
fn keep_awake(on: bool) {
    const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;
    const ES_CONTINUOUS: u32 = 0x8000_0000;
    unsafe extern "system" {
        fn SetThreadExecutionState(flags: u32) -> u32;
    }
    let flags = if on {
        ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    } else {
        ES_CONTINUOUS
    };
    // SAFETY: takes plain flags and no pointers.
    unsafe { SetThreadExecutionState(flags) };
}

#[cfg(not(windows))]
fn keep_awake(_on: bool) {}
