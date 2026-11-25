use serde::{Deserialize, Serialize};
use specta::Type;

/// Stable error codes. The frontend translates them; `detail` carries the raw context.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    AdbMissing,
    AdbFailed,
    DeviceNotFound,
    DeviceUnauthorized,
    DeviceOffline,
    InvalidInput,
    InvalidPath,
    Io,
    Parse,
    BackupInvalid,
    IntegrityFailed,
    InstallFailed,
    PairFailed,
    ConnectFailed,
    Cancelled,
    NotFound,
    /// Not enough free space on the PC.
    NoSpace,
    /// A package that must not be disabled or removed.
    Protected,
    /// Another job runs on the same phone.
    Busy,
    /// The user of the phone said no, or did not answer.
    PhoneRejected,
    PhoneExpired,
    Internal,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type, thiserror::Error)]
#[error("{code:?}: {detail}")]
pub struct AppError {
    pub code: ErrorCode,
    pub detail: String,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(code: ErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }

    pub fn invalid_input(detail: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidInput, detail)
    }

    pub fn cancelled() -> Self {
        Self::new(ErrorCode::Cancelled, "")
    }

    /// Maps raw adb stderr/stdout text to the closest error code.
    pub fn from_adb_output(text: &str) -> Self {
        let lower = text.to_lowercase();
        let code = if lower.contains("unauthorized") {
            ErrorCode::DeviceUnauthorized
        } else if lower.contains("offline") {
            ErrorCode::DeviceOffline
        } else if lower.contains("not found") && lower.contains("device")
            || lower.contains("no devices")
        {
            ErrorCode::DeviceNotFound
        } else {
            ErrorCode::AdbFailed
        };
        Self::new(code, text.trim())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        Self::new(ErrorCode::Io, err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        Self::new(ErrorCode::Parse, err.to_string())
    }
}

impl From<tauri::Error> for AppError {
    fn from(err: tauri::Error) -> Self {
        Self::new(ErrorCode::Internal, err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_adb_errors() {
        let cases = [
            ("error: device unauthorized.", ErrorCode::DeviceUnauthorized),
            ("error: device offline", ErrorCode::DeviceOffline),
            ("error: device 'abc' not found", ErrorCode::DeviceNotFound),
            ("adb: no devices/emulators found", ErrorCode::DeviceNotFound),
            ("error: closed", ErrorCode::AdbFailed),
        ];
        for (text, code) in cases {
            assert_eq!(AppError::from_adb_output(text).code, code, "{text}");
        }
    }
}
