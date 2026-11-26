//! The single entry point for running adb and fastboot.

use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

use super::shell;
use crate::error::{AppError, AppResult, ErrorCode};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tool {
    Adb,
    Fastboot,
}

#[derive(Debug, Clone, Default)]
pub struct Output {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

impl Output {
    /// Returns stdout on success, otherwise a classified error.
    pub fn ok(self) -> AppResult<String> {
        if self.success {
            Ok(self.stdout)
        } else if self.stderr.trim().is_empty() {
            Err(AppError::from_adb_output(&self.stdout))
        } else {
            Err(AppError::from_adb_output(&self.stderr))
        }
    }
}

/// Abstraction over process execution so features can be tested with a fake.
pub trait AdbRunner: Send + Sync {
    fn exec(&self, tool: Tool, args: &[&str]) -> AppResult<Output>;
    /// Starts a process with piped stdout/stderr for streaming use.
    fn spawn(&self, tool: Tool, args: &[&str]) -> AppResult<Child>;
    /// Starts a process whose stdin the caller writes to. Its output is dropped.
    fn spawn_with_input(&self, tool: Tool, args: &[&str]) -> AppResult<Child>;
}

pub struct Adb {
    adb: PathBuf,
    fastboot: PathBuf,
}

/// The first 300 characters of a line that is logged.
fn clip(text: &str) -> String {
    text.chars().take(300).collect()
}

/// Finds `<name>.exe`, or the sidecar name `<name>-x86_64-pc-windows-msvc.exe` that Tauri
/// keeps in the source `binaries` folder.
fn find_tool(dir: &Path, name: &str) -> Option<PathBuf> {
    [
        format!("{name}.exe"),
        format!("{name}-x86_64-pc-windows-msvc.exe"),
    ]
    .into_iter()
    .map(|file| dir.join(file))
    .find(|path| path.is_file())
}

impl Adb {
    /// Uses the first folder that contains adb. adb.exe loads its DLLs from its own folder,
    /// so fastboot is taken from the same place.
    pub fn from_dirs(dirs: &[PathBuf]) -> AppResult<Self> {
        for dir in dirs {
            if let Some(adb) = find_tool(dir, "adb") {
                let fastboot =
                    find_tool(dir, "fastboot").unwrap_or_else(|| dir.join("fastboot.exe"));
                return Ok(Self { adb, fastboot });
            }
        }
        let searched = dirs
            .iter()
            .map(|d| d.display().to_string())
            .collect::<Vec<_>>()
            .join("; ");
        Err(AppError::new(ErrorCode::AdbMissing, searched))
    }

    fn command(&self, tool: Tool, args: &[&str]) -> Command {
        let program = match tool {
            Tool::Adb => &self.adb,
            Tool::Fastboot => &self.fastboot,
        };
        let mut cmd = Command::new(program);
        cmd.args(args)
            .stdin(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW);
        cmd
    }
}

fn decode(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).replace("\r\n", "\n")
}

impl AdbRunner for Adb {
    fn exec(&self, tool: Tool, args: &[&str]) -> AppResult<Output> {
        let started = std::time::Instant::now();
        let out = self.command(tool, args).output()?;
        let output = Output {
            success: out.status.success(),
            stdout: decode(&out.stdout),
            stderr: decode(&out.stderr),
        };
        // Only failures are written; logging every command would make the file huge.
        if !output.success {
            log::warn!(
                "{tool:?} {} failed in {} ms: {}",
                clip(&args.join(" ")),
                started.elapsed().as_millis(),
                clip(output.stderr.trim()),
            );
        }
        Ok(output)
    }

    fn spawn(&self, tool: Tool, args: &[&str]) -> AppResult<Child> {
        Ok(self
            .command(tool, args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?)
    }

    fn spawn_with_input(&self, tool: Tool, args: &[&str]) -> AppResult<Child> {
        Ok(self
            .command(tool, args)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()?)
    }
}

/// Commands scoped to one device serial.
#[derive(Clone, Copy)]
pub struct Device<'a> {
    runner: &'a dyn AdbRunner,
    serial: &'a str,
}

impl<'a> Device<'a> {
    pub fn new(runner: &'a dyn AdbRunner, serial: &'a str) -> Self {
        Self { runner, serial }
    }

    pub fn serial(&self) -> &str {
        self.serial
    }

    fn with_serial<'b>(&'b self, args: &[&'b str]) -> Vec<&'b str> {
        let mut full = vec!["-s", self.serial];
        full.extend_from_slice(args);
        full
    }

    pub fn adb_raw(&self, args: &[&str]) -> AppResult<Output> {
        self.runner.exec(Tool::Adb, &self.with_serial(args))
    }

    pub fn adb(&self, args: &[&str]) -> AppResult<String> {
        self.adb_raw(args)?.ok()
    }

    /// Runs a prepared shell script. Callers must quote untrusted parts with [`shell::quote`].
    pub fn script_raw(&self, script: &str) -> AppResult<Output> {
        self.adb_raw(&["shell", script])
    }

    pub fn script(&self, script: &str) -> AppResult<String> {
        self.script_raw(script)?.ok()
    }

    /// Runs one command on the device shell; every argument is quoted.
    pub fn shell(&self, args: &[&str]) -> AppResult<String> {
        self.script(&shell::join(args))
    }

    /// Runs a script as root through `su -c`.
    pub fn su(&self, script: &str) -> AppResult<String> {
        self.script(&shell::join(&["su", "-c", script]))
    }

    pub fn spawn(&self, args: &[&str]) -> AppResult<Child> {
        self.runner.spawn(Tool::Adb, &self.with_serial(args))
    }

    pub fn spawn_with_input(&self, args: &[&str]) -> AppResult<Child> {
        self.runner
            .spawn_with_input(Tool::Adb, &self.with_serial(args))
    }
}
