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
}
