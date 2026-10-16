# webview2-probe (Phase 0 spike)

Validated proof of concept: loads the official YouTube Music player in WebView2
with a persistent session, an injected bridge (state reporting + conservative
request blocking) and native global hotkeys.

- Validation evidence: [`docs/research/poc-validation.md`](../../docs/research/poc-validation.md)
- Numbers: [`docs/research/measurements.md`](../../docs/research/measurements.md)

## Run

```powershell
$env:CARGO_TARGET_DIR = "$env:TEMP\mirlo-target"   # keep build artifacts out of synced folders
cargo run --release
```

- Session profile: `%LOCALAPPDATA%\ytm-poc\webview2-profile` (delete it to log
  out / reset the session).
- Hotkeys: `Ctrl+Alt+Space` play/pause, `Ctrl+Alt+Right` next,
  `Ctrl+Alt+Left` previous.
- The console shows `[js]` bridge messages; requests matching the ad/tracking
  patterns in `src/main.rs` are blocked and logged.

## Notes

- This crate is a research artifact. Production work happens in `app/`
  (Phase A — see the root `AGENTS.md` and `docs/roadmap.md`).
- wry 0.53 API notes: `WebViewBuilder::new_with_web_context(&mut ctx)`;
  the IPC handler receives `Request<String>`.
- Prefer closing the window normally when done: force-killed WebView2 process
  trees take a few seconds to fully exit.
