//! Scripted `AdbRunner` for unit tests. Rules match when the joined argument
//! string contains the pattern; the first matching rule wins.

use std::process::Child;
use std::sync::Mutex;

use super::client::{AdbRunner, Output, Tool};
use crate::error::{AppError, AppResult, ErrorCode};

#[derive(Default)]
pub struct FakeAdb {
    rules: Vec<(String, Output)>,
    calls: Mutex<Vec<String>>,
}

impl FakeAdb {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn on(mut self, pattern: &str, stdout: &str) -> Self {
        let out = Output {
            success: true,
            stdout: stdout.into(),
            stderr: String::new(),
        };
        self.rules.push((pattern.into(), out));
        self
    }

    pub fn on_fail(mut self, pattern: &str, stderr: &str) -> Self {
        let out = Output {
            success: false,
            stdout: String::new(),
            stderr: stderr.into(),
        };
        self.rules.push((pattern.into(), out));
        self
    }

    pub fn calls(&self) -> Vec<String> {
        self.calls.lock().unwrap().clone()
    }
}

impl AdbRunner for FakeAdb {
    fn exec(&self, tool: Tool, args: &[&str]) -> AppResult<Output> {
        let prefix = if tool == Tool::Fastboot {
            "fastboot "
        } else {
            ""
        };
        let joined = format!("{prefix}{}", args.join(" "));
        self.calls.lock().unwrap().push(joined.clone());
        let rule = self
            .rules
            .iter()
            .find(|(pattern, _)| joined.contains(pattern.as_str()));
        Ok(rule.map(|(_, out)| out.clone()).unwrap_or_else(|| Output {
            success: false,
            stdout: String::new(),
            stderr: format!("fake: no rule for `{joined}`"),
        }))
    }

    fn spawn(&self, _tool: Tool, _args: &[&str]) -> AppResult<Child> {
        Err(AppError::new(
            ErrorCode::Internal,
            "fake runner cannot spawn",
        ))
    }

    fn spawn_with_input(&self, tool: Tool, args: &[&str]) -> AppResult<Child> {
        self.spawn(tool, args)
    }
}
