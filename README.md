# Mirlo

A lightweight, open-source desktop client for YouTube Music.

Mirlo wraps the **official YouTube Music web player** in a fast native shell
([Tauri](https://tauri.app): WebView2 on Windows, WebKitGTK on Linux) instead
of bundling an entire browser like Electron-based alternatives. Measurements:
**371 MB vs 1179 MB** private memory (Mirlo vs the Electron v3.11.0 build of
pear-desktop, idle, same machine).

> **Status: v0.1.6 released** (Windows + Linux). Features: player, 18 plugins,
> media keys, notifications, Discord presence, ad-block, resume playback and
> signed auto-update. See [docs/roadmap.md](docs/roadmap.md).

## Install

Downloads are attached to
[GitHub Releases](https://github.com/4lefernandezc/mirlo/releases). Detailed
instructions, verification and uninstall: [docs/user/install.md](docs/user/install.md).

### Windows 10/11 (x64)

Requirements: WebView2 runtime — preinstalled on current Windows (the
installer bundles the bootstrapper if it is missing).

| File | Use case |
| --- | --- |
| `Mirlo_<version>_x64-setup.exe` (NSIS) | **Recommended.** Per-user install, no administrator rights. |
| `Mirlo_<version>_x64_en-US.msi` | Managed/enterprise deployments (per-machine, administrator). |
| `Mirlo_<version>_portable_x64.zip` | Portable: extract anywhere and run `mirlo.exe`; all data stays in a `data\` folder next to it. |

1. Download and run the installer (or extract the ZIP and run `mirlo.exe`).
2. SmartScreen may warn because the binaries are not code-signed yet:
   choose **More info → Run anyway**.
3. On first run, sign in with your Google account — the session is stored
   locally in Mirlo's private profile and survives restarts.

### Linux (x64)

Requirements: a distro with **webkit2gtk-4.1** plus the **GStreamer plugin
packages** (without them WebKitGTK cannot decode the audio and playback
fails):

| Distro | Packages |
| --- | --- |
| Ubuntu/Debian | `gstreamer1.0-libav gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly` |
| Arch | `webkit2gtk-4.1 gst-libav gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly` |
| Fedora | `webkit2gtk4.1 gstreamer1-libav gstreamer1-plugins-good gstreamer1-plugins-bad-free gstreamer1-plugins-ugly` |

| File | Use case |
| --- | --- |
| `Mirlo_<version>_amd64.AppImage` | **Recommended.** Portable single file; supports the built-in auto-updater. |
| `Mirlo_<version>_amd64.deb` | Debian/Ubuntu package (updates are manual). |

```bash
chmod +x Mirlo_*_amd64.AppImage && ./Mirlo_*_amd64.AppImage   # AppImage
sudo apt install ./Mirlo_*_amd64.deb                          # Debian/Ubuntu
```

Notes: the tray icon needs the AppIndicator extension on GNOME; app hotkeys
(`Ctrl+Alt+…`) only work on X11 sessions (desktop media keys work on Wayland via
MPRIS); with NVIDIA, start it as `WEBKIT_DISABLE_DMABUF_RENDERER=1 mirlo` if the
window renders black.

### Updates

Installed builds (and the Linux AppImage) check for updates on startup
(opt-out in Settings) and install **signed** updates after you confirm. The
Windows portable ZIP and the Linux `.deb` are updated manually.

## Features

- **Light**: reuses the system web engine (WebView2 / WebKitGTK); no bundled
  browser, no background Node runtime.
- **18 plugins** (opt-in), ported from pear-desktop with attribution:
  navigation, video toggle, precise volume, compact sidebar, equalizer,
  synced lyrics (with animation inside the native "Lyrics" tab),
  SponsorBlock, captions/quality pickers and more.
- **Media controls**: SMTC on Windows (taskbar, lock screen, media keys) and
  MPRIS on Linux.
- Track-change notifications (Windows).
- **Discord Rich Presence** out of the box (cover, title, timer).
- Ad-block (off by default; network-level on Windows, script-level on Linux).
- Resume playback where you left off.
- Minimize/close to the tray (configurable) and a dark window while YouTube
  Music boots.
- Signed auto-update (Windows installers and Linux AppImage).

## Why Mirlo

- **Fast and light**: reuses the WebView2 runtime already installed on your
  machine; no per-app browser payload, no background Node runtime.
- **Feature path with attribution**: the plugin model of
  [pear-desktop](https://github.com/pear-devs/pear-desktop) (MIT) is being ported
  with its license and attribution preserved.
- **Conservative by design**: Mirlo plays content through the official player
  with your own signed-in session. It does not extract streams, bypass DRM, or
  download media. See
  [ADR-0003](docs/adr/0003-tos-posture-and-defaults.md).

## Disclaimer

Mirlo is an independent, non-profit project. It is **not affiliated with,
authorized by, endorsed by, or in any way officially connected with Google LLC,
YouTube, or any of their subsidiaries or affiliates.** "YouTube Music" and
related names, marks and images are registered trademarks of their respective
owners; any use is for identification and reference purposes only. Use this
software at your own risk.

## Development

Requirements: Windows 10/11, Rust stable (MSVC toolchain), WebView2 runtime,
MSVC Build Tools. On Linux: `libwebkit2gtk-4.1-dev`,
`libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`, `libxdo-dev`,
`libssl-dev` plus the build essentials.

Build and run the application (no Node.js or frontend build step):

```powershell
$env:CARGO_TARGET_DIR = "$env:TEMP\mirlo-target"
cargo run --manifest-path app/src-tauri/Cargo.toml --release
```

The first run creates `%LOCALAPPDATA%\Mirlo\` on Windows (or
`~/.local/share/Mirlo` on Linux) with `config.json` and the persistent web
profile (the Google session survives restarts). A `portable.txt` marker next
to the executable switches the data root to `<exe_dir>\data` instead, and
`MIRLO_DATA_DIR` overrides it (see [docs/user/install.md](docs/user/install.md)).
Release builds (no console) write diagnostics to `<data root>\logs\mirlo.log`.
Checks:

```powershell
cargo fmt --manifest-path app/src-tauri/Cargo.toml
cargo clippy --manifest-path app/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path app/src-tauri/Cargo.toml --lib
```

Installers (NSIS + MSI + AppImage/deb, with updater signatures) are produced
by the release workflow; see [docs/release.md](docs/release.md) for the
signing key setup:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\mirlo.key"
npx @tauri-apps/cli@^2 build
```

The original validated spike stays available at `poc/webview2-probe/`
(`cargo run --release` from that directory).

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md),
[docs/architecture.md](docs/architecture.md) and [AGENTS.md](AGENTS.md) (agent
handoff notes). Common questions: [docs/user/faq.md](docs/user/faq.md). Scope
and ToS notes: [docs/user/terms.md](docs/user/terms.md).

## License

[MIT](LICENSE).

Plugin ports derive from pear-desktop (MIT © pear-devs); original copyright
notices are preserved in the affected files and in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
