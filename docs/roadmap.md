# Roadmap

Phases are ordered. Each phase ends with an updated `AGENTS.md`, a
`CHANGELOG.md` entry and a focused commit series.

## Phase 0 — Research and validation (DONE, 2026-10-16)

- [x] Identified reference app (pear-desktop v3.11.0, ex th-ch/youtube-music,
      MIT) and extracted the user's build (`app.asar`, digest recorded in
      `research/measurements.md`).
- [x] Static analysis of the actual build with REA (190 JS files, 120 modules,
      25 literal IPC channels, 35 main-process handlers).
- [x] Plugin inventory and port classification (`research/plugin-inventory.md`).
- [x] WebView2 proof of concept (`poc/webview2-probe/`) validating the three
      risks: Premium playback with no DRM issue, request-blocking injection,
      global hotkeys.
- [x] First memory measurements: ~399 MB private vs ~1179 MB for the Electron
      build (`research/measurements.md`).

## Phase A — Tauri 2 base (DONE, 2026-10-16)

- [x] Scaffold `app/` (Tauri 2, Rust + minimal frontend).
- [x] Window loads the official player with a persistent profile
      (`data_directory` → `%LOCALAPPDATA%\Mirlo\webview2-profile`).
- [x] Injected bridge implementing the MVP subset of the `ytmd:*` contract
      (get/set-config, player state reports, reload/restart, player control).
- [x] Ad-block v0 (injection) ported, OFF by default (ADR-0003).
- [x] Ad-block v1 (network-level `WebResourceRequested` on WebView2),
      verified live (real doubleclick requests blocked, 403 on ad
      navigations, playback unaffected); OFF by default (ADR-0003).
- [x] Global hotkeys, single instance, tray.
- [x] Settings storage (JSON at `%LOCALAPPDATA%\Mirlo\config.json`).
- [x] Re-measure memory: 371.1 MB idle private (< 450 MB target).

## Phase B — Renderer plugins (IN PROGRESS)

- [x] Plugin host in the injected bridge (`__MIRLO_PLUGINS__`: enable/disable,
      config, lifecycle, style injection, `videodatachange` compat layer).
- [x] Port batch 1 (UI/CSS, all default OFF): blur-nav-bar, compact-sidebar,
      album-color-theme, video-toggle, unobtrusive-player, disable-autoplay.
- [x] Audio infrastructure: on-demand Web Audio graph (`AudioContext` +
      `MediaElementSource`) with the upstream-compatible
      `ytmd:audio-can-play` event.
- [x] Port batch 2a (audio, all default OFF): exponential-volume,
      playback-speed, skip-silences.
- [x] Port batch 2b (audio): equalizer (filters + `bass-booster` preset),
      precise-volume (HUD, wheel/arrow shortcuts, `savedVolume` persistence,
      shell-registered global volume hotkeys).
- [~] crossfade — **excluded**: upstream fades the next track by extracting
      its stream URL via InnerTube, which ADR-0003 forbids.
- [x] Port batch 3a (content): skip-disliked-songs, captions-selector,
      quality-changer, navigation, sponsorblock.
- [x] Port batch 3b (content, partial): album-actions.
- [x] Port batch 3c (content): synced-lyrics (reduced: LRCLib provider,
      LRC parser, overlay panel with synced highlighting + click-to-seek).
- [x] Plugin settings UI in the shell (local window from the tray or
      `mirlo.exe --settings`: per-plugin toggles + typed option fields,
      General switches, "Reload player" button).
- [x] Stable additive plugins enabled by default (documented in CHANGELOG).

## Phase C — Native integrations

- [ ] Media Session (SMTC): taskbar overlay + hardware media keys.
- [ ] Notifications (track change).
- [ ] Scrobbler (Last.fm).
- [ ] Discord rich presence.
- [ ] Optional: api-server, lumiastream, tuna-obs (community PRs welcome).

## Phase D — Packaging and release

- [ ] Installer (NSIS/MSI), per-user, WebView2 bootstrapper.
- [ ] Auto-update (Tauri updater, signed releases).
- [ ] CI release pipeline + checksums.
- [ ] User documentation (install, FAQ, ToS notes).

## Phase E — Future (evaluated, not committed)

- [ ] MIC optimizations: audio-only mode, GPU flags, background throttling.
- [ ] Cross-platform evaluation (Linux WebKitGTK nuances; macOS).
- [ ] Native playback exploration — gated on a fresh ToS/risk review
      (see ADR-0001).
