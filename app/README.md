# Mirlo application

Tauri 2 desktop shell with static local pages and injected player extensions.
See [architecture](../docs/architecture.md) and [contributing](../CONTRIBUTING.md).

## Layout

```text
app/
  ui/                       Local Settings and connection-recovery pages
  src-tauri/
    src/lib.rs              Windows, commands, hotkeys, tray, single instance
    src/config.rs           JSON settings and field-patch validation
    src/data_root.rs        Installed/portable data-root resolution
    src/bridge.js           Player bridge and extension host
    src/plugins.rs          Extension sources and Settings metadata
    src/sleep_timer.rs      Session-only timer state
    plugins/                Renderer extensions
    capabilities/           Local/remote command permissions
  portable/                 Instructions shipped in the portable ZIP
```

## Build and run

Run from the repository root. Requirements:

- Windows: Rust stable/MSVC, C++ Build Tools and WebView2.
- Linux: Rust stable, C/C++ build tools, `pkg-config`,
  `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`,
  `libxdo-dev`, `libssl-dev`, `patchelf` and playback codecs.
  See [Linux requirements](../docs/user/install.md#linux-requirements).
- Node.js is used for JavaScript tests, not by the shipped application.

```powershell
$env:CARGO_TARGET_DIR = "$env:TEMP\mirlo-target"
cargo run --manifest-path app/src-tauri/Cargo.toml
```

This uses debug builds. Use `--release` for distribution or performance checks.
Keep build outputs outside the source tree and synced folders.

### Fast development loop

```powershell
$env:CARGO_TARGET_DIR = "$env:TEMP\mirlo-target"
$env:MIRLO_DEV_SRC = "$PWD\app\src-tauri"
cargo run --manifest-path app/src-tauri/Cargo.toml
```

| Change | Apply it |
| --- | --- |
| `plugins/*.js` or `src/bridge.js`, with `MIRLO_DEV_SRC` set | Quit and reopen the app; no Rust rebuild |
| Extension configuration in Settings | Reload player; global shortcuts require an app restart |
| `app/ui/*` | Debug rebuild and reopen; assets are embedded |
| Rust, capabilities, manifest or dependencies | Debug rebuild and reopen |

**Reload player does not load edited source files.** The initialization script
is captured when the native window is created. The override covers only
bridge/plugins, not Settings assets. Quit from the tray to exit completely.

Unset the override when checking embedded sources or packaging:

```powershell
Remove-Item Env:MIRLO_DEV_SRC -ErrorAction SilentlyContinue
```

Linux uses the same variables, for example
`MIRLO_DEV_SRC="$PWD/app/src-tauri" CARGO_TARGET_DIR="$HOME/.cache/mirlo-target" cargo run --manifest-path app/src-tauri/Cargo.toml`.

## Configuration and extensions

Defaults live in `src/config.rs` and each extension's `defaults` object.
`src/plugins.rs::manifest()` describes editable Settings fields. User overrides
are stored under `config.json` → `plugins` and take precedence over defaults.
See [Settings](../docs/user/settings.md) for enabled defaults and application rules.

Additional JSON options include:

- `equalizer.filters`: array of `{type, frequency, Q, gain}`.
  Settings exposes the bass-booster preset, not individual filter sliders.
- `precise-volume.globalShortcuts.volumeUp` / `volumeDown`: Tauri accelerator
  strings; empty disables the binding, restart applies changes.
- `discord_client_id`: optional public application-ID override;
  empty uses Mirlo's built-in ID.

Edit configuration by hand only while the app is fully closed.

## Inspection

`MIRLO_DEBUG_PORT=9222` enables the Windows WebView2 CDP endpoint; it is off by
default. Use a separate `MIRLO_DATA_DIR` for test profiles. Do not publish logs
or captures without checking for account details, playback metadata and paths.

## Checks

```powershell
$env:CARGO_TARGET_DIR = "$env:TEMP\mirlo-target"
cargo fmt --manifest-path app/src-tauri/Cargo.toml --check
cargo clippy --manifest-path app/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path app/src-tauri/Cargo.toml --lib
node --test tools/tests/*.test.mjs
```

Linux packaging checks:

```sh
python3 tools/tests/test_linux_packaging.py
python3 tools/tests/appimage-candidate/test_wrapper.py
```
