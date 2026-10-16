# Inherited IPC contract (pear-desktop v3.11.0)

Extracted statically from the v3.11.0 source tree: literal channels passed to
`ipcMain.handle/on/once` (main process) and `ipcRenderer.invoke/send/sendSync`
(renderer). Dynamic channel expressions are not listed (they remain unknown but
were few: the application core uses a small fixed set).

## Main-process handlers (24 literal)

```
get-renderer-script            ytmd:seeked
ytmd:autoplay-changed          ytmd:set-config
ytmd:fullscreen-changed        ytmd:set-fullscreen
ytmd:fullscreen-changed-supported   ytmd:shuffle-changed
ytmd:get-config                ytmd:time-changed
ytmd:get-downloads-folder      ytmd:video-src-changed
ytmd:get-main-plugin-names     ytmd:volume-changed
ytmd:get-path                  ytmd:menu-event
ytmd:get-queue-response        ytmd:player-api-loaded
ytmd:get-shuffle-response      ytmd:play-or-paused
ytmd:reload                    ytmd:repeat-changed
ytmd:restart
```

## Renderer side (21 literal)

Same family, plus `ytmd:like-changed` and `ytmd:shuffle-changed-supported`;
the renderer consumes state events and emits player/state changes and config
requests.

## Interpretation

- **Player state (renderer → main events)**: `play-or-paused`, `seeked`,
  `time-changed`, `volume-changed`, `video-src-changed`, `repeat-changed`,
  `shuffle-changed`, `autoplay-changed`, `fullscreen-changed`,
  `search-results`, `like-changed`, `player-api-loaded`.
- **Config (bidirectional)**: `get-config` / `set-config`.
- **Commands (main → renderer / lifecycle)**: `get-renderer-script` (injects the
  renderer bundle at page start), `reload`, `restart`, `set-fullscreen`,
  `menu-event`.
- **Data requests**: `get-queue-response`, `get-shuffle-response`,
  `get-downloads-folder`, `get-path`, `get-main-plugin-names` (plugin metadata
  for the UI).

## Mirlo mapping (Phase A implemented, Phase B onwards extends)

The bridge (implemented in `app/src-tauri/src/bridge.js`, see
`docs/architecture.md`) re-expresses this as:
- Tauri **commands** (renderer → shell): `get_config`, `set_config`,
  `get_path`, `report_player_state` (state events as `{kind, data}`),
  `reload_player`, `restart_app`.
- Tauri **events** (shell → observers, e.g. future SMTC/notifications):
  `player-state` with the last reported payload.
- Shell **lifecycle**: hotkeys `eval` player control directly
  (`window.__mirlo.player.*`), matching the Phase 0 PoC wiring.
- `get-renderer-script` becomes static: the initialization script (with the
  enabled renderer plugins, Phase B) is injected by the shell on every
  document start.

Naming: keep the semantics, not the exact strings. A compatibility shim may
re-expose `ytmd:*` names internally to ease porting plugin code unchanged.
