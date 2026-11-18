# WebView2 probe

Standalone Rust/wry executable that opens the official YouTube Music player
with a persistent session, injected state reporting/request blocking and
global playback hotkeys. The main Mirlo application is in [`app/`](../../app/README.md).

## Run

From this directory on Windows, with Rust/MSVC, C++ Build Tools and WebView2:

```powershell
$env:CARGO_TARGET_DIR = "$env:TEMP\mirlo-target"
cargo run
```

- Profile: `%LOCALAPPDATA%\ytm-poc\webview2-profile`.
- `Ctrl+Alt+Space`: play/pause.
- `Ctrl+Alt+Right` / `Ctrl+Alt+Left`: next/previous.
- Console output includes bridge messages and blocked requests.

The probe has a separate profile and does not provide Mirlo's Settings,
extension system, tray or updater.
