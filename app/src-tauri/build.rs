fn main() {
    // The app manifest generates `allow-<command>` permissions for the
    // commands exposed to the injected bridge. They are referenced by the
    // `main-capability` in capabilities/main.json, which is what grants the
    // remote player page access to this reviewed surface (docs/architecture.md).
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_config",
            "set_config",
            "set_plugin_config",
            "get_path",
            "get_plugin_manifest",
            "report_player_state",
            "reload_player",
            "restart_app",
        ]),
    ))
    .expect("failed to run tauri-build");
}
