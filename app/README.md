# Mirlo app (Tauri 2 shell)

Phase A desktop shell. See `../docs/architecture.md` for the design and
`../docs/research/ipc-contract.md` for the bridge contract.

## Layout

```
app/
  ui/                      Static fallback page (frontendDist; no build step)
  src-tauri/
    src/lib.rs             Shell: window, commands, hotkeys, tray, single-instance
    src/config.rs          JSON settings store (%LOCALAPPDATA%\Mirlo\config.json)
    src/bridge.js          Initialization script injected into the player page
    capabilities/main.json Remote-URL capability for the bridge
```

## Build and run

```powershell
$env:CARGO_TARGET_DIR = "C:\Users\luigi\AppData\Local\Temp\opencode\ytm-target"
cargo run --manifest-path app/src-tauri/Cargo.toml --release
```

First run creates `%LOCALAPPDATA%\Mirlo\` with `config.json` and the
persistent WebView2 profile (`webview2-profile/`); the Google session survives
restarts, exactly like the Phase 0 PoC.

## Plugins (Phase B)

Renderer plugins are ported from pear-desktop (MIT; see
`THIRD_PARTY_NOTICES.md`). Stable **additive** plugins ship enabled by
default (navigation, video-toggle, precise-volume, captions-selector,
quality-changer, compact-sidebar); everything else — behavioral or
opinionated changes (disable-autoplay, skip-disliked-songs, sponsorblock,
exponential-volume, equalizer, skip-silences, album-color-theme,
unobtrusive-player, synced-lyrics, album-actions, blur-nav-bar) — ships
OFF. Toggle anything in the settings window (or in
`%LOCALAPPDATA%\Mirlo\config.json` under `plugins`); plugin changes apply
on player reload without restarting the app.

Example of a config where everything is enabled:

```json
{
  "plugins": {
    "blur-nav-bar": { "enabled": true },
    "compact-sidebar": { "enabled": true },
    "album-color-theme": { "enabled": true, "ratio": 0.5 },
    "video-toggle": { "enabled": true, "mode": "custom", "align": "left" },
    "unobtrusive-player": { "enabled": true },
    "disable-autoplay": { "enabled": true, "applyOnce": false },
    "exponential-volume": { "enabled": true },
    "playback-speed": { "enabled": true },
    "skip-silences": { "enabled": true, "onlySkipBeginning": false },
    "equalizer": { "enabled": true, "presets": { "bass-booster": true } },
    "precise-volume": {
      "enabled": true,
      "steps": 2,
      "arrowsShortcut": true,
      "globalShortcuts": {
        "volumeUp": "Ctrl+Alt+ArrowUp",
        "volumeDown": "Ctrl+Alt+ArrowDown"
      }
    }
  }
}
```

Options per plugin: `album-color-theme.ratio` (0–1), `video-toggle.mode`
(`custom` | `native` | `disabled`, needs reload), `video-toggle.align`
(`left` | `middle` | `right`), `video-toggle.forceHide`,
`video-toggle.hideVideo` (persisted by the switch button),
`disable-autoplay.applyOnce`, `skip-silences.onlySkipBeginning`,
`equalizer.filters` (array of `{type, frequency, Q, gain}`) and
`equalizer.presets`, `precise-volume.steps` / `arrowsShortcut` /
`globalShortcuts` (tauri accelerator strings, empty = disabled, restart to
apply) / `savedVolume` (written by the plugin), `captions-selector`
(`disableCaptions`, `autoload`, `lastCaptionsCode`) and `sponsorblock`
(`apiURL`; segments are fetched from the page only while the plugin is
enabled). The settings window renders every option above. Defaults live in
`app/src-tauri/plugins/*.js`. Audio plugins wire a Web Audio graph on
demand (only while at least one `audio: true` plugin is enabled).

`crossfade` is not ported: upstream extracts the next track's stream through
InnerTube, which ADR-0003 excludes.

## Settings window

A local settings window (no remote content) is available from the tray
("Settings…") or by launching `mirlo.exe --settings`. It lists general
switches and every plugin with an enable toggle and typed option fields;
changes are written to `config.json` immediately. Some plugins apply live,
others need the window's **Reload player** button (the card shows a
"reload needed" badge), and global hotkeys need an app restart.

## Behavior notes (Phase A)

- Ad-block v0 is ported from the PoC but **ships OFF** (ADR-0003). Toggle
  `adblock` in `config.json` (a reload applies it, since wrappers are
  installed at document start).
- Global hotkeys: `Ctrl+Alt+Space` (play/pause), `Ctrl+Alt+Right` (next),
  `Ctrl+Alt+Left` (previous). Disable with `hotkeys_enabled: false`.
- Single instance: launching a second copy focuses the existing window.
- Closing the window quits the app (graceful WebView2 teardown); the tray
  icon offers show/hide and quit while running.
- `MIRLO_DEBUG_PORT=9222` (environment variable) enables the WebView2 CDP
  endpoint for local inspection with any CDP client; off by default.

## Checks

```powershell
cargo fmt --manifest-path app/src-tauri/Cargo.toml
cargo clippy --manifest-path app/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path app/src-tauri/Cargo.toml --lib
```
