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
- Phase B batch 2a — audio infrastructure and three ports:
  - On-demand Web Audio provider in the bridge (only wires
    `AudioContext`/`MediaElementSource` when an enabled plugin declares
    `audio: true`) with the upstream-compatible `ytmd:audio-can-play` event
    and `host.audio()`/`onAudioReady` helpers.
  - Ports (all default OFF): exponential-volume (restores the original
    `volume` descriptor on stop), playback-speed (song-menu slider,
    forced `playbackRate`), skip-silences (analyser-based).
  - `crossfade` is **excluded** (ADR-0003 addendum): upstream extracts the
    next track's stream URL through InnerTube to fade it.
- Phase B batch 2b — equalizer and precise-volume:
  - equalizer: config-driven BiquadFilters plus the `bass-booster` preset,
    applied through the host audio graph (v3.11.0 upstream has no sliders
    UI).
  - precise-volume: volume HUD, wheel and ArrowUp/ArrowDown shortcuts,
    tooltip/slider synchronization and `savedVolume` persistence; global
    volume hotkeys are registered by the shell from the plugin config
    (tauri accelerator strings, restart to apply).
  - YouTube Music's Trusted Types enforcement and the audio-provider timing
    are handled (DOM-built UI, `audio()` accessor).
- Phase B settings UI:
  - Local settings window (tray → "Settings…", or `mirlo.exe --settings`)
    with General switches (ad-block, hotkeys) and one card per plugin:
    enable toggle plus typed option fields backed by a new
    `get_plugin_manifest` command; changes persist immediately and a
    "Reload player" button applies them without an app restart.
  - New local-only `settings-capability`; the settings window shares the
    WebView2 environment with the player, and closing it no longer exits
    the app.
- Phase B batch 3a — content plugins (all default OFF):
  - skip-disliked-songs, captions-selector (track picker + autoload),
    quality-changer (quality picker), navigation (back/forward buttons) and
    sponsorblock (segments fetched from the page; third-party calls only
    while enabled).
  - New host helper `showChoiceMenu` replaces the Electron dialogs for
    in-page pickers.
- Phase B batch 3b — album-actions (default OFF): bulk like/dislike buttons
  with a fill-percentage mask on album and playlist pages.
- Phase B batch 3c — synced-lyrics (default OFF, reduced port): lyrics
  overlay panel with synced highlighting and click-to-seek, LRCLib provider
  fetched from the page (`Lrclib-Client` header, 503 retries), upstream LRC
  parser and a minimal Jaro-Winkler matcher; plain-text fallback and
  `showLyricsEvenIfInexact` option.
  - Fix: plugin buttons no longer reuse YouTube's `yt-icon-button` custom
    element bare (it renders unstyled at 300×300); quality-changer,
    captions-selector and synced-lyrics build plain buttons with a shared
    `.mirlo-icon-button` style block.
- Stable additive plugins now ship **enabled by default** (navigation,
  video-toggle, precise-volume, captions-selector, quality-changer,
  compact-sidebar); behavioral/opinionated plugins stay opt-in.
- Ad-block v1 — network-level request blocking on the WebView2 controller
  (Windows): a `WebResourceRequested` handler on the player webview answers
  matching requests with a synthesized `403 Blocked` response (WebView2 has
  no cancel API; the approach from the official samples), replacing the
  injected v0 wrappers as the primary layer (v0 stays as the fallback /
  non-Windows path). Same conservative v0 pattern set. Gated by a live flag
  mirroring `config.adblock`, so the settings toggle applies immediately
  (no reload); ad-block still ships OFF by default (ADR-0003). Verified
  live via CDP: real doubleclick requests blocked on page load; a
  `pagead2.googlesyndication.com` main-frame navigation returns HTTP 403
  while the same URL returns the real 200 content with the toggle off;
  playback unaffected (track played through the active filter); 371.1 MB
  idle private (no regression vs the Phase A baseline).
- Media session (SMTC) — native Windows integration in `media_controls.rs`
  (no new dependencies: the `windows` crate features were extended):
  - Session created for the player window so the taskbar media flyout, lock
    screen and hardware media keys control playback: play/pause/next/previous
    and flyout seek are forwarded to the page through `window.__mirlo.player`.
  - Player state reports drive the session: playback status, metadata
    (title/artist/album split from the player byline, artwork from the
    videoId) and timeline position/duration.
  - Bridge additions: `player.play()`, `player.pause()`, `player.seek(s)`.
  - Verified live through the OS session manager (PowerShell WinRT probe):
    correct metadata/status/timeline; `TryTogglePlayPauseAsync` (the media
    key path) paused/resumed the page; a flyout seek to 120 s moved playback
    accordingly; 387.5 MB private after a full round trip (< 450 MB target).

### Changed

- CI: added a Windows job that formats, lints, tests and builds `app/`.
