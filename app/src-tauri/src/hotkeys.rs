//! Configurable playback/volume shortcuts, applied at startup.

use std::str::FromStr;
use std::sync::{Mutex, OnceLock};

use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

use crate::config::Config;
use crate::logging::{log_error, log_info};

struct Binding {
    name: &'static str,
    shortcut: Shortcut,
    js: &'static str,
    enabled: bool,
}

fn table() -> &'static Mutex<Vec<Binding>> {
    static TABLE: OnceLock<Mutex<Vec<Binding>>> = OnceLock::new();
    TABLE.get_or_init(|| Mutex::new(Vec::new()))
}

fn configured(config: &Config) -> [(&'static str, &str, &'static str, bool); 5] {
    let volume = config.plugins.get("precise-volume");
    let volume_enabled = volume
        .and_then(|v| v.get("enabled"))
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let volume_key = |key: &str| {
        volume
            .and_then(|v| v.get("globalShortcuts"))
            .and_then(|v| v.get(key))
            .and_then(Value::as_str)
            .unwrap_or("")
    };
    [
        ("Play / pause", &config.media_shortcuts.play_pause,
            "window.__mirlo?.player.playPause()", config.hotkeys_enabled),
        ("Next track", &config.media_shortcuts.next,
            "window.__mirlo?.player.next()", config.hotkeys_enabled),
        ("Previous track", &config.media_shortcuts.previous,
            "window.__mirlo?.player.previous()", config.hotkeys_enabled),
        ("Volume up", volume_key("volumeUp"),
            "window.__MIRLO_PLUGINS__?.isEnabled('precise-volume') && window.__mirlo?.plugins.get('precise-volume')?.changeVolume(true)", volume_enabled),
        ("Volume down", volume_key("volumeDown"),
            "window.__MIRLO_PLUGINS__?.isEnabled('precise-volume') && window.__mirlo?.plugins.get('precise-volume')?.changeVolume(false)", volume_enabled),
    ]
}

fn parse(
    name: &'static str,
    accelerator: &str,
    js: &'static str,
    enabled: bool,
) -> Result<Option<Binding>, Value> {
    if accelerator.trim().is_empty() {
        return Ok(None);
    }
    let shortcut = (accelerator.len() <= 128)
        .then(|| Shortcut::from_str(accelerator.trim()).ok())
        .flatten()
        .ok_or_else(|| json!({"kind": "invalid-shortcut", "action": name}))?;
    Ok(Some(Binding {
        name,
        shortcut,
        js,
        enabled,
    }))
}

fn bindings(config: &Config) -> Result<Vec<Binding>, Value> {
    if let Some(shortcuts) = config
        .plugins
        .get("precise-volume")
        .and_then(|p| p.get("globalShortcuts"))
    {
        if !shortcuts.is_object() {
            return Err(json!({"kind": "invalid-shortcut", "action": "Volume shortcuts"}));
        }
        for (key, name) in [("volumeUp", "Volume up"), ("volumeDown", "Volume down")] {
            if shortcuts.get(key).is_some_and(|value| !value.is_string()) {
                return Err(json!({"kind": "invalid-shortcut", "action": name}));
            }
        }
    }
    let mut result: Vec<Binding> = Vec::new();
    for (name, accelerator, js, enabled) in configured(config) {
        if let Some(binding) = parse(name, accelerator, js, enabled)? {
            if let Some(other) = result
                .iter()
                .find(|other| enabled && other.enabled && other.shortcut == binding.shortcut)
            {
                return Err(json!({
                    "kind": "duplicate-shortcut", "action": name, "other": other.name
                }));
            }
            result.push(binding);
        }
    }
    Ok(result)
}

pub fn check_changes(app: &AppHandle, current: &Config, next: &Config) -> Result<(), Value> {
    let volume_shortcuts = |config: &Config| {
        config
            .plugins
            .get("precise-volume")
            .and_then(|p| p.get("globalShortcuts"))
            .cloned()
    };
    if configured(current) == configured(next)
        && volume_shortcuts(current) == volume_shortcuts(next)
    {
        return Ok(());
    }
    let manager = app.global_shortcut();
    for binding in bindings(next)?.iter().filter(|binding| binding.enabled) {
        if manager.is_registered(binding.shortcut) {
            continue;
        }
        // Probe only new combinations; the running bindings stay untouched until restart.
        manager.register(binding.shortcut).map_err(|err| {
            log_error!("shortcut unavailable for {}: {err}", binding.name);
            json!({"kind": "unavailable-shortcut", "action": binding.name})
        })?;
        manager.unregister(binding.shortcut).map_err(|err| {
            log_error!("shortcut probe cleanup failed for {}: {err}", binding.name);
            json!({"kind": "shortcut-cleanup-failed", "action": binding.name})
        })?;
    }
    Ok(())
}

