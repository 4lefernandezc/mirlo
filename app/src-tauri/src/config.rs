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
pub const CONFIG_VERSION: u32 = 2;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// On-disk schema version.
    pub version: u32,
    /// Ad-block v0 (request blocking through injected script wrappers).
    /// Ships OFF by default (ADR-0003).
    pub adblock: bool,
    /// Whether the global media hotkeys are registered.
    pub hotkeys_enabled: bool,
    /// Track-change toast notifications (shown only while the player window
    /// is not focused).
    pub notifications: bool,
    /// Discord Rich Presence (OFF until a client id is configured).
    pub discord_rpc: bool,
    /// Discord application client id (created by the user in the Discord
    /// Developer Portal; empty disables the integration).
    pub discord_client_id: String,
    /// Silent update check on startup (the tray always offers a manual one).
    pub update_check: bool,
    /// Hide the player window to the tray when the user minimizes it
    /// (the tray "Show / Hide" item and the single-instance handler bring
    /// it back).
    pub minimize_to_tray: bool,
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
            discord_rpc: false,
            discord_client_id: String::new(),
            update_check: true,
            minimize_to_tray: true,
            resume_playback: true,
            plugins: BTreeMap::new(),
        }
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
                    config.version = CONFIG_VERSION;
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
    fn defaults_are_conservative() {
        let config = Config::default();
        assert_eq!(config.version, CONFIG_VERSION);
        assert!(!config.adblock, "ad-block must ship off (ADR-0003)");
        assert!(config.hotkeys_enabled);
        assert!(config.notifications);
        assert!(!config.discord_rpc);
        assert!(config.discord_client_id.is_empty());
        assert!(config.update_check);
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
