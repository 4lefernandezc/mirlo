# Mirlo

A lightweight, open-source desktop client for YouTube Music.

Mirlo loads the **official YouTube Music web player** in a Tauri shell:
WebView2 on Windows and WebKitGTK on Linux. The application has no Node.js
runtime. Windows uses the installed WebView2 runtime; the Linux AppImage
includes WebKitGTK and its multimedia dependencies.

**Latest release: 0.1.13 (Windows and Linux).** Includes localized, searchable Settings,
the shortcut editor and sleep timer. See the [changelog](CHANGELOG.md).

## Install

Download from [GitHub Releases](https://github.com/4lefernandezc/mirlo/releases).

| Platform | Download | Updates |
| --- | --- | --- |
| Windows 10/11 x64 | `Mirlo_<version>_x64-setup.exe` — per-user installer | Built-in updater |
| Windows x64 | `Mirlo_<version>_x64_en-US.msi` — managed installation | Built-in updater |
| Windows x64 | `Mirlo_<version>_portable_x64.zip` — extract and run | Manual |
| Linux x64 | `Mirlo_<version>_amd64.AppImage` | Built-in updater |
| Debian/Ubuntu x64 | `Mirlo_<version>_amd64.deb` | Manual |

Windows requires WebView2; the installer supplies a bootstrapper if needed.
The Windows executables are not code-signed, so SmartScreen may warn.

Linux requires glibc 2.35+ and working desktop graphics/audio services.
The AppImage includes WebKitGTK, codecs and sandbox helpers; `.deb` and
source builds use system dependencies. On restricted hosts, the AppImage
can start **without renderer sandbox isolation**, with a warning.

Full instructions, checksums, dependencies and removal:
[Installation](docs/user/install.md).

## Features

- Official player with a persistent sign-in profile.
- Twenty extensions: synced lyrics, themes and custom CSS, precise volume,
  equalizer, playback speed, captions/quality pickers, navigation and more.
  Some are enabled by default; see [Settings](docs/user/settings.md).
- Media controls: SMTC on Windows and MPRIS on Linux.
- Windows track-change notifications and Discord Rich Presence.
- Optional ad blocking, **off by default**.
- Resume the last track, position and play/pause state.
- Tray controls, configurable close/minimize behavior and saved window geometry.
- Local connection-recovery screen with automatic retry.
- Signed updates installed only after confirmation.

Mirlo also includes system-language Settings (Spanish/English),
categories, search, enabled-only filtering, reliable per-field saves,
shortcut editing/conflict checks and a session-only sleep timer for
15/30/60 minutes or the end of the current track.

## Documentation

- [Settings and sleep timer](docs/user/settings.md)
- [Themes](docs/user/themes.md)
- [FAQ](docs/user/faq.md)
- [Application architecture](docs/architecture.md)
- [Build and development](app/README.md)
- [Contributing](CONTRIBUTING.md)
- [Release packaging](docs/release.md)
- [Linux sources and rebuilding](docs/linux-sources.md)

## Scope and affiliation

Playback stays in the official player with your own session. Mirlo does not
extract streams, download media or bypass DRM. See [terms and scope](docs/user/terms.md).

Mirlo is an independent, non-profit project. It is **not affiliated with,
authorized by, endorsed by, or in any way officially connected with Google LLC,
YouTube, or any of their subsidiaries or affiliates.** "YouTube Music" and
related names, marks and images are registered trademarks of their respective
owners; any use is for identification and reference purposes only. Use this
software at your own risk.

## License

[MIT](LICENSE). Plugin ports derive from pear-desktop (MIT © pear-devs);
copyright notices and [third-party attributions](THIRD_PARTY_NOTICES.md)
are preserved. Bundled Linux components retain their individual licenses.
