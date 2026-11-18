# Mirlo — repository guide

## Current implementation

Mirlo is a Tauri 2 desktop wrapper of the official YouTube Music player.
Windows uses WebView2; Linux uses WebKitGTK. Twenty renderer extensions add
appearance, playback and audio controls. See [architecture](docs/architecture.md)
and [user documentation](docs/user/settings.md).

Current source and latest published version: **0.1.13** (Windows and Linux).
Version 0.1.13 includes:

- System-language Settings: Spanish variants → `es`, English fallback.
  Windows uses the UI language, not regional formatting; Linux uses environment
  preferences.
- Five categories, search, enabled-only filtering and reload/restart guidance.
- Queued per-field settings patches, merged under a shared configuration lock.
  Failed persistence leaves memory unchanged and restores the control.
- Native session-only 15/30/60-minute or end-of-current-track sleep timer.
  It works with Settings closed/player hidden, includes suspension in timed
  deadlines and cancels end-of-track mode on track changes.
- Playback shortcut editor: `media_shortcuts` defaults preserve existing
  bindings; empty strings disable actions. Syntax, duplicate aliases and OS
  availability are checked on changed shortcut saves. Running bindings are
  retained until app restart. Volume shortcuts remain in precise-volume config.
  Playback bindings are editable only through local Settings patches; player
  full-config writes preserve them.
- Renderer extension writes merge field patches; automatic volume persistence
  saves only `savedVolume`, preserving shortcut edits.

The `MIRLO_DEV_SRC` renderer override is also available; its source edits apply
on restart. Current verification limits are listed in
[architecture](docs/architecture.md#current-limits).

## Repository rules

- Do not push, publish, tag remotely, post external comments or change GitHub
  settings without explicit authorization.
- Do not spend money, create accounts/services or change legal, licensing,
  branding or naming terms without explicit authorization.
- Do not modify/delete personal files outside the repository.
- Never commit credentials, build artifacts, personal names/emails or local
  filesystem paths. Use environment variables or `<user>` placeholders.
  Functional GitHub URLs are allowed. Use the configured repo-local noreply
  commit identity.
- Preserve user changes. Keep documentation text-only and review any media
  for privacy before adding it.
- Playback stays in the official player: no stream extraction, downloads or
  DRM bypass. Ad blocking defaults off. No mini-player.
- Keep milestones documented in this file and `CHANGELOG.md`; commit locally
  with Conventional Commit messages. Document only implemented functionality
  and factual limits, not conversations, proposals or internal investigations.

## Layout

```text
app/ui/                      Embedded Settings and recovery pages
app/src-tauri/src/lib.rs      Shell, commands, tray, windows and hotkeys
app/src-tauri/src/bridge.js   Player bridge and extension host
app/src-tauri/src/config.rs   Configuration defaults, patches and persistence
app/src-tauri/src/plugins.rs  Extension registry and Settings manifest
app/src-tauri/src/hotkeys.rs  Playback/volume bindings and availability checks
app/src-tauri/plugins/        Twenty renderer extensions
app/src-tauri/capabilities/   Local/remote command permissions
docs/user/                   Installation, settings, themes, FAQ and scope
docs/architecture.md          Implemented components and boundaries
docs/release.md               Packaging and updater behavior
docs/linux-sources.md         Corresponding sources and rebuilding
tools/tests/                 Renderer, Rust-adjacent and packaging test helpers
tools/linux/                 Linux packaging scripts
poc/webview2-probe/           Standalone WebView2 executable
```

## Development

Build artifacts must stay outside OneDrive/source directories:

```powershell
$env:CARGO_TARGET_DIR = "$env:TEMP\mirlo-target"
$env:MIRLO_DEV_SRC = "$PWD\app\src-tauri"
cargo run --manifest-path app/src-tauri/Cargo.toml
```

- Use debug builds for edits, not release builds.
- With `MIRLO_DEV_SRC`, bridge/plugin edits need a full app restart, **not**
  Reload player; the initialization script is captured at window creation.
- `app/ui/*`, Rust and ACL changes need a debug rebuild.
- Reload player applies extension configuration, not edited disk sources.
- Unset `MIRLO_DEV_SRC` for embedded-source checks and release packaging.
- Use isolated `MIRLO_DATA_DIR` profiles for runtime tests. Never enable every
  extension in a personal profile; silence skipping and SponsorBlock can
  change normal track transitions.

Checks before commit:

```powershell
$env:CARGO_TARGET_DIR = "$env:TEMP\mirlo-target"
cargo fmt --manifest-path app/src-tauri/Cargo.toml --check
cargo clippy --manifest-path app/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path app/src-tauri/Cargo.toml --lib
node --test tools/tests/*.test.mjs
```

Linux packaging:

```sh
python3 tools/tests/test_linux_packaging.py
python3 tools/tests/appimage-candidate/test_wrapper.py
```

## Integration constraints

- Commands need registration in both the invoke handler and `build.rs`, plus
  the correct capability. Settings locale/patch/timer commands are local-only.
- New extension code needs registration, manifest metadata, matching defaults,
  attribution where applicable and tests. Keep upstream copyright headers.
- Build player UI through DOM APIs (Trusted Types). Do not use bare
  `yt-icon-button` elements; use the existing plain-button pattern.
- Resolve active media with `#movie_player video` first. YouTube Music can keep
  preloaded videos and replace the active element during navigation.
- Media `timeupdate` does not bubble; lyrics uses document capture listeners.
- Navigate restored tracks through the official router, not `loadVideoById`,
  to keep the interface and audio aligned. Real user input aborts restoration.
- Use the host `audio()` accessor; a one-shot audio-ready event can be missed.
- Additional WebView2 windows share the player's profile/browser arguments.
  Runtime creation runs off the event-loop thread and explicitly navigates
  after build.
- WebView2 focus/maximize/minimize checks use native Windows state where tao
  state can lag. Closing Settings must not exit the app.
- Avoid blocking Discord pipe reads; peek complete frames before reading.
- Route shell diagnostics through the file logger, not new println calls.
- Linux AppImage fallback deliberately loses renderer isolation when sandbox
  setup is unavailable. Preserve the warning and normal sandboxed path.
- Never alter final bundles after signing. Keep corresponding Linux sources
  and licenses alongside distributed binaries.

Build details: [app/README.md](app/README.md). Security boundary and platform
limits: [architecture](docs/architecture.md).
