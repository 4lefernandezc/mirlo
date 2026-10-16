# Architecture

Status: target architecture for the v1 desktop client. Phase 0 (research + PoC)
is complete; Phase A (Tauri shell) is next. See [roadmap.md](roadmap.md).

## Overview

```
+-------------------------------------------------------------+
|  Mirlo (Rust process)                                       |
|                                                             |
|  +-------------------+      +----------------------------+  |
|  |  Native shell     |      |  WebView2 (system runtime) |  |
|  |  - window/tray    | IPC  |  music.youtube.com         |  |
|  |  - hotkeys        |<---->|  + injected bridge script  |  |
|  |  - settings store |      |  + renderer plugin logic   |  |
|  |  - adblock filter |      +----------------------------+  |
|  |  - SMTC/media     |                 ^                    |
|  +-------------------+                 | session cookies    |
|          ^                             |                    |
|          | sidecars (v1+)              |                    |
|   notifications, scrobbler,       %LOCALAPPDATA%\Mirlo\     |
|   discord RPC, api-server         webview2-profile\        |
+-------------------------------------------------------------+
```

- **Shell**: Tauri 2 (Rust). Owns windows, tray, global hotkeys, settings,
  notifications, single-instance and (later) auto-update.
- **WebView2**: renders the official player. A persistent user-data folder
  keeps the user's Google session across restarts.
- **Bridge**: an initialization script runs in every page load and (a) forwards
  player state to the shell, (b) receives commands to control the player, and
  (c) loads renderer plugin logic. The channel mirrors the inherited `ytmd:*`
  contract of pear-desktop (see `research/ipc-contract.md`), re-expressed as
  Tauri commands/events.
- **Ad-block**: v0 blocks via injection (validated in the PoC). v1 moves
  blocking to the network layer (`WebResourceRequested` on the WebView2
  controller) for coverage and performance. Ships OFF by default (ADR-0003).

## Plugin model

Two classes of plugins, matching what Phase 0 found in pear-desktop v3.11.0
(`research/plugin-inventory.md`):

1. **Renderer plugins (~29 of 41)** — DOM/CSS/Web Audio logic with no Electron
   dependency. Ported almost 1:1 into the injected bridge, behind a simple
   enable/disable + config store owned by the shell.
2. **Native-bridge plugins (~10)** — small, well-delimited native
   integrations. Each maps to a Rust module or crate:

   | Plugin (upstream) | Mirlo approach |
   |---|---|
   | notifications | Tauri notification plugin |
   | precise-volume / shortcuts | Tauri global-shortcut |
   | taskbar-mediacontrol | SMTC via `windows` crate (media keys + overlay) |
   | scrobbler | Webview window for Last.fm auth + `reqwest` |
   | discord | Rust rich-presence crate |
   | lumiastream / tuna-obs | WebSocket clients (`tokio-tungstenite`) |
   | api-server | HTTP server (`axum`) on localhost |
   | in-app-menu (heavy) | Start with native Tauri menu; custom overlay later |

   Excluded by policy: `downloader` (ADR-0003) and `touchbar` (macOS-only).

## Security posture

- Remote page content gets **no privileged IPC**: the bridge is a strict,
  reviewed command surface (settings get/set, player control, plugin config).
  No arbitrary command execution, no filesystem access from page context.
- The WebView profile folder is app-private under `%LOCALAPPDATA%\Mirlo`.
- No analytics, no telemetry, no network calls except the user's own service
  usage and explicitly enabled integrations.

## Performance targets

- Idle private memory (Task Manager metric): **< 450 MB** (Phase A), down from
  Electron's ~1.2 GB (Phase 0 measurement: bare WebView2 shell at 399 MB).
- Idle CPU: single-digit percent; no polling loops (event-driven only).
- Cold start to interactive player: target < 3 s on typical hardware.

## Distribution (Phase D)

- Windows first: NSIS/MSI installer via Tauri bundler, per-user install.
- No bundled browser runtime (WebView2 Evergreen dependency documented and
  bootstrapped by the installer if missing).
- Auto-update via Tauri updater on signed GitHub releases.
