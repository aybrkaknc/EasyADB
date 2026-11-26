//! Persistent settings and saved data in one JSON store file.

use serde::{Deserialize, Serialize, de::DeserializeOwned};
use specta::Type;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use crate::error::{AppError, AppResult, ErrorCode};

const STORE_FILE: &str = "easyadb.json";

#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// `None` follows the system language.
    pub language: Option<String>,
    /// `None` uses `Documents\EasyADB\Backups`.
    pub backup_dir: Option<String>,
    pub notifications: bool,
    pub sound: bool,
    pub confirm_destructive: bool,
    pub file_logging: bool,
    pub verify_hash_on_restore: bool,
    /// Closing the window hides it to the tray instead of quitting.
    pub close_to_tray: bool,
    /// Paired phones are connected as soon as they show up on the network.
    pub auto_connect: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: None,
            backup_dir: None,
            notifications: true,
            sound: true,
            confirm_destructive: true,
            file_logging: true,
            verify_hash_on_restore: false,
            close_to_tray: true,
            auto_connect: true,
        }
    }
}

fn store_err(err: tauri_plugin_store::Error) -> AppError {
    AppError::new(ErrorCode::Io, err.to_string())
}

pub fn load<T: DeserializeOwned + Default, R: Runtime>(app: &AppHandle<R>, key: &str) -> T {
    app.store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(key))
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

pub fn save<T: Serialize, R: Runtime>(app: &AppHandle<R>, key: &str, value: &T) -> AppResult<()> {
    let store = app.store(STORE_FILE).map_err(store_err)?;
    store.set(key, serde_json::to_value(value)?);
    store.save().map_err(store_err)
}

pub fn settings<R: Runtime>(app: &AppHandle<R>) -> Settings {
    load(app, "settings")
}
