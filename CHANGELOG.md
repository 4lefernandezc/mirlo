# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-10-17

### Added

- "Hide to the tray when the window is minimized" option (General settings,
  **on by default**): minimizing the player hides it from the taskbar; the
  tray "Show / Hide" item and launching Mirlo again restore it un-minimized
  and focused. Turn it off to keep the classic minimize behavior.

### Fixed

- Audio ads between tracks (ad-block v2): YouTube Music announces them
  inside the `/youtubei/v1/player` response (`playerAds`, `adPlacements`,
  `adSlots`) and serves their audio as regular streams, so URL blocking
  alone could not stop them. The bridge now prunes those keys from the
  player response (the same technique as uBlock Origin's `json-prune`
  filters; implemented independently — ADR-0003 Addendum 2). The fetch
  wrapper consults the live `config.adblock` flag (refreshed at most every
  5 s); `__mirlo.adblockStats` exposes `{blocked, pruned}` counters.
  Verified live: with ad-block on the player response holds no ad keys
  while playback continues; with it off the keys are present.
- "Los cambios no se guardarán" dialog: YouTube Music arms a
  `beforeunload` handler, so navigating the player away popped Chromium's
  leave-site dialog — while pending it blocks renderer JS (looks like a
  freeze and breaks automation). The bridge now drops `beforeunload`
  listeners and no-ops `window.onbeforeunload` at document start.
  WebView2's `ScriptDialogOpening` event does not fire for beforeunload
  (verified with an instrumented handler), so the controller-level route
  was discarded.

## [0.1.1] - 2026-10-17

### Added

- Portable build: the releases now include
  `Mirlo_<version>_portable_x64.zip` (release `mirlo.exe`, an empty
  `portable.txt` marker, `LICENSE`, `THIRD_PARTY_NOTICES.md` and
  `README-PORTABLE.txt`). Extract it anywhere and run the exe — no installer,
  no registry, and the ZIP is listed in `SHA256SUMS.txt`.
- All app-owned state now resolves through a single data root
  (`data_root.rs`, pure and unit-tested precedence): `MIRLO_DATA_DIR`
  (explicit override) → `portable.txt` next to the executable
  (`<exe_dir>\data`) → `%LOCALAPPDATA%\Mirlo` (the installed default,
  unchanged). Config, window state, logs and the persistent WebView2 profile
  (Google session) all follow it, so a portable copy keeps everything inside
  its own `data\` folder.
- Fatal-error dialogs and the panic hook now print the resolved log path
  instead of the hardcoded `%LOCALAPPDATA%` one.

### Changed

- Portable copies update manually: the startup/tray update check still runs
  and reports new versions, but instead of downloading and running the NSIS
  installer it shows a message pointing to the releases page (the installer
  would install into `%LOCALAPPDATA%\Programs\Mirlo`). Installed copies are
  unaffected.

## [0.1.0] - 2026-10-17

### Added

- Repository foundation: README, LICENSE (MIT), contributing guide, security
  policy and issue/PR templates.
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
- Track-change notifications — native Windows toasts in `notifications.rs`
  (no new dependencies; AUMID registered lazily in HKCU):
  - New `notifications` config flag (default on; General checkbox) and a
    focus check via `GetForegroundWindow` — tao's `is_focused()` is
    unreliable under WebView2, so toasts are suppressed only when the player
    window is truly in the foreground.
  - Deduplicated per track (the bridge re-emits `video-src-changed` several
    times per change); the first track after launch never toasts. Shows
    title, artist and artwork from the video id.
  - Verified: 0 toasts for startup/focused changes, exactly one toast per
    unfocused change with the right title. Banner delivery could not be
    observed on this machine because Windows notifications are disabled at
    the user level (`ToastNotifier.Setting()` = `DisabledForUser`; `Show()`
    succeeds and the OS drops the toast) — the module logs that state once
    per run. Memory: 409 MB fresh idle, 427.9 MB after a long session.
- Discord Rich Presence — minimal IPC client in `discord.rs` (no new
  dependencies): frame codec, worker/reader threads over
  `\\.\pipe\discord-ipc-0..9`, handshake, READY/ERROR handling, PING/PONG and
  reconnect pacing; SET_ACTIVITY (type Listening) fires only when the
  track/state actually changes. Settings → General gains a toggle and a
  client-id field; it ships OFF until the user creates a Discord
  application and pastes its id. Verified live against the running Discord
  client with a dummy id (handshake accepted and parsed; Discord replies
  `Invalid Client ID` — the real round trip; a real id yields READY).
- Window geometry persistence (`window-state.json`): the player window
  reopens with the size, position and maximized state of the last session;
  fresh installs start maximized. Restore falls back to a centered window
  when the saved placement no longer intersects a monitor.
- Phase D — packaging and release:
  - Windows installers: NSIS (per-user, no administrator rights, English +
    Spanish, MIT license page, embedded WebView2 bootstrapper) and WiX MSI
    (per-machine, for managed deployments). An NSIS install hook relocates
    the default install directory to `%LOCALAPPDATA%\Programs\Mirlo` so the
    program never mixes with the app-data directory
    (`%LOCALAPPDATA%\Mirlo`); a directory chosen by the user is respected.
  - Auto-update (Tauri updater, signed bundles): public key embedded in
    `tauri.conf.json`, silent startup check honoring a new `update_check`
    setting (General toggle), tray item *Check for updates…*, native
    confirmation prompt, passive installer execution and app restart.
    Failures (offline, no release published yet) are only logged.
  - Release pipeline (`.github/workflows/release.yml`): pushing a `v*` tag
    builds and signs the NSIS/MSI bundles and creates a draft GitHub release
    with the installers, their updater signatures, `latest.json` and
    `SHA256SUMS.txt`.
  - Release builds now run without a console window
    (`windows_subsystem = "windows"`) and write diagnostics to
    `%LOCALAPPDATA%\Mirlo\logs\mirlo.log` (size-based rotation, one previous
    file kept as `mirlo.log.old`); panics and fatal startup errors also show
    a native error dialog.
  - User documentation: `docs/user/install.md`, `docs/user/faq.md` and
    `docs/user/terms.md`; maintainer release guide in `docs/release.md`.
    The Phase A idle screenshot was redacted (account avatar/label) for
    publication.

### Fixed

- Discord Rich Presence sticking on the first track and never updating:
  a pending blocking pipe read serialized writes on the connection (the
  second `SET_ACTIVITY` blocked forever). The reader is now peek-gated
  (`PeekNamedPipe`), sends run with a 3 s deadline (timeout → reconnect),
  and the reader resets on partial/oversized frames.
- Discord/tray artwork: the player state now carries the current `videoId`
  from the YouTube player API (the SPA keeps the address bar at the home
  URL, so the URL fallback rarely matched); Discord, the toasts and the
  SMTC thumbnail now always get the cover. The Discord activity uses it as
  an external asset URL (Discord resolves it to `mp:external/...`).
- Discord timestamps are now milliseconds (the IPC unit) with `start` and
  `end` while playing, so the client shows the track progress.

### Changed

- CI: added a Windows job that formats, lints, tests and builds `app/`.
