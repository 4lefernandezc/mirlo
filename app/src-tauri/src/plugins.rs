//! Renderer plugin sources (Phase B).
//!
//! Each plugin is a plain JS file under `app/src-tauri/plugins/`. The files are
//! compiled into the injected bridge in this exact order: a plugin may rely on
//! the host (`window.__MIRLO_PLUGINS__`) but must not assume another plugin
//! ran first.
//!
//! Ported from pear-desktop v3.11.0 (MIT, see THIRD_PARTY_NOTICES.md and the
//! attribution header in each file).

pub struct PluginSource {
    pub id: &'static str,
    pub source: &'static str,
}

pub const PLUGINS: &[PluginSource] = &[
    PluginSource {
        id: "blur-nav-bar",
        source: include_str!("../plugins/blur-nav-bar.js"),
    },
    PluginSource {
        id: "compact-sidebar",
        source: include_str!("../plugins/compact-sidebar.js"),
    },
    PluginSource {
        id: "album-color-theme",
        source: include_str!("../plugins/album-color-theme.js"),
    },
    PluginSource {
        id: "video-toggle",
        source: include_str!("../plugins/video-toggle.js"),
    },
    PluginSource {
        id: "unobtrusive-player",
        source: include_str!("../plugins/unobtrusive-player.js"),
    },
    PluginSource {
        id: "disable-autoplay",
        source: include_str!("../plugins/disable-autoplay.js"),
    },
    PluginSource {
        id: "exponential-volume",
        source: include_str!("../plugins/exponential-volume.js"),
    },
    PluginSource {
        id: "playback-speed",
        source: include_str!("../plugins/playback-speed.js"),
    },
    PluginSource {
        id: "skip-silences",
        source: include_str!("../plugins/skip-silences.js"),
    },
    PluginSource {
        id: "equalizer",
        source: include_str!("../plugins/equalizer.js"),
    },
    PluginSource {
        id: "precise-volume",
        source: include_str!("../plugins/precise-volume.js"),
    },
    PluginSource {
        id: "skip-disliked-songs",
        source: include_str!("../plugins/skip-disliked-songs.js"),
    },
    PluginSource {
        id: "captions-selector",
        source: include_str!("../plugins/captions-selector.js"),
    },
    PluginSource {
        id: "quality-changer",
        source: include_str!("../plugins/quality-changer.js"),
    },
    PluginSource {
        id: "navigation",
        source: include_str!("../plugins/navigation.js"),
    },
    PluginSource {
        id: "sponsorblock",
        source: include_str!("../plugins/sponsorblock.js"),
    },
    PluginSource {
        id: "album-actions",
        source: include_str!("../plugins/album-actions.js"),
    },
];

/// All plugin sources concatenated in registration order, each with a
/// `/* mirlo-plugin: <id> */` marker so the injected script stays traceable.
pub fn combined_script() -> String {
    PLUGINS
        .iter()
        .map(|plugin| format!("/* mirlo-plugin: {} */\n{}", plugin.id, plugin.source))
        .collect::<Vec<_>>()
        .join("\n")
}

