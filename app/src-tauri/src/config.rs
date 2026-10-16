//! Persistent application configuration.
//!
//! Stored as JSON under `%LOCALAPPDATA%\Mirlo\config.json`. The same base
//! directory hosts the persistent WebView2 profile (`webview2-profile/`), so
//! all app-owned state lives in one app-private location (see
//! `docs/architecture.md`).

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Bumped when the on-disk shape changes in a way that needs migration.
pub const CONFIG_VERSION: u32 = 1;

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
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            adblock: false,
            hotkeys_enabled: true,
        }
    }
}

/// `%LOCALAPPDATA%\Mirlo` (all app-owned state lives here).
pub fn app_data_dir(app: &AppHandle) -> PathBuf {
    let base = app
        .path()
        .local_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    base.join("Mirlo")
}

pub fn config_path(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join("config.json")
}

/// Persistent WebView2 user-data folder (keeps the Google session across runs).
pub fn profile_dir(app: &AppHandle) -> PathBuf {
    app_data_dir(app).join("webview2-profile")
}

/// Loads the config from disk; falls back to defaults (logging the problem)
/// when the file is missing or invalid.
pub fn load(app: &AppHandle) -> Config {
    let path = config_path(app);
    match std::fs::read_to_string(&path) {
        Ok(text) => match serde_json::from_str::<Config>(&text) {
            Ok(config) => config,
            Err(err) => {
                eprintln!("[mirlo] config.json invalid ({err}); using defaults");
                Config::default()
            }
        },
        Err(_) => Config::default(),
    }
}

/// Persists the config atomically (write to a temp file, then rename).
pub fn save(app: &AppHandle, config: &Config) -> Result<(), String> {
    let dir = app_data_dir(app);
    std::fs::create_dir_all(&dir).map_err(|e| format!("create dir: {e}"))?;
    let text = serde_json::to_string_pretty(config).map_err(|e| format!("serialize: {e}"))?;
    let path = config_path(app);
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| format!("write: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("rename: {e}"))?;
    Ok(())
}

/// Writes the config file on first run so users can discover and edit it.
/// Existing files are left untouched.
pub fn ensure_stored(app: &AppHandle, config: &Config) -> Result<(), String> {
    if config_path(app).exists() {
        return Ok(());
    }
    save(app, config)
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
    }

    #[test]
    fn partial_json_fills_defaults() {
        let config: Config = serde_json::from_str("{}").unwrap();
        assert_eq!(config, Config::default());

        let config: Config = serde_json::from_str(r#"{"adblock": true}"#).unwrap();
        assert!(config.adblock);
        assert_eq!(config.version, CONFIG_VERSION);
        assert!(config.hotkeys_enabled);
    }

    #[test]
    fn roundtrips_through_json() {
        let config = Config {
            version: CONFIG_VERSION,
            adblock: true,
            hotkeys_enabled: false,
        };
        let text = serde_json::to_string(&config).unwrap();
        let back: Config = serde_json::from_str(&text).unwrap();
        assert_eq!(config, back);
    }
}
