mod adb;
mod awake;
mod diskspace;
mod error;
mod events;
mod features;
mod state;
mod store;
mod stream;
mod tasks;
mod tray;

use tauri::{Manager, WindowEvent, Wry};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use tauri_specta::{Builder, collect_commands, collect_events};

use features::{
    backup, debloat, debugging, device, files, logcat, packages, performance, phone_jobs,
    phone_requests, settings, sideload, speed, system_backup, terminal, wireless,
};

pub fn specta_builder() -> Builder<Wry> {
    Builder::<Wry>::new()
        .commands(collect_commands![
            settings::get_settings,
            settings::save_settings,
            settings::get_backup_root,
            settings::open_log_dir,
            settings::reveal_path,
            settings::cancel_task,
            tray::set_tray_labels,
            tray::quit_app,
            device::list_devices,
            device::get_device_details,
            device::check_device_root,
            device::reboot_device,
            packages::list_device_apps,
            packages::get_app_sizes,
            backup::list_backups,
            backup::start_backup,
            backup::start_restore,
            backup::list_phone_backups,
            backup::list_phone_system,
            backup::pull_phone_backups,
            backup::list_file_sets,
            backup::delete_phone_backups,
            backup::push_backup_to_phone,
            backup::start_folder_backup,
            phone_jobs::start_phone_job,
            phone_requests::answer_phone_request,
            phone_requests::list_trusted_phones,
            phone_requests::forget_trusted_phone,
            phone_requests::cancel_phone_job,
            phone_requests::is_easyandroid_ready,
            phone_requests::new_phone_to_trust,
            phone_requests::trust_phone,
            phone_requests::list_never_ask_phones,
            phone_requests::never_ask_phone,
            phone_requests::phone_activity,
            speed::start_speed_test,
            system_backup::list_system_backups,
            system_backup::restore_system_backup,
            backup::delete_backup,
            backup::export_backup,
            backup::import_backup,
            debloat::list_debloat_apps,
            debloat::apply_debloat,
            debloat::save_debloat_profile,
            debloat::load_debloat_profile,
            wireless::wireless_pair,
            wireless::wireless_connect,
            wireless::wireless_disconnect,
            wireless::wireless_enable_tcpip,
            wireless::wireless_new_qr,
            wireless::wireless_find_pairing,
            wireless::wireless_discover,
            wireless::wireless_forget,
            wireless::wireless_connect_usb,
            debugging::get_debug_settings,
            debugging::set_debug_setting,
            debugging::revoke_authorizations,
            debugging::open_phone_settings,
            debugging::get_adb_info,
            debugging::restart_adb_server,
            debugging::reconnect_offline,
            terminal::run_terminal,
            sideload::sideload_zip,
            sideload::install_apk,
            performance::get_live_metrics,
            performance::get_hardware_info,
            performance::get_network_info,
            files::list_files,
            files::make_dir,
            files::delete_paths,
            files::move_path,
            files::pull_paths,
            files::push_paths,
            logcat::start_logcat,
            logcat::clear_logcat,
            settings::save_text_file,
            settings::open_web_search,
        ])
        .events(collect_events![
            events::TaskProgress,
            events::CommandOutput,
            events::PhoneRequestAsk,
            events::PhoneJobEvent,
            events::PhoneBatchEnd,
            events::QuitAsk,
            logcat::LogcatBatch
        ])
}

fn export_bindings(builder: &Builder<Wry>) {
    builder
        .export(
            specta_typescript::Typescript::default().header("// @ts-nocheck"),
            "../src/bindings.ts",
        )
        .expect("failed to export TypeScript bindings");
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn run() {
    let builder = specta_builder();
    #[cfg(debug_assertions)]
    export_bindings(&builder);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app)
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .max_file_size(5_000_000)
                .rotation_strategy(RotationStrategy::KeepSome(3))
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .manage(state::AppState::new())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            settings::apply_logging(store::settings(app.handle()).file_logging);
            tray::create(app.handle())?;
            match app.state::<state::AppState>().runner() {
                Ok(runner) => {
                    log::info!("EasyADB {} started", env!("CARGO_PKG_VERSION"));
                    // Start the adb server early so the first device query is fast.
                    std::thread::spawn(move || {
                        let _ = runner.exec(adb::Tool::Adb, &["start-server"]);
                    });
                }
                Err(err) => log::error!("adb sidecar not available: {err}"),
            }
            phone_requests::start(app.handle().clone());
            wireless::watch(app.handle().clone());
            show_main_window(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if store::settings(window.app_handle()).close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                } else if awake::running() > 0 {
                    api.prevent_close();
                    tray::ask_to_quit(window.app_handle());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    /// Regenerates `src/bindings.ts`; CI fails if the committed file is stale.
    #[test]
    fn export_bindings() {
        super::export_bindings(&super::specta_builder());
    }
}
