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

- [x] Media Session (SMTC): taskbar flyout + hardware media keys, session
      metadata (title/artist/album/thumbnail), timeline position and
      flyout-seek; verified live through the OS session manager.
- [x] Notifications (track change): native toasts with title/artist/artwork,
      fired only while the player window is not focused; verified (0 toasts
      focused, 1 per unfocused change; the OS banner is suppressed by this
      machine's user-level notification setting).
- [x] Discord Rich Presence: minimal IPC client (no deps), SET_ACTIVITY on
      track/play-pause/seek changes; ships OFF until the user configures a
      Discord application client id (Settings → General); protocol verified
      live against the running Discord client.
- [ ] Scrobbler (Last.fm) — needs a user-provided api_key/api_secret.
- [ ] Optional: api-server, lumiastream, tuna-obs (community PRs welcome).

## Phase D — Packaging and release

- [x] Installer (NSIS/MSI), per-user, WebView2 bootstrapper.
      NSIS `currentUser` install (no admin) into
      `%LOCALAPPDATA%\Programs\Mirlo` (a conditional NSIS hook keeps the
      install directory out of the app-data directory), embedded WebView2
      bootstrapper, English/Spanish, MIT license page; WiX MSI for managed
      deployments.
- [x] Auto-update (Tauri updater, signed releases). Signed updater artifacts
      (`createUpdaterArtifacts`), public key in `tauri.conf.json`, silent
      startup check (configurable) + tray item, native confirm prompt,
      passive NSIS install and restart. Verified: install location, GUI
      subsystem, file logging, graceful shutdown, silent install/uninstall
      with data preserved; the check itself fails gracefully with a 404 while
      no public release exists.
- [x] CI release pipeline + checksums: `.github/workflows/release.yml`
      (tag `v*` → draft release with NSIS/MSI + `.sig` + `latest.json` +
      `SHA256SUMS.txt`).
- [x] User documentation (`docs/user/`: install, FAQ, terms and scope) and the
      maintainer release guide (`docs/release.md`).
- [x] Phase A/B leftover: `windows_subsystem = "windows"` in release builds +
      file logging with rotation (`%LOCALAPPDATA%\Mirlo\logs\mirlo.log`),
      native error box on fatal errors.
- [ ] Owner actions to publish the first release: make the repository public,
      add the signing key to GitHub Actions secrets, tag `v0.1.0`, verify and
      publish the draft (see `docs/release.md`).

## Phase E — Future (evaluated, not committed)

- [ ] MIC optimizations: audio-only mode, GPU flags, background throttling.
- [ ] Cross-platform evaluation (Linux WebKitGTK nuances; macOS).
- [ ] Native playback exploration — gated on a fresh ToS/risk review
      (see ADR-0001).
