mod adb;
mod error;
mod events;
mod features;
mod state;
mod store;
mod tasks;
mod tray;

use tauri::{Manager, WindowEvent, Wry};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
use tauri_specta::{Builder, collect_commands, collect_events};

use features::{device, settings};

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
            device::list_devices,
            device::get_device_details,
            device::check_device_root,
            device::reboot_device,
        ])
        .events(collect_events![events::TaskProgress, events::CommandOutput])
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
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main_window(app)))
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([Target::new(TargetKind::Stdout), Target::new(TargetKind::LogDir { file_name: None })])
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
            if let Ok(runner) = app.state::<state::AppState>().runner() {
                // Start the adb server early so the first device query is fast.
                std::thread::spawn(move || {
                    let _ = runner.exec(adb::Tool::Adb, &["start-server"]);
                });
            }
            show_main_window(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if store::settings(window.app_handle()).close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
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
