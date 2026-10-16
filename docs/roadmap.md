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

## Phase A — Tauri 2 base (NEXT)

- [ ] Scaffold `app/` (Tauri 2, Rust + minimal frontend).
- [ ] Window loads the official player with persistent profile.
- [ ] Injected bridge implementing the MVP subset of the `ytmd:*` contract.
- [ ] Ad-block v0 (injection) ported; v1 (network-level) prototype.
- [ ] Global hotkeys, single instance, tray.
- [ ] Settings storage (JSON or SQLite) + config plumbing.
- [ ] Re-measure memory; acceptance: < 450 MB idle private.

## Phase B — Renderer plugins

- [ ] Plugin host in the injected bridge (enable/disable, config, lifecycle).
- [ ] Port batch 1 (UI/CSS): blur-nav-bar, compact-sidebar, album-color-theme,
      video-toggle, unobtrusive-player, disable-autoplay.
- [ ] Port batch 2 (audio): equalizer, precise-volume, crossfade,
      playback-speed, exponential-volume, skip-silences.
- [ ] Port batch 3 (content): sponsorblock, synced-lyrics, skip-disliked-songs,
      quality-changer, album-actions, captions-selector, navigation.
- [ ] Plugin settings UI in the shell.

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
