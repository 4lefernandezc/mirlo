# PoC validation — WebView2 risks

The Phase 0 spike (`poc/webview2-probe/`, Rust + wry + WebView2) targeted the
three risks identified as blockers for the wrapper architecture.

## Risk 1 — Premium playback without DRM issues: PASSED

The user signed in with a real paid account and played tracks: audio played
correctly inside WebView2 (no Widevine requirement for regular music playback
was observed). Login works with the default Edge UA.

## Risk 2 — Request blocking via injection: PASSED

The initialization script wraps `fetch` and `XMLHttpRequest` and aborts
requests matching ad/tracking patterns. Live evidence from the smoke run on the
real page (console output of the shell process):

```
[js] {"kind":"blocked","via":"xhr","url":"//googleads.g.doubleclick.net/pagead/id"}
[js] {"kind":"blocked","via":"fetch","url":"https://ad.doubleclick.net/ccm/s/collect?auid=..."}
```

The injection also reported page state every 2 s (`[js] {"kind":"state", ...}`),
proving the JS→Rust bridge over `window.ipc.postMessage` (same primitive Tauri
uses internally).

## Risk 3 — External control bridge: PASSED

Global hotkeys registered natively (Ctrl+Alt+Space / Ctrl+Alt+Right /
Ctrl+Alt+Left) controlled the player with the window unfocused, by evaluating
a small command script in the page. This validates the control direction that
SMTC/media keys will use (Phase C).

## Additional evidence

- Session persistence works with
  `WebContext::new(Some(%LOCALAPPDATA%\ytm-poc\webview2-profile))`.
- Clean close has no orphan processes; force-kill leaves WebView2 trees that
  shut down asynchronously (several seconds).

## Open items moved to later phases

- Network-level blocking (`WebResourceRequested`) as production ad-block.
- SMTC session (taskbar integration + hardware media keys).
- UA/login regression test after any profile or UA change.
