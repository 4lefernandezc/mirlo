//! Persistent application configuration.
//!
//! Stored as JSON under the app-data root (`config.json`). The same root
//! hosts the persistent WebView2 profile (`webview2-profile/`), so all
//! app-owned state lives in one app-private location — the installed default
//! is `%LOCALAPPDATA%\Mirlo`, portable copies use `<exe_dir>\data` (see
//! `data_root.rs` and `docs/architecture.md`).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::path::PathBuf;

use crate::logging::log_error;

/// Bumped when the on-disk shape changes in a way that needs migration.
/// v2 adds the per-plugin configuration map (`plugins`).
pub const CONFIG_VERSION: u32 = 4;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// On-disk schema version.
    pub version: u32,
    /// Optional script/network ad blocking. Ships OFF by default.
    pub adblock: bool,
    /// Whether the global media hotkeys are registered.
    pub hotkeys_enabled: bool,
    /// Track-change toast notifications (shown only while the player window
    /// is not focused).
    pub notifications: bool,
    /// Discord Rich Presence (shows what you are listening to; works with
    /// the project's built-in Discord application, can be overridden below).
    pub discord_rpc: bool,
    /// Discord application client id override (empty = the built-in one).
    pub discord_client_id: String,
    /// Silent update check on startup (the tray always offers a manual one).
    pub update_check: bool,
    /// Hide the player window to the tray when the user minimizes it
    /// (the tray "Show / Hide" item and the single-instance handler bring
    /// it back).
    pub minimize_to_tray: bool,
    /// Hide the player window to the tray when the user closes it instead
    /// of quitting (quit from the tray menu to exit).
    pub close_to_tray: bool,
    /// Remember the playing track/position on close and resume it on the
    /// next launch.
    pub resume_playback: bool,
    /// Per-plugin settings: `{ "<plugin-id>": { "enabled": bool, ...options } }`.
    /// Plugin option schemas and defaults live in the bridge (`plugins/*.js`);
    /// the shell stores only what the user changed.
    pub plugins: BTreeMap<String, Value>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            adblock: false,
            hotkeys_enabled: true,
            notifications: true,
            discord_rpc: true,
            discord_client_id: String::new(),
            update_check: true,
            minimize_to_tray: false,
            close_to_tray: true,
            resume_playback: true,
            plugins: BTreeMap::new(),
        }
    }
}

impl Config {
    /// Merge only fields editable by the local settings page, not stale snapshots.
    pub fn patched(&self, patch: Value) -> Result<Self, String> {
        let fields = patch
            .as_object()
            .ok_or("settings patch must be an object")?;
        for (key, value) in fields {
            match key.as_str() {
                "adblock" | "hotkeys_enabled" | "notifications" | "discord_rpc"
                | "update_check" | "minimize_to_tray" | "close_to_tray" | "resume_playback"
                    if value.is_boolean() => {}
                "plugins" => {
                    let plugins = value.as_object().ok_or("plugins patch must be an object")?;
                    for (id, options) in plugins {
                        if !crate::plugins::PLUGINS.iter().any(|p| p.id == id)
                            || !options.is_object()
                        {
                            return Err("unknown plugin or invalid options".into());
                        }
                    }
                }
                _ => return Err(format!("invalid settings field: {key}")),
            }
        }
        fn merge(target: &mut Value, patch: Value) {
            if let Value::Object(fields) = patch {
                if !target.is_object() {
                    *target = serde_json::json!({});
                }
                for (key, value) in fields {
                    merge(&mut target[&key], value);
                }
            } else {
                *target = patch;
            }
        }
        let mut next = serde_json::to_value(self).map_err(|e| e.to_string())?;
        merge(&mut next, patch);
        serde_json::from_value(next).map_err(|e| e.to_string())
    }
}

/// The app-data root (installed: `%LOCALAPPDATA%\Mirlo`; portable:
/// `<exe_dir>\data`; override: `MIRLO_DATA_DIR`). See `data_root.rs`.
pub fn app_data_dir() -> PathBuf {
    crate::data_root::root()
}

pub fn config_path() -> PathBuf {
    app_data_dir().join("config.json")
}

/// Persistent WebView2 user-data folder (keeps the Google session across runs).
pub fn profile_dir() -> PathBuf {
    app_data_dir().join("webview2-profile")
}

/// Loads the config from disk; falls back to defaults (logging the problem)
/// when the file is missing or invalid. Older versions are normalized in
/// memory (additive changes only; no field renames yet).
pub fn load() -> Config {
    let path = config_path();
    match std::fs::read_to_string(&path) {
        Ok(text) => match serde_json::from_str::<Config>(&text) {
            Ok(mut config) => {
                if config.version < CONFIG_VERSION {
                    config = migrate(config);
                }
                config
            }
            Err(err) => {
                log_error!("config.json invalid ({err}); using defaults");
                Config::default()
            }
        },
        Err(_) => Config::default(),
    }
}

/// Version upgrades for stored configs. v3: Discord Rich Presence now works
/// with the project's built-in application, so users who never configured
/// their own client id (the feature could not have worked for them) get it
/// enabled; anyone with a custom id keeps their choice.
fn migrate(mut config: Config) -> Config {
    if config.version < 3 && config.discord_client_id.trim().is_empty() {
        config.discord_rpc = true;
    }
    if config.version < 4 {
        // v4: closing the window hides it to the tray (quit from the tray
        // menu to exit); minimizing is a normal minimize again.
        config.minimize_to_tray = false;
        config.close_to_tray = true;
    }
    config.version = CONFIG_VERSION;
    config
}

