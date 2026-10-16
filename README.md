# Mirlo

A lightweight, open-source desktop client for YouTube Music.

Mirlo wraps the **official YouTube Music web player** in a fast native shell
(WebView2 on Windows, eventually cross-platform via [Tauri](https://tauri.app))
instead of bundling an entire browser like Electron-based alternatives.
First measurements of the validated proof of concept show **~66% lower private
memory** than the Electron v3.11.0 build of pear-desktop (399 MB vs 1179 MB,
idle, same test conditions).

> **Status: early development.** The WebView2 spike is validated
> (`poc/webview2-probe/`); the Tauri application is under construction.
> See [docs/roadmap.md](docs/roadmap.md) for the current phase.

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

Requirements: Windows 10/11, Rust stable (MSVC toolchain), WebView2 runtime
(preinstalled on modern Windows), MSVC Build Tools.

Build and run the validated spike:

```powershell
cd poc/webview2-probe
cargo run --release
```

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md),
[docs/architecture.md](docs/architecture.md) and [AGENTS.md](AGENTS.md) (agent
handoff notes).

## License

[MIT](LICENSE).

Plugin ports derive from pear-desktop (MIT © pear-devs); original copyright
notices are preserved in the affected files and in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) once porting starts.
