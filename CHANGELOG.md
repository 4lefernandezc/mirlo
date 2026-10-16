# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Repository foundation: README, LICENSE (MIT), contributing guide, code of
  conduct, security policy and issue/PR templates.
- Research documentation (`docs/research/`): plugin inventory of pear-desktop
  v3.11.0, inherited IPC contract, PoC validation evidence and memory
  measurements.
- Architecture decision records (`docs/adr/`).
- Validated WebView2 proof of concept in `poc/webview2-probe/` (Rust + wry):
  Premium playback, request-blocking injection and global hotkeys.
- Mirlo application shell (Phase A) in `app/` (Tauri 2, Rust, static frontend,
  no build step):
  - Player window wraps the official YouTube Music player with a persistent
    WebView2 profile, so the Google session survives restarts.
  - Injected bridge implementing the MVP subset of the inherited `ytmd:*`
    contract: config get/set, player-state reports, reload/restart and player
    control for hotkeys.
  - Ad-block v0 (injection) ported from the validated PoC, OFF by default
    (ADR-0003).
  - Global media hotkeys (`Ctrl+Alt+Space`/`Right`/`Left`), single-instance
    (focuses the running window), tray icon (show/hide, quit) and graceful
    shutdown on window close.
  - Settings store: `%LOCALAPPDATA%\Mirlo\config.json` (conservative defaults
    written on first run).
  - Idle memory measured at 371.1 MB private (acceptance < 450 MB); see
    `docs/research/measurements.md`.
- Icon generation tool (`tools/gen-icons.ps1`) and a placeholder app icon set.
- Renderer plugin host (Phase B) in the injected bridge:
  - `window.__MIRLO_PLUGINS__` with per-plugin defaults, option overrides in
    `config.json` (`plugins` map, schema v2), style injection through adopted
    stylesheets and the lifecycle hooks `start`, `onPlayerApiReady`,
    `onConfigChange`, `stop`.
  - New `set_plugin_config` command so plugin contexts can persist options.
  - Compatibility layer re-emitting the player's native `videodatachange`
    event on `document` (plus `ytmd:src-changed`), mirroring pear-desktop's
    `song-info-front`.
  - First port batch (all default OFF, attribution headers and entries in
    `THIRD_PARTY_NOTICES.md`): blur-nav-bar, compact-sidebar,
    album-color-theme, video-toggle, unobtrusive-player, disable-autoplay.
  - Verified live: styles/body classes/album-color variables/video-toggle
    button applied; enable/disable via config + reload; no measurable idle
    memory overhead (368.4 MB with all six enabled).

### Changed

- CI: added a Windows job that formats, lints, tests and builds `app/`.
