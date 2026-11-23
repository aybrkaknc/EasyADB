fn main() {
    // tauri-build embeds the Common Controls v6 manifest only into binaries, so unit
    // test executables (which also link tauri) crash with 0xc0000139. Embed the same
    // manifest for every target instead.
    let windows = tauri_build::WindowsAttributes::new_without_app_manifest();
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run tauri-build");

    embed_resource::compile_for_everything("windows-app-manifest.rc", embed_resource::NONE)
        .manifest_optional()
        .expect("failed to embed app manifest");
}