/// Persists the config atomically (write to a temp file, then rename).
pub fn save(config: &Config) -> Result<(), String> {
    let dir = app_data_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("create dir: {e}"))?;
    let text = serde_json::to_string_pretty(config).map_err(|e| format!("serialize: {e}"))?;
    let path = config_path();
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| format!("write: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename: {e}"))?;
    Ok(())
}

/// Writes the config file on first run so users can discover and edit it.
/// Existing files are left untouched.
pub fn ensure_stored(config: &Config) -> Result<(), String> {
    if config_path().exists() {
        return Ok(());
    }
    save(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_patches_preserve_toggles_siblings_and_renderer_updates() {
        let mut config = Config::default();
        config.plugins.insert(
            "precise-volume".into(),
            serde_json::json!({
                "enabled": false, "steps": 1, "savedVolume": 37,
                "globalShortcuts": {"volumeUp": "Ctrl+Alt+ArrowUp", "volumeDown": ""}
            }),
        );
        for patch in [
            serde_json::json!({"plugins": {"precise-volume": {"enabled": true}}}),
            serde_json::json!({"plugins": {"precise-volume": {"steps": 2}}}),
            serde_json::json!({"plugins": {"precise-volume": {"globalShortcuts": {"volumeDown": "Ctrl+Alt+ArrowDown"}}}}),
            serde_json::json!({"notifications": false}),
        ] {
            config = config.patched(patch).unwrap();
        }
        assert_eq!(
            config.plugins["precise-volume"],
            serde_json::json!({
                "enabled": true, "steps": 2, "savedVolume": 37,
                "globalShortcuts": {"volumeUp": "Ctrl+Alt+ArrowUp", "volumeDown": "Ctrl+Alt+ArrowDown"}
            })
        );
        assert!(!config.notifications);
        assert!(config.hotkeys_enabled);
    }

    #[test]
    fn invalid_settings_patches_do_not_modify_the_original() {
        let config = Config::default();
        for patch in [
            serde_json::json!([]),
            serde_json::json!({"version": 0}),
            serde_json::json!({"notifications": "false"}),
            serde_json::json!({"plugins": null}),
            serde_json::json!({"plugins": {"unknown": {}}}),
            serde_json::json!({"plugins": {"precise-volume": false}}),
        ] {
            assert!(config.patched(patch).is_err());
            assert_eq!(config, Config::default());
        }
    }

    #[test]
    fn defaults_are_conservative() {
        let config = Config::default();
        assert_eq!(config.version, CONFIG_VERSION);
        assert!(!config.adblock, "ad-block must ship off");
        assert!(config.hotkeys_enabled);
        assert!(config.notifications);
        assert!(
            config.discord_rpc,
            "presence works out of the box (built-in app)"
        );
        assert!(config.discord_client_id.is_empty());
        assert!(config.update_check);
        assert!(!config.minimize_to_tray, "minimize stays a normal minimize");
        assert!(config.close_to_tray, "closing hides to the tray by default");
        assert!(config.resume_playback);
    }

    #[test]
    fn migration_v4_moves_tray_behavior_to_close() {
        let old: Config = serde_json::from_str(
            r#"{"version": 3, "minimize_to_tray": true, "close_to_tray": false}"#,
        )
        .unwrap();
        let migrated = super::migrate(old);
        assert!(!migrated.minimize_to_tray);
        assert!(migrated.close_to_tray);
        assert_eq!(migrated.version, CONFIG_VERSION);
    }

    #[test]
    fn migration_v3_enables_discord_for_never_configured_users() {
        // Old config, no custom client id: the feature could not have
        // worked for this user, so it gets enabled.
        let old: Config = serde_json::from_str(
            r#"{"version": 2, "discord_rpc": false, "discord_client_id": ""}"#,
        )
        .unwrap();
        let migrated = super::migrate(old);
        assert!(migrated.discord_rpc);
        assert_eq!(migrated.version, CONFIG_VERSION);

        // A custom id means the user configured it: keep their choice.
        let configured: Config = serde_json::from_str(
            r#"{"version": 2, "discord_rpc": false, "discord_client_id": "123"}"#,
        )
        .unwrap();
        let migrated = super::migrate(configured);
        assert!(!migrated.discord_rpc);
    }

    #[test]
    fn partial_json_fills_defaults() {
        let config: Config = serde_json::from_str("{}").unwrap();
        assert_eq!(config, Config::default());

        let config: Config = serde_json::from_str(r#"{"adblock": true}"#).unwrap();
        assert!(config.adblock);
        assert_eq!(config.version, CONFIG_VERSION);
        assert!(config.hotkeys_enabled);
        assert!(config.plugins.is_empty());
    }

    #[test]
    fn plugin_map_roundtrips() {
        let config: Config = serde_json::from_str(
            r#"{
                "plugins": {
                    "video-toggle": { "enabled": true, "mode": "native" },
                    "blur-nav-bar": { "enabled": false }
                }
            }"#,
        )
        .unwrap();
        assert_eq!(config.plugins.len(), 2);
        assert_eq!(config.plugins["video-toggle"]["mode"], "native");

        let text = serde_json::to_string(&config).unwrap();
        let back: Config = serde_json::from_str(&text).unwrap();
        assert_eq!(config, back);
    }

    #[test]
    fn roundtrips_through_json() {
        let config = Config {
            version: CONFIG_VERSION,
            adblock: true,
            hotkeys_enabled: false,
            ..Config::default()
        };
        let text = serde_json::to_string(&config).unwrap();
        let back: Config = serde_json::from_str(&text).unwrap();
        assert_eq!(config, back);
    }
}
