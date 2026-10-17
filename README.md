# Mirlo

A lightweight, open-source desktop client for YouTube Music.

Mirlo wraps the **official YouTube Music web player** in a fast native shell
([Tauri](https://tauri.app) on Windows, cross-platform later) instead of
bundling an entire browser like Electron-based alternatives. Measurements:
**371 MB vs 1179 MB** private memory (Tauri shell vs the Electron v3.11.0
build of pear-desktop, idle, same machine).

> **Status: v0.1.0 released; v0.1.1 (portable build) in preparation.** Feature
> set: player, 18 plugins, media session, notifications, Discord presence,
> ad-block and signed auto-update. See
> [docs/roadmap.md](docs/roadmap.md) for the current phase.

## Download

Installers are attached to
[GitHub Releases](https://github.com/4lefernandezc/mirlo/releases):
`Mirlo_<version>_x64-setup.exe` (recommended, per-user, no admin rights),
`.msi` for managed deployments, or `Mirlo_<version>_portable_x64.zip` — no
installation: extract and run, all data stays in a `data\` folder next to the
executable. Requirements and first-run notes:
[docs/user/install.md](docs/user/install.md). Common questions:
[docs/user/faq.md](docs/user/faq.md). Scope and ToS notes:
[docs/user/terms.md](docs/user/terms.md).

Mirlo updates itself from these releases (signed installers, verified against
a public key compiled into the app; opt-out in Settings).

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

Build and run the application (no Node.js or frontend build step):

```powershell
$env:CARGO_TARGET_DIR = "$env:TEMP\mirlo-target"
cargo run --manifest-path app/src-tauri/Cargo.toml --release
```

The first run creates `%LOCALAPPDATA%\Mirlo\` with `config.json` and the
persistent WebView2 profile (the Google session survives restarts). A
`portable.txt` marker next to `mirlo.exe` switches the data root to
`<exe_dir>\data` instead, and `MIRLO_DATA_DIR` overrides it (see
[docs/user/install.md](docs/user/install.md)). Release built (no console)
writes diagnostics to `<data root>\logs\mirlo.log`. Checks:

```powershell
cargo fmt --manifest-path app/src-tauri/Cargo.toml
cargo clippy --manifest-path app/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path app/src-tauri/Cargo.toml --lib
```

Installers (NSIS + MSI, with updater signatures) are produced with the Tauri
CLI; see [docs/release.md](docs/release.md) for the signing key setup:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\mirlo.key"
npx @tauri-apps/cli@^2 build
```

The original validated spike stays available at `poc/webview2-probe/`
(`cargo run --release` from that directory).

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md),
[docs/architecture.md](docs/architecture.md) and [AGENTS.md](AGENTS.md) (agent
handoff notes).

## License

[MIT](LICENSE).

Plugin ports derive from pear-desktop (MIT © pear-devs); original copyright
notices are preserved in the affected files and in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) once porting starts.
