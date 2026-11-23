use serde::Serialize;
use specta::Type;
use tauri_specta::{Builder, collect_commands};

#[derive(Serialize, Type)]
pub struct Ping {
    pub message: String,
}

#[tauri::command]
#[specta::specta]
fn ping() -> Ping {
    Ping { message: "pong".into() }
}

pub fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![ping])
}

#[cfg(test)]
mod tests {
    #[test]
    fn export_bindings() {
        super::specta_builder()
            .export(specta_typescript::Typescript::default(), "../src/bindings.ts")
            .unwrap();
    }
}

pub fn run() {
    let builder = specta_builder();
    #[cfg(debug_assertions)]
    builder
        .export(specta_typescript::Typescript::default(), "../src/bindings.ts")
        .expect("failed to export bindings");
    tauri::Builder::default()
        .invoke_handler(builder.invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
