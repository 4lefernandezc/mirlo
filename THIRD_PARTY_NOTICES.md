# Third-party notices

Mirlo is MIT-licensed (see [LICENSE](LICENSE)). This file records third-party
code and material included in this repository, with their license terms.

## pear-desktop (pear-devs, MIT)

- Source: https://github.com/pear-devs/pear-desktop (formerly th-ch/youtube-music)
- License: MIT, © pear-devs
- Usage: behavioral reference during Phase 0 research; from Phase B onward,
  adapted plugin code. Each ported file carries an attribution header with its
  upstream path and commit/tag, and is listed here when it lands.

**Ported plugin code included in this repository (Phase B, batch 1):**

| Mirlo file | Upstream (pear-desktop v3.11.0) |
|---|---|
| `app/src-tauri/plugins/blur-nav-bar.js` | `src/plugins/blur-nav-bar/` |
| `app/src-tauri/plugins/compact-sidebar.js` | `src/plugins/compact-sidebar/` |
| `app/src-tauri/plugins/album-color-theme.js` | `src/plugins/album-color-theme/` |
| `app/src-tauri/plugins/video-toggle.js` | `src/plugins/video-toggle/` |
| `app/src-tauri/plugins/unobtrusive-player.js` | `src/plugins/unobtrusive-player/` |
| `app/src-tauri/plugins/disable-autoplay.js` | `src/plugins/disable-autoplay/` |
| `app/src-tauri/plugins/exponential-volume.js` | `src/plugins/exponential-volume/` |
| `app/src-tauri/plugins/playback-speed.js` | `src/plugins/playback-speed/` |
| `app/src-tauri/plugins/skip-silences.js` | `src/plugins/skip-silences/` |
| `app/src-tauri/plugins/equalizer.js` | `src/plugins/equalizer/` |
| `app/src-tauri/plugins/precise-volume.js` | `src/plugins/precise-volume/` |
| `app/src-tauri/plugins/skip-disliked-songs.js` | `src/plugins/skip-disliked-songs/` |
| `app/src-tauri/plugins/captions-selector.js` | `src/plugins/captions-selector/` |
| `app/src-tauri/plugins/quality-changer.js` | `src/plugins/quality-changer/` |
| `app/src-tauri/plugins/navigation.js` | `src/plugins/navigation/` |
| `app/src-tauri/plugins/sponsorblock.js` | `src/plugins/sponsorblock/` |
| `app/src-tauri/plugins/album-actions.js` | `src/plugins/album-actions/` |
| `app/src-tauri/plugins/synced-lyrics.js` | `src/plugins/synced-lyrics/` (reduced: LRCLib provider + LRC parser + minimal panel) |

Not ported (policy): `crossfade` (fades the next track by fetching its
stream URL through InnerTube — stream extraction is excluded, ADR-0003) and
`downloader`.

Each file carries an attribution header with its upstream paths and the
deviations made for the Mirlo plugin host (no Electron/SolidJS; the host
provides per-plugin config, style injection and a `videodatachange`
compatibility layer).

## Linux AppImage native components (0.1.9+)

The AppImage contains GTK/GLib, WebKitGTK/JavaScriptCore, selected GStreamer
plugins, a custom LGPL-configured FFmpeg 5.1.10 with gst-libav 1.20.7, and
bubblewrap/xdg-dbus-proxy helpers. Their individual LGPL/BSD/MIT and other
license terms remain in effect; Mirlo's MIT license does not replace them.
FAAD is not included. FFmpeg GPL, nonfree and version3 options are disabled.

Complete native package notices and an inventory are shipped at
`usr/share/mirlo-licenses/` inside the AppImage. Each release also provides
`Mirlo_<version>_linux-sources.tar.zst` with matching distribution sources,
upstream sources/notices, configuration and rebuilding/relinking guidance;
see `docs/linux-sources.md`. Extracted copies may use modified compatible
libraries; updater signature verification does not restrict local modified
copies. `.deb` installations obtain native libraries from their distribution.
The statically linked Linux Rust crates are listed with license metadata in
the source archive manifest; their source and license files are included too.

The AppImage runtime and AppRun come from AppImage's projects (MIT, with
their embedded third-party library terms); the runtime is pinned to
`fedfad5`, and AppRun is byte-matched to AppImageKit commit `5735cc5`. Its
libfuse LGPL source and patches and upstream license texts are included in
the source archive. Generated bundler hooks are from Tauri (MIT/Apache-2.0).
The native package inventory records exact Ubuntu source/binary versions
rather than treating the whole AppImage as one MIT-licensed binary.

## Trademarks

"YouTube Music", "Google" and related marks are trademarks of their respective
owners. Mirlo is not affiliated with or endorsed by them; names are used for
identification purposes only.