/// UI metadata for the settings window (names, descriptions and editable
/// option paths). The runtime source of truth for option *defaults* is the
/// plugin JS (`defaults` in each register call); the `default` values here
/// only prefill the UI. `options[].path` addresses nested config values.
/// `manifest_ids_match_plugin_sources` keeps this list in sync with PLUGINS.
pub fn manifest() -> serde_json::Value {
    use serde_json::json;

    json!([
        {
            "id": "blur-nav-bar",
            "name": "Blur nav bar",
            "description": "Blurs the navigation bar background (glass effect).",
        },
        {
            "id": "compact-sidebar",
            "name": "Compact sidebar",
            "description": "Switches the guide to the compact (icon-only) sidebar.",
        },
        {
            "id": "album-color-theme",
            "name": "Album color theme",
            "description": "Tints the interface with the colors of the current album art.",
            "options": [
                { "path": ["ratio"], "type": "number", "label": "Color mix (0–1)", "min": 0, "max": 1, "step": 0.1, "default": 0.5 },
            ],
        },
        {
            "id": "video-toggle",
            "name": "Video toggle",
            "description": "Song/video switch button for tracks that have a music video.",
            "reloadNeeded": true,
            "options": [
                { "path": ["mode"], "type": "select", "label": "Mode", "choices": ["custom", "native", "disabled"], "default": "custom" },
                { "path": ["align"], "type": "select", "label": "Button alignment", "choices": ["left", "middle", "right"], "default": "left" },
                { "path": ["forceHide"], "type": "boolean", "label": "Force hide the video player", "default": false },
                { "path": ["hideVideo"], "type": "boolean", "label": "Prefer video when available", "default": false },
            ],
        },
        {
            "id": "unobtrusive-player",
            "name": "Unobtrusive player",
            "description": "Hides the player page while browsing; reopens it when a song starts.",
        },
        {
            "id": "disable-autoplay",
            "name": "Disable autoplay",
            "description": "Pauses playback when a new track loads.",
            "options": [
                { "path": ["applyOnce"], "type": "boolean", "label": "Only apply on the first track", "default": false },
            ],
        },
        {
            "id": "exponential-volume",
            "name": "Exponential volume",
            "description": "PulseAudio-style volume curve for finer control at low levels.",
        },
        {
            "id": "playback-speed",
            "name": "Playback speed",
            "description": "Adds a speed slider to the song menu (0.07×–16×).",
        },
        {
            "id": "skip-silences",
            "name": "Skip silences",
            "description": "Skips silent parts of a track (analyser-based).",
            "options": [
                { "path": ["onlySkipBeginning"], "type": "boolean", "label": "Only skip before playback starts", "default": false },
            ],
        },
        {
            "id": "equalizer",
            "name": "Equalizer",
            "description": "Applies BiquadFilters to the audio graph (custom filters + bass booster).",
            "reloadNeeded": true,
            "options": [
                { "path": ["presets", "bass-booster"], "type": "boolean", "label": "Bass booster preset (+12 dB low shelf)", "default": false },
            ],
        },
        {
            "id": "precise-volume",
            "name": "Precise volume",
            "description": "Volume HUD, precise steps, wheel/arrow shortcuts and global volume hotkeys.",
            "reloadNeeded": true,
            "options": [
                { "path": ["steps"], "type": "number", "label": "Step size (%)", "min": 0, "max": 100, "step": 1, "default": 1 },
                { "path": ["arrowsShortcut"], "type": "boolean", "label": "ArrowUp/ArrowDown shortcuts", "default": true },
                { "path": ["globalShortcuts", "volumeUp"], "type": "string", "label": "Global volume up (accelerator, empty = off)", "default": "" },
                { "path": ["globalShortcuts", "volumeDown"], "type": "string", "label": "Global volume down (accelerator, empty = off)", "default": "" },
            ],
        },
        {
            "id": "skip-disliked-songs",
            "name": "Skip disliked songs",
            "description": "Skips to the next track when the current one is disliked.",
        },
        {
            "id": "captions-selector",
            "name": "Captions selector",
            "description": "Subtitles button to pick a caption track, with optional autoload of the last language.",
            "options": [
                { "path": ["disableCaptions"], "type": "boolean", "label": "Disable captions entirely", "default": false },
                { "path": ["autoload"], "type": "boolean", "label": "Autoload the last used language", "default": false },
            ],
        },
        {
            "id": "quality-changer",
            "name": "Quality changer",
            "description": "Gear button in the player to pick the streaming quality.",
        },
        {
            "id": "navigation",
            "name": "Navigation buttons",
            "description": "Back/forward buttons in the top bar.",
        },
        {
            "id": "sponsorblock",
            "name": "SponsorBlock",
            "description": "Skips sponsor segments using the SponsorBlock API (third-party network calls only while enabled).",
            "options": [
                { "path": ["apiURL"], "type": "string", "label": "API base URL", "default": "https://sponsor.ajay.app" },
            ],
        },
        {
            "id": "album-actions",
            "name": "Album actions",
            "description": "Bulk like/dislike buttons for album and playlist pages, with a fill percentage.",
        },
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_source_registers_its_id() {
        for plugin in PLUGINS {
            let needle = format!("__MIRLO_PLUGINS__.register('{}'", plugin.id);
            assert!(
                plugin.source.contains(&needle),
                "{} does not register itself ({needle})",
                plugin.id
            );
        }
    }

    #[test]
    fn plugin_ids_are_unique() {
        let mut seen = std::collections::BTreeSet::new();
        for plugin in PLUGINS {
            assert!(seen.insert(plugin.id), "duplicate plugin id {}", plugin.id);
        }
    }

    #[test]
    fn manifest_ids_match_plugin_sources() {
        let manifest = manifest();
        let entries = manifest.as_array().expect("manifest is an array");
        let manifest_ids: Vec<&str> = entries
            .iter()
            .map(|entry| entry["id"].as_str().expect("id is a string"))
            .collect();
        let source_ids: Vec<&str> = PLUGINS.iter().map(|plugin| plugin.id).collect();
        assert_eq!(manifest_ids, source_ids, "settings manifest out of sync");
    }
}
