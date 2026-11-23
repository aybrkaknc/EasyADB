//! Runs one adb or fastboot command line and streams its output.

use tauri::{AppHandle, State};
use tauri_specta::Event;

use crate::adb::Tool;
use crate::error::{AppError, AppResult};
use crate::events::{CommandOutput, StreamKind};
use crate::state::{AppState, blocking};
use crate::stream;

/// Splits a command line into arguments, honouring single and double quotes.
pub fn tokenize(line: &str) -> AppResult<Vec<String>> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut has_token = false;
    for c in line.chars() {
        match (quote, c) {
            (Some(q), c) if c == q => quote = None,
            (Some(_), c) => current.push(c),
            (None, '"' | '\'') => {
                quote = Some(c);
                has_token = true;
            }
            (None, c) if c.is_whitespace() => {
                if has_token {
                    args.push(std::mem::take(&mut current));
                    has_token = false;
                }
            }
            (None, c) => {
                current.push(c);
                has_token = true;
            }
        }
    }
    if quote.is_some() {
        return Err(AppError::invalid_input("unterminated quote"));
    }
    if has_token {
        args.push(current);
    }
    Ok(args)
}

const GLOBAL_COMMANDS: &[&str] = &[
    "devices",
    "connect",
    "disconnect",
    "pair",
    "start-server",
    "kill-server",
    "version",
    "mdns",
    "help",
];

/// Picks the tool and adds `-s <serial>` when the command targets a device.
pub fn resolve(mut args: Vec<String>, serial: Option<&str>) -> AppResult<(Tool, Vec<String>)> {
    let tool = match args.first().map(String::as_str) {
        Some("fastboot") => {
            args.remove(0);
            Tool::Fastboot
        }
        Some("adb") => {
            args.remove(0);
            Tool::Adb
        }
        Some(_) => Tool::Adb,
        None => return Err(AppError::invalid_input("empty command")),
    };
    if args.is_empty() {
        return Err(AppError::invalid_input("missing command"));
    }
    let explicit = args.first().is_some_and(|a| a == "-s");
    let global = tool == Tool::Adb && GLOBAL_COMMANDS.contains(&args[0].as_str());
    if let (Some(serial), false, false) = (serial, explicit, global) {
        args.splice(0..0, ["-s".to_string(), serial.to_string()]);
    }
    Ok((tool, args))
}

#[tauri::command]
#[specta::specta]
pub async fn run_terminal(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    serial: Option<String>,
    line: String,
) -> AppResult<Option<i32>> {
    let runner = state.runner()?;
    let task = state.tasks.start(&task_id);
    let id = task_id.clone();
    let result = blocking(move || {
        let (tool, args) = resolve(tokenize(&line)?, serial.as_deref())?;
        let args: Vec<&str> = args.iter().map(String::as_str).collect();
        let child = runner.spawn(tool, &args)?;
        let emit = |kind, text: String, exit_code| {
            let _ = CommandOutput {
                task_id: id.clone(),
                kind,
                text,
                exit_code,
            }
            .emit(&app);
        };
        let code = stream::run(&task, child, |kind, text| emit(kind, text, None));
        emit(
            StreamKind::Exit,
            String::new(),
            code.as_ref().ok().copied().flatten(),
        );
        code
    })
    .await;
    state.tasks.finish(&task_id);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn tokenizes_quotes() {
        assert_eq!(
            tokenize("shell ls '/sdcard/My Files'").unwrap(),
            s(&["shell", "ls", "/sdcard/My Files"])
        );
        assert_eq!(
            tokenize(r#"push "a b.txt" /sdcard/"#).unwrap(),
            s(&["push", "a b.txt", "/sdcard/"])
        );
        assert_eq!(
            tokenize("shell echo ''").unwrap(),
            s(&["shell", "echo", ""])
        );
        assert!(tokenize("shell 'oops").is_err());
    }

    #[test]
    fn resolves_tool_and_serial() {
        let (tool, args) = resolve(s(&["adb", "shell", "ls"]), Some("X")).unwrap();
        assert_eq!((tool, args), (Tool::Adb, s(&["-s", "X", "shell", "ls"])));
        let (tool, args) = resolve(s(&["fastboot", "devices"]), Some("X")).unwrap();
        assert_eq!((tool, args), (Tool::Fastboot, s(&["-s", "X", "devices"])));
        assert_eq!(
            resolve(s(&["devices"]), Some("X")).unwrap().1,
            s(&["devices"])
        );
        assert_eq!(
            resolve(s(&["-s", "Y", "reboot"]), Some("X")).unwrap().1,
            s(&["-s", "Y", "reboot"])
        );
        assert!(resolve(s(&["adb"]), None).is_err());
    }
}
