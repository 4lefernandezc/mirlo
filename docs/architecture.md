# Architecture

This describes version 0.1.13, including system-language/searchable Settings,
the shortcut editor, field-patch saves and the sleep timer.

## Components

```text
Rust/Tauri shell                    Player WebView
  windows, tray, hotkeys     IPC       music.youtube.com
  configuration             <->       injected bridge
  media integrations                  renderer extensions
  updater, logs, timer                official playback/session

Local Settings WebView
  static HTML/CSS/JS          IPC ->   Settings-only commands
```

Windows uses the installed WebView2 runtime. Linux uses WebKitGTK 4.1;
the AppImage includes its engine/multimedia libraries while `.deb` and source
builds use system packages. No Node.js runtime is shipped.

## Shell and persistence

`app/src-tauri/src/lib.rs` creates the main window, shared application state,
tray, global shortcuts and single-instance handler. Closing hides the player
by default; tray Quit exits. Minimize-to-tray is separately configurable.

The data root resolves in this order:

1. Nonempty `MIRLO_DATA_DIR`.
2. `portable.txt` beside the executable → adjacent `data/`.
3. Windows `%LOCALAPPDATA%\Mirlo`; Linux `$XDG_DATA_HOME/Mirlo` or
   `~/.local/share/Mirlo`.

App-owned files include `config.json`, `playback.json` and `logs/mirlo.log`.
Windows also stores `window-state.json` and the persistent WebView2 profile
under this root; Linux's web profile is managed by WebKitGTK/Tauri.
Configuration has general fields plus a per-extension `plugins` map.
Defaults fill missing fields and versioned migrations handle existing files.

Settings queues field patches; Rust validates and merges them while holding
the same write lock used by other configuration commands. Persistence succeeds
before replacing in-memory state. Failure restores the edited Settings control.

`media_shortcuts` stores play/pause, next and previous accelerators, with
defaults for existing configurations. `hotkeys.rs` parses these and the
precise-volume bindings, checks duplicates by normalized shortcut identity and
probes new enabled combinations with the OS before saving changed bindings.
Running assignments remain unchanged until restart. A competing application
can claim a key after a successful check. Startup logs registration failures
without stopping the player. Playback bindings are edited only through the
local Settings patch command; full-config writes from the player preserve them.

Renderer extension saves also send and merge field patches. Automatic volume
persistence writes only `savedVolume`, not a stale snapshot of shortcut options.

Playback state is mirrored at a throttled interval and flushed on exit/restart.
Restoration uses the official player's router, verifies the target track and
stops on real user input.

## Bridge and permissions

The initialization script executes player code only on `music.youtube.com`,
not Google sign-in or the local recovery page. It exposes `window.__mirlo`
player controls, reports metadata/playback state and hosts extensions.
Active media resolves from `#movie_player video`, with a video-element fallback.

Tauri commands must appear in both `build.rs` and the invoke handler.
`capabilities/main.json` grants the remote player the configuration, state,
path, reload/restart and open-Settings command surface.
`capabilities/settings.json` is local-only and grants the Settings manifest,
locale, field-patch and timer controls. Those additional commands are not
granted to the remote player.

Player reports drive native media status, notifications, playback persistence
and timer synchronization. Renderer code never receives the updater signing key.

## Extensions and audio

Twenty scripts under `app/src-tauri/plugins/` register with
`window.__MIRLO_PLUGINS__`. Definitions provide defaults, optional styles and
`start`, `onPlayerApiReady`, `onConfigChange`, `stop` hooks.
Configuration combines defaults with user overrides; styles use adopted
stylesheets. UI controls are built with DOM APIs to work with Trusted Types.

The host creates an AudioContext/media-element source on demand when an enabled
extension declares `audio: true`. Consumers use the host's `audio()` accessor;
`ytmd:audio-can-play` is also emitted. Equalizer filters are configurable in
JSON, with a bass-booster option in Settings; there is no visual band editor.

Lyrics use LRCLib with retries, cached searches and next-track prefetching.
Timed lyrics replace compatible native Lyrics descriptions and also appear in
an overlay, with highlight/scroll/click-to-seek and reduced-motion support.
Unavailable timed lyrics fall back to native/plain text.

## Platform integrations

| Integration | Windows | Linux |
| --- | --- | --- |
| Desktop media session | SMTC | MPRIS |
| Global app shortcuts | Supported | X11 only |
| Track notifications | Native toasts when not foreground | Not implemented |
| Discord Rich Presence | Local named-pipe IPC | Not implemented |
| Optional request blocking | WebView2 filter and scripts | Scripts |

Ad blocking is disabled by default. The bridge also removes ad placements
from player responses while enabled. Playback remains in the official player;
there is no stream extraction or download pipeline.

## Sleep timer

The native timer is session-only: 15/30/60-minute wall-clock deadline or the
loaded non-ad track ID. A one-second worker handles deadlines, including time
spent suspended, and retries pause delivery until the renderer acknowledges it.
It does not persist across app exits. Clock changes affect timed deadlines.

A capture-phase `ended` listener handles the active track; other media elements
and identified ads are ignored. Changing songs cancels end-of-track mode.
Generation IDs reject stale callbacks. A four-second late-autoplay guard is
released by real input or shell media controls.

## Recovery, sandbox and updates

Main-frame DNS/transport failures navigate to a bundled recovery page with
manual retry and nonoverlapping automatic probes. Certificate failures, HTTP
errors and cancelled loads are not relabeled as offline.

Linux normally enables WebKit's renderer sandbox. The AppImage probes bundled
bubblewrap and explicitly disables the sandbox when required namespace/mount
operations fail. **That fallback loses renderer isolation**, logs a warning and
allows startup. `.deb`/source builds do not run the AppImage probe.

The updater checks the GitHub release manifest, verifies signatures against
the embedded public key and installs only after confirmation. Windows portable
and Linux `.deb` copies use manual updates. Linux packaging signs only final
assembled artifacts and includes [corresponding sources](linux-sources.md).

## Current limits

- Upstream player DOM/API changes can affect extensions.
- Native Linux GPU/PipeWire, signed-in session persistence and H.264 under the
  forced sandbox are not verified across supported hardware.
- Localized Settings has no Linux GUI verification. Timer tests do not establish
  real 15–60-minute waits, actual suspension or signed-in song/ad transitions.
- The shortcut editor's OS-conflict and key-routing behavior has no Linux
  desktop runtime verification.
