# Installing Mirlo

Mirlo is a lightweight desktop client for YouTube Music. It wraps the official
web player with your own signed-in session — nothing is downloaded or
extracted from the service (see [terms and scope](terms.md)).

## Requirements

- Windows 10 or Windows 11 (x64).
- Microsoft Edge WebView2 Runtime — preinstalled on current Windows versions.
  If it is missing, the Mirlo installer downloads and installs it
  automatically (the machine needs internet access for that step).

### Linux requirements

- A 64-bit distribution with **webkit2gtk-4.1** (Ubuntu 22.04+, Debian 12+,
  Arch, Fedora 39+…).
- The **GStreamer** plugin packages — without them WebKitGTK cannot decode
  YouTube Music's audio/video and playback fails:

  | Distro | Packages |
  | --- | --- |
  | Ubuntu/Debian | `gstreamer1.0-libav gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly` |
  | Arch | `gst-libav gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-plugins-base` |
  | Fedora | `gstreamer1-libav gstreamer1-plugins-good gstreamer1-plugins-bad-free gstreamer1-plugins-ugly` |

  Mirlo logs a warning at startup when the codecs are missing (see
  `logs/mirlo.log`).

## Download

Installers are published on the GitHub Releases page
(`https://github.com/4lefernandezc/mirlo/releases`):

| File | Use case |
| --- | --- |
| `Mirlo_<version>_x64-setup.exe` (NSIS) | **Recommended.** Per-user install, no administrator rights required. |
| `Mirlo_<version>_x64_en-US.msi` | Managed/enterprise deployments (per-machine, requires an administrator). |
| `Mirlo_<version>_portable_x64.zip` | Portable: no installation; extract and run (see below). |
| `SHA256SUMS.txt` | Checksums to verify your download. |

### Verify the download (optional but recommended)

In PowerShell, compare the file hash with the one in `SHA256SUMS.txt`:

```powershell
Get-FileHash .\Mirlo_0.1.1_x64-setup.exe -Algorithm SHA256
```

## Install

1. Run the installer you downloaded. The NSIS installer asks for a language
   (English/Spanish) and shows the MIT license.
2. Windows SmartScreen may warn because the binaries are not code-signed yet:
   choose **More info** → **Run anyway**.
3. The per-user installer places the program in
   `%LOCALAPPDATA%\Programs\Mirlo` and creates Start Menu shortcuts. No
   administrator rights are needed.

## First run

- The player opens on `music.youtube.com`. Sign in with your Google account;
  the session is stored locally in Mirlo's private WebView2 profile and
  survives restarts.
- Open **Settings** from the tray icon menu (right-click → *Settings…*) to
  toggle plugins, ad-block, notifications, hotkeys and automatic updates.
  Changes apply immediately or with the *Reload player* button; a few
  settings (global hotkeys) need an app restart.

## Portable (no installation)

The portable ZIP (`Mirlo_<version>_portable_x64.zip`) needs no installer:

1. Extract the ZIP into any writable folder (a local folder, a USB drive…).
2. Run `mirlo.exe` from that folder.

Everything app-owned is stored inside a `data\` folder created next to the
executable (config, logs, window state and the browser profile with your
Google session) — nothing is written to `%LOCALAPPDATA%`. Moving or deleting
the extracted folder moves or deletes the whole copy, including your session.

- Windows SmartScreen may warn because the binaries are not code-signed yet:
  choose **More info** → **Run anyway** (same as the installer).
- Updates are **manual** for portable copies: Mirlo still checks for new
  versions and tells you when one exists, but it does not run the installer.
  Download the new ZIP from the releases page and replace `mirlo.exe`,
  keeping your `data\` folder.
- Verify the ZIP the same way as the installers:
  `Get-FileHash .\Mirlo_0.1.1_portable_x64.zip -Algorithm SHA256` and compare
  with `SHA256SUMS.txt`.

## Linux (AppImage / .deb)

| File | Use case |
| --- | --- |
| `Mirlo_<version>_amd64.AppImage` | **Recommended.** Portable single file; works with the built-in auto-updater. |
| `Mirlo_<version>_amd64.deb` | Debian/Ubuntu package (updates are manual). |

1. AppImage: `chmod +x Mirlo_*_amd64.AppImage` and run it. If your system
   lacks FUSE, run it with `--appimage-extract-and-run` (or extract it).
2. deb: `sudo apt install ./Mirlo_<version>_amd64.deb` (or your graphical
   package manager).

Notes:

- **Tray icon**: most desktops show it; GNOME needs the *AppIndicator*
  extension.
- **Media controls**: media keys and the desktop media widget work through
  MPRIS (title, artist, album and cover art included).
- **Wayland**: the app runs fine; global app hotkeys (`Ctrl+Alt+Space/…`)
  only work on X11 sessions (the desktop's own media keys work on both).
- **NVIDIA**: if the window renders black or crashes, start Mirlo with
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` (a known WebKitGTK + NVIDIA workaround).
- Feature differences vs. Windows (for now): no native notifications and
  no Discord Rich Presence; the network-level ad-block is replaced by the
  built-in script fallback.

## Where Mirlo keeps its data

For installed copies everything app-owned lives under `%LOCALAPPDATA%\Mirlo`
on Windows and `~/.local/share/Mirlo` on Linux (portable copies keep the same
layout under `data\` next to `mirlo.exe`):

| Path | Content |
| --- | --- |
| `config.json` | Your settings (editable by hand while the app is closed). |
| `webview2-profile\` | The persistent browser profile (Google session, caches). |
| `window-state.json` | Window size/position restored on the next launch. |
| `logs\mirlo.log` | Diagnostic log (rotated; the previous file is kept as `mirlo.log.old`). |

## Updates

Mirlo checks for updates silently at startup (can be disabled in Settings →
*Check for updates on startup*) and on demand from the tray menu
(*Check for updates…*). Installed copies download the signed installer from
this repository's releases, verify it against the bundled public key, and
install it only after you confirm a prompt; the app then restarts. Portable
copies are updated by hand (see *Portable* above). On Linux the AppImage
uses the same built-in updater; `.deb` installations are updated manually
with the new package.

## Uninstall

Use **Settings → Apps → Installed apps → Mirlo → Uninstall** (or run
`uninstall.exe` from the install directory).

Uninstalling removes the program; **your data and session are kept** in
`%LOCALAPPDATA%\Mirlo`. To wipe everything, delete that folder after
uninstalling. (Portable copies have no uninstaller: just delete the extracted
folder.)
