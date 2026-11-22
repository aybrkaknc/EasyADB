mod adb;
mod commands;
mod services;

use commands::{backup, cache, debloater, device, labels, sideload, tools};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: None,
                    }),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                ])
                .level(log::LevelFilter::Info)
                .filter(|metadata| {
                    // Filter out verbose logs from html parsing libraries
                    !metadata.target().starts_with("html5ever")
                        && !metadata.target().starts_with("scraper")
                        && !metadata.target().starts_with("selectors")
                })
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            device::get_connected_devices,
            device::check_root_status,
            device::check_device_integrity,
            backup::list_packages,
            backup::perform_backup,
            backup::get_package_size,
            backup::list_backups,
            backup::perform_restore,
            backup::delete_backup,
            backup::get_default_backup_path,
            tools::run_adb_command,
            tools::check_tools,
            tools::install_tools,
            debloater::list_all_packages,
            debloater::disable_pkg,
            debloater::enable_pkg,
            debloater::uninstall_pkg,
            debloater::reinstall_pkg,
            sideload::perform_sideload,
            labels::resolve_package_label,
            cache::get_cached_packages,
            cache::sync_device_packages,
            cache::sync_backup_packages
        ])
        .setup(|app| {
            // Initialize PackageDB
            let db = services::package_db::PackageDB::new(app.handle());
            app.manage(db);

            // Initialize DeviceCache
            let device_cache = services::device_cache::DeviceCache::new(app.handle());
            app.manage(device_cache);

            match adb::init() {
                Ok(path) => {
                    log::info!("ADB initialized at: {:?}", path);
                }
                Err(e) => {
                    log::error!("Failed to initialize ADB: {}", e);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
