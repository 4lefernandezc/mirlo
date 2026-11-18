# Changelog

Implemented changes by version. `[Unreleased]` is not included in published downloads.

## [Unreleased]

### Added

- Playback shortcut editor in Settings for play/pause, next and previous.
  Empty fields disable individual actions. Saves check syntax, duplicate
  combinations (including volume shortcuts) and current OS availability;
  changes apply after restarting Mirlo.
- Settings follow the system UI language: Spanish for Spanish variants,
  English fallback. Five categories, accent-insensitive search, enabled-only
  filtering and reload/restart guidance.
- Session-only sleep timer: pause after 15/30/60 minutes or at the end of the
  current track, with countdown and cancellation. It runs with Settings
  closed or the player hidden. System sleep counts toward timed pauses;
  changing tracks cancels the end-of-track timer.

### Fixed

- Automatic volume saves update only the volume field, preserving shortcut
  edits and other extension preferences.
- Settings save individual field patches under a shared write lock, preserving
  unrelated edits and plugin values. Failed writes leave memory unchanged
  and restore the edited control.

### Documentation

- Guides describe implemented functionality, configuration and current limits.

## [0.1.12] - 2026-11-02

### Fixed

- AppImage startup respects the explicit sandbox fallback after a failed
  bubblewrap probe. Restricted hosts can start without renderer isolation;
  normal launches keep the sandbox enabled.

## [0.1.11] - 2026-11-02

### Fixed

- Disable autoplay respects manually selected tracks and no longer blocks
  resuming after an automatic pause. Shell media controls count as user intent.

### Added

- AppImage startup sandbox probe and warning. Its fallback was incomplete
  in this version and is corrected in 0.1.12.

## [0.1.10] - 2026-11-01

### Added

- Settings button in the player's top bar.
- Disk-source development loading for bridge/plugins through `MIRLO_DEV_SRC`;
  source changes apply after an app restart without a Rust rebuild.
- Custom CSS and four dark palettes: midnight, amoled, warm and forest.
  Presets suppress the per-track hero gradient; native preserves it.

### Changed

- Disable autoplay and synced lyrics enabled by default; navigation disabled.
- Video toggle uses the native switch with audio preferred when available.
- Custom theme has no enable toggle; native without custom CSS is a no-op.
- Removed the optional Discord client-id field from Settings; the configuration
  override remains supported.

### Fixed

- Bulk list actions use styled buttons, appear only on compatible lists with
  work to perform, refresh their icons and suppress repeated like notifications.
- Playlist/album navigation no longer triggers a bulk-action observer loop.
- Reload player no longer displays a leave-site confirmation.

## [0.1.9] - 2026-11-01

### Added

- Linux AppImage multimedia libraries for AAC/Opus playback and helpers for
  WebKit's sandbox.
- Linux corresponding-source archive, native notices/inventory and
  rebuilding/relinking instructions.
- Local connection-recovery screen with system light/dark colors, manual retry
  and automatic reconnection checks. Session data is preserved.

### Fixed

- Precise-volume wheel input applies only the configured step instead of also
  applying the player's larger native adjustment.

## [0.1.8] - 2026-10-20

### Changed

- Lyrics search responses are cached and the next queued track is prefetched.
- Lyrics use animated lines, active-line highlighting and empty-line spacing;
  reduced-motion preferences disable animations.

### Fixed

- Lyrics follow the active media element across player replacements and seek
  through the player API.
- LRC lines are sorted and repeated timestamps handled.
- Failed/stale lookups restore the player's native text instead of leaving
  the lyrics view blank.

## [0.1.7] - 2026-10-19

### Added

- Linux MPRIS media controls, metadata and artwork.

### Changed

- Faster playback restoration with saved-position navigation and bounded retries.
- Dark boot background for player and Settings.
- Closing hides to the tray by default; minimizing remains a normal minimize.
  Both behaviors are configurable.

### Fixed

- Playback restoration stops on real user input and keeps the selected track's
  audio and interface aligned.

## [0.1.6] - 2026-10-18

### Added

- Linux WebKitGTK support, AppImage/deb packages and XDG data storage.
- Missing-codec startup warning.

### Fixed

- Restored tracks load through the player's router so the player bar, cover
  and queue follow the audio.

## [0.1.5] - 2026-10-18

### Added

- Restore the last track, position and play/pause state on startup.

### Changed

- Discord Rich Presence enabled by default using Mirlo's public application ID.

### Fixed

- State reports and player helpers resolve the active video instead of a
  preloaded media element.

## [0.1.4] - 2026-10-18

### Fixed

- Refresh the player's activity timestamp to suppress the inactivity prompt.

## [0.1.3] - 2026-10-17

### Added

- Synchronized lyrics in the native Lyrics tab, with highlighting, scrolling
  and click-to-seek.

### Fixed

- Lyrics lookup checks the current video ID during rapid track changes.
- Suppress stale text while loading, prefer timed matches and support the
  player's alternative description wrappers.

## [0.1.2] - 2026-10-17

### Added

- Configurable minimize-to-tray behavior.

### Fixed

- Optional ad blocking also removes ad placements from player responses.
- Suppress the player's leave-site confirmation.

## [0.1.1] - 2026-10-17

### Added

- Windows portable ZIP with a `portable.txt` marker and adjacent `data` folder.
- Shared data-root resolution: `MIRLO_DATA_DIR`, portable marker, then the
  installed default. Error dialogs use the resolved log path.

### Changed

- Portable update checks provide manual download instructions, never launch
  the installer.

## [0.1.0] - 2026-10-17

### Added

- Tauri/WebView2 shell hosting the official player with a persistent profile.
- Global playback hotkeys, single-instance behavior and tray controls.
- JSON settings and local Settings window with extension toggles/options.
- Renderer extension host with lifecycle hooks, configuration and styles.
- Eighteen attributed extensions for appearance, playback, volume/EQ,
  captions/quality, list actions, SponsorBlock and LRCLib lyrics.
- On-demand Web Audio provider for audio extensions.
- Optional script/network ad blocking, disabled by default.
- Windows media session, track-change notifications and Discord Rich Presence.
- Window geometry persistence.
- NSIS/MSI installers, signed updater, file logs and native fatal-error dialogs.

### Fixed

- Discord activity updates across tracks, with cover artwork and progress timestamps.