pub fn register(app: &AppHandle, config: &Config) {
    for (name, accelerator, js, enabled) in configured(config) {
        if !enabled {
            continue;
        }
        match parse(name, accelerator, js, enabled) {
            Ok(Some(binding)) => match app.global_shortcut().register(binding.shortcut) {
                Ok(()) => {
                    if let Ok(mut table) = table().lock() {
                        table.push(binding);
                    }
                }
                Err(err) => log_error!("could not register shortcut {name}: {err}"),
            },
            Ok(None) => {}
            Err(err) => log_error!("invalid shortcut for {name}: {err}"),
        }
    }
}

pub fn handle(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state() != ShortcutState::Pressed {
        return;
    }
    let action = table().lock().ok().and_then(|table| {
        table
            .iter()
            .find(|binding| binding.shortcut == *shortcut)
            .map(|binding| (binding.name, binding.js))
    });
    if let Some((name, js)) = action {
        log_info!("hotkey: {name}");
        crate::eval_in_player(app, js);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_and_existing_partial_configs_keep_playback_shortcuts() {
        let config: Config = serde_json::from_str(r#"{"version":4}"#).unwrap();
        let bindings = bindings(&config).unwrap();
        assert_eq!(bindings.len(), 3);
        assert_eq!(bindings[0].shortcut, "Ctrl+Alt+Space".parse().unwrap());
        assert_eq!(bindings[1].shortcut, "Ctrl+Alt+ArrowRight".parse().unwrap());
        assert_eq!(bindings[2].shortcut, "Ctrl+Alt+ArrowLeft".parse().unwrap());
    }

    #[test]
    fn partial_patches_preserve_other_keys_and_empty_disables_one_action() {
        let config = Config::default()
            .patched(json!({"media_shortcuts": {"next": ""}}))
            .unwrap();
        assert_eq!(bindings(&config).unwrap().len(), 2);
        assert_eq!(config.media_shortcuts.play_pause, "Ctrl+Alt+Space");
        assert_eq!(config.media_shortcuts.previous, "Ctrl+Alt+ArrowLeft");
        for patch in [
            json!({"media_shortcuts": {"unknown": "Ctrl+K"}}),
            json!({"media_shortcuts": {"next": 7}}),
            json!({"media_shortcuts": null}),
        ] {
            assert!(config.patched(patch).is_err());
        }
    }

    #[test]
    fn duplicate_aliases_are_rejected_across_playback_and_volume() {
        let config = Config::default().patched(json!({
            "plugins": {"precise-volume": {"globalShortcuts": {"volumeUp": "Alt+Control+Space"}}}
        })).unwrap();
        let error = bindings(&config).err().unwrap();
        assert_eq!(error["kind"], "duplicate-shortcut");
        assert_eq!(error["action"], "Volume up");
        assert_eq!(error["other"], "Play / pause");
        let disabled = config.patched(json!({"hotkeys_enabled": false})).unwrap();
        assert!(bindings(&disabled).is_ok());
    }

    #[test]
    fn invalid_accelerators_are_rejected_without_mutating_config() {
        let original = Config::default();
        for accelerator in ["Ctrl+", "Alt+UnknownKey", "Ctrl+K+L", &"X".repeat(129)] {
            let config = original
                .patched(json!({"media_shortcuts": {"next": accelerator}}))
                .unwrap();
            assert_eq!(bindings(&config).err().unwrap()["kind"], "invalid-shortcut");
        }
        assert_eq!(original, Config::default());
    }

    #[test]
    fn volume_defaults_on_and_its_disable_flag_is_respected() {
        let config = Config::default()
            .patched(json!({
                "plugins": {"precise-volume": {"globalShortcuts": {"volumeUp": "Ctrl+Alt+ArrowUp"}}}
            }))
            .unwrap();
        let result = bindings(&config).unwrap();
        assert!(
            result
                .iter()
                .find(|b| b.name == "Volume up")
                .unwrap()
                .enabled
        );
        let off = config
            .patched(json!({"plugins": {"precise-volume": {"enabled": false}}}))
            .unwrap();
        assert!(
            !bindings(&off)
                .unwrap()
                .iter()
                .find(|b| b.name == "Volume up")
                .unwrap()
                .enabled
        );
    }

    #[test]
    fn volume_persistence_does_not_change_shortcut_configuration() {
        let config = Config::default()
            .patched(json!({
                "plugins": {"precise-volume": {"globalShortcuts": {"volumeUp": "Ctrl+Alt+ArrowUp"}}}
            }))
            .unwrap();
        let next = config
            .patched(json!({"plugins": {"precise-volume": {"savedVolume": 42}}}))
            .unwrap();
        assert_eq!(configured(&config), configured(&next));
    }

    #[test]
    fn non_string_volume_bindings_are_not_silently_disabled() {
        for value in [json!(false), json!({"volumeUp": 123})] {
            let config = Config::default()
                .patched(json!({
                    "plugins": {"precise-volume": {"globalShortcuts": value}}
                }))
                .unwrap();
            assert_eq!(bindings(&config).err().unwrap()["kind"], "invalid-shortcut");
        }
    }
}
