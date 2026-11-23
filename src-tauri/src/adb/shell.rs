//! Helpers for building command strings that run in the device's POSIX shell.
//! `adb shell` joins its arguments into one string, so every argument we pass
//! must be quoted here instead of relying on host-side argument splitting.

use std::sync::LazyLock;

use regex::Regex;

use crate::error::{AppError, AppResult};

/// Quotes one argument for `sh`. Safe characters are passed through unchanged.
pub fn quote(arg: &str) -> String {
    let safe = !arg.is_empty()
        && arg
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_./:=@%+,".contains(&b));
    if safe {
        arg.to_string()
    } else {
        format!("'{}'", arg.replace('\'', r"'\''"))
    }
}

/// Quotes and joins arguments into a single shell command line.
pub fn join(args: &[&str]) -> String {
    args.iter().map(|a| quote(a)).collect::<Vec<_>>().join(" ")
}

static PACKAGE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$").unwrap());

/// Rejects anything that is not a valid Android package name before it reaches a shell.
pub fn validate_package(name: &str) -> AppResult<()> {
    if PACKAGE_RE.is_match(name) {
        Ok(())
    } else {
        Err(AppError::invalid_input(format!("invalid package name: {name}")))
    }
}

/// Rejects device paths that are relative or contain parent traversal or control characters.
pub fn validate_device_path(path: &str) -> AppResult<()> {
    let bad = !path.starts_with('/')
        || path.split('/').any(|part| part == "..")
        || path.chars().any(|c| c.is_control());
    if bad {
        Err(AppError::new(crate::error::ErrorCode::InvalidPath, path))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_only_when_needed() {
        assert_eq!(quote("com.example.app"), "com.example.app");
        assert_eq!(quote("/sdcard/Download"), "/sdcard/Download");
        assert_eq!(quote("my file.txt"), "'my file.txt'");
        assert_eq!(quote("a'b"), r"'a'\''b'");
        assert_eq!(quote("$(reboot)"), "'$(reboot)'");
        assert_eq!(quote(""), "''");
    }

    #[test]
    fn joins_arguments() {
        assert_eq!(join(&["ls", "-la", "/sdcard/My Files"]), "ls -la '/sdcard/My Files'");
    }

    #[test]
    fn validates_package_names() {
        assert!(validate_package("com.google.android.youtube").is_ok());
        assert!(validate_package("com.example_1.app2").is_ok());
        assert!(validate_package("nodots").is_err());
        assert!(validate_package("com.evil; reboot").is_err());
        assert!(validate_package("").is_err());
    }

    #[test]
    fn validates_device_paths() {
        assert!(validate_device_path("/sdcard/Download/a b.txt").is_ok());
        assert!(validate_device_path("relative/path").is_err());
        assert!(validate_device_path("/sdcard/../data").is_err());
        assert!(validate_device_path("/sdcard/a\nb").is_err());
    }
}
