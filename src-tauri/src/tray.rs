//! System tray icon with Show and Quit items. Labels come from the frontend's i18n.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, Wry};
use tauri_specta::Event;

use crate::awake;
use crate::error::AppResult;
use crate::events::QuitAsk;
use crate::state::AppState;

pub struct TrayMenu {
    show: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show EasyADB", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("EasyADB")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => crate::show_main_window(app),
            "quit" if awake::running() > 0 => ask_to_quit(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    app.manage(TrayMenu { show, quit });
    Ok(())
}

/// Jobs run, so the user has to say that they may be cancelled.
pub fn ask_to_quit(app: &AppHandle) {
    crate::show_main_window(app);
    let _ = QuitAsk.emit(app);
}

/// Cancels what runs, lets it clean up for a moment and ends the app.
#[tauri::command]
#[specta::specta]
pub fn quit_app(app: AppHandle) {
    app.state::<AppState>().tasks.cancel_all();
    std::thread::spawn(move || {
        for _ in 0..50 {
            if awake::running() == 0 {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        app.exit(0);
    });
}

#[tauri::command]
#[specta::specta]
pub fn set_tray_labels(menu: State<'_, TrayMenu>, show: String, quit: String) -> AppResult<()> {
    menu.show.set_text(show)?;
    menu.quit.set_text(quit)?;
    Ok(())
}
