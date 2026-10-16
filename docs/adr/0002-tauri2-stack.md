# ADR-0002: Stack — Tauri 2 shell, seeded by a validated wry spike

- Status: Accepted (2026-10-16)

## Context

Candidates for the native shell:

- **Electron**: rejected — it is the resource problem we are solving.
- **Raw wry** (webview + windowing primitives): minimal, but we would rebuild
  window management, tray, hotkeys, notifications, single-instance, updater and
  packaging ourselves.
- **Tauri 2**: uses wry internally; adds config, capabilities/permissions,
  tray, global shortcuts, notifications, updater, bundler, and a plugin
  ecosystem — all features on our roadmap.
- Cross-platform: WebView2 on Windows (primary target); Tauri provides WKWebView
  (macOS) and WebKitGTK (Linux) paths for later phases.

## Decision

Use **Tauri 2** for the application, keeping `poc/webview2-probe/` (raw wry) as
the validated seed: its initialization script, profile handling, hotkey wiring
and measurement tooling carry over nearly unchanged.

## Consequences

- Phase A starts from the PoC's proven behaviors rather than from zero.
- Remote-content IPC must be scoped carefully (Tauri capability system);
  the bridge surface is intentionally small (see `../architecture.md`).
- Packaging/updater arrives with the stack instead of being hand-built.
