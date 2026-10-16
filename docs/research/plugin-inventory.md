# Plugin inventory — pear-desktop v3.11.0

Source: source tree at tag `v3.11.0` (pear-devs/pear-desktop, MIT; the user's
build reports `ProductVersion 3.11.0`, `th-ch`). Electron API usage was
extracted by static scan of every plugin directory (imports of `electron`).

**Totals: 43 plugins + shared `utils`.** Port classes:

- **renderer (~29)**: no Electron imports; DOM/CSS/Web Audio/HTTP logic.
  Portable almost 1:1 into the injected bridge.
- **native bridge (~11)**: small, well-delimited native integrations.
- **excluded (2)**: policy or platform.
- **review (1)**: ToS review before porting.

| Plugin | Class | Electron API seen | Mirlo target |
|---|---|---|---|
| adblocker | native | `app, net, contextBridge, webFrame` | Injection (v0, done in PoC) → `WebResourceRequested` (v1). Ships OFF by default |
| album-actions | renderer | — | Bridge, batch 3 |
| album-color-theme | renderer | — | Bridge, batch 1 |
| ambient-mode | renderer | type-only (menu) | Bridge, later |
| amuse | renderer | — | Bridge, later |
| api-server | native | `dialog, ipcMain` | `axum` localhost server (Phase C, optional) |
| audio-compressor.ts | renderer | — | Bridge, batch 2 |
| auth-proxy-adapter | renderer | — | Bridge, later |
| blur-nav-bar | renderer | — | Bridge, batch 1 |
| bypass-age-restrictions | review | — | Hold: ToS review required |
| captions-selector | renderer | — | Bridge, batch 3 |
| compact-sidebar | renderer | — | Bridge, batch 1 |
| crossfade | renderer | — | **Excluded** (ADR-0003): pulls the next track's stream via InnerTube |
| custom-output-device | renderer | — | Bridge, later |
| disable-autoplay | renderer | — | Bridge, batch 1 |
| discord | native | `app` | Rust rich-presence (Phase C) |
| downloader | excluded | `app, dialog, ipcMain` | **Not ported** (ADR-0003) |
| equalizer | renderer | — | Bridge, batch 2 |
| exponential-volume | renderer | — | Bridge, batch 2 |
| in-app-menu | native | `Menu, BrowserWindow, ipcMain, nativeImage` | Native Tauri menu first; custom overlay later |
| lumiastream | native | `net` (WS) | `tokio-tungstenite` (Phase C, optional) |
| music-together | renderer | — | Renderer + embedded WS server (later) |
| navigation | renderer | — | Bridge, batch 3 |
| no-google-login | renderer | — | Bridge, later |
| notifications | native | `app, Notification` | Tauri notification plugin (Phase C) |
| performance-improvement | native-ish | — (Chromium flags) | WebView2 additional browser args (Phase A) |
| picture-in-picture | renderer | `app` | Document PiP in bridge, later |
| playback-speed | renderer | — | Bridge, batch 2 |
| precise-volume | native | `globalShortcut` | Tauri global-shortcut (Phase A/C) |
| quality-changer | renderer | `dialog` | Bridge, batch 3 |
| scrobbler | native | `BrowserWindow, dialog, net` | Auth webview window + `reqwest` (Phase C) |
| shortcuts | native | `globalShortcut, ipcMain` | Tauri global-shortcut (Phase A) |
| skip-disliked-songs | renderer | — | Bridge, batch 3 |
| skip-silences | renderer | — | Bridge, batch 2 |
| sponsorblock | renderer | — | Bridge, batch 3 |
| synced-lyrics | renderer | `net` (HTTP) | Bridge + `fetch`/reqwest, batch 3 |
| taskbar-mediacontrol | native | `nativeImage, nativeTheme` | SMTC via `windows` crate (Phase C) |
| touchbar | excluded | `TouchBar` | macOS-only; not ported |
| transparent-player | renderer | — | Bridge, later |
| tuna-obs | native | `net` (WS) | `tokio-tungstenite` (Phase C, optional) |
| unobtrusive-player | renderer | — | Bridge, batch 1 |
| video-toggle | renderer | — | Bridge, batch 1 |
| visualizer | renderer | — | Bridge, later |
| utils (shared) | — | — | Reference for helper patterns |

## Notes

- "Batch N" refers to the port order in `docs/roadmap.md` (Phase B).
- Batch 1 (blur-nav-bar, compact-sidebar, album-color-theme, video-toggle,
  unobtrusive-player, disable-autoplay) landed in `app/src-tauri/plugins/`
  (2026-10-16) with attribution headers and THIRD_PARTY_NOTICES.md entries;
  all default OFF until the settings UI exists.
- Batch 2a (exponential-volume, playback-speed, skip-silences) landed with
  an on-demand Web Audio provider in the bridge (`audio: true` plugins get
  `ytmd:audio-can-play`); crossfade was excluded for the InnerTube reason
  above.
- Batch 2b (equalizer, precise-volume) landed 2026-10-16; precise-volume's
  global volume hotkeys are registered by the shell from
  `plugins["precise-volume"].globalShortcuts`.
- Batch 3a (skip-disliked-songs, captions-selector, quality-changer,
  navigation, sponsorblock) landed 2026-10-16; both dialog-based upstream
  pickers use the host's `showChoiceMenu`, and sponsorblock fetches its
  segments from the page (CORS allowed by the SponsorBlock API).
- Batch 3b: album-actions landed 2026-10-16 (bulk like/dislike buttons with
  a fill-percentage mask, built with DOM/SVG APIs).
- Two channels of the app run outside plugins too (the application core):
  window management, tray, and the `ytmd:*` bridge itself — see
  `ipc-contract.md`.
- Upstream is MIT; all ports keep attribution headers and are recorded in
  `THIRD_PARTY_NOTICES.md`.
