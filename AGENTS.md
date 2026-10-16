# AGENTS.md — Mirlo

Handoff file for AI coding agents (opencode). **Read this first when resuming
work in a new session.** Project state must live in this file and `docs/`, not
in chat history.

## What this project is

Mirlo: a lightweight, open-source desktop client for YouTube Music. It wraps
the **official YouTube Music web player** in a WebView2/Tauri shell (no bundled
browser runtime, no Node in the product). Long-term goal: broad feature parity
with pear-desktop's plugin model, at a fraction of its memory/CPU footprint.

## How the user works (important)

- The user speaks **Spanish**; reply in Spanish.
- **Autonomy granted**: proceed without asking, EXCEPT for critical decisions:
  1. Publishing/pushing to public remotes or anything touching the GitHub account.
  2. Spending money or creating accounts/services.
  3. Destructive changes outside the repository.
  4. Legal/marketing/name/license decisions.
- Keep long work product in the repo (this file + `docs/`), so context limits
  never lose state. At the end of every milestone: update "Current state" here,
  update `CHANGELOG.md`, and commit.
- If context runs out mid-task: commit WIP with a clear message and add a
  "Resume notes" bullet here before finishing.

## Current state (2026-10-16)

- **Phase 0 — DONE**: research + validated PoC.
  - `poc/webview2-probe/` builds and runs (Rust + wry + WebView2).
  - Validated: Premium playback on WebView2 (no DRM problem), ad-blocking via
    init-script injection (blocked real doubleclick requests live), global
    hotkeys (Ctrl+Alt+Space/Left/Right) controlling the player.
  - Measured (idle, logged-in home, private working set — Task Manager metric):
    **PoC ≈ 399 MB vs Electron v3.11.0 ≈ 1179 MB**. Details:
    `docs/research/measurements.md`.
- **Phase A — DONE (2026-10-16)**: Tauri 2 shell in `app/` (tauri 2.12,
  plugins global-shortcut 2.4 / single-instance 2.5).
  - Player window loads `music.youtube.com` with persistent WebView2 profile
    (`%LOCALAPPDATA%\Mirlo\webview2-profile`; session carried over from the
    Phase 0 PoC profile), bridge injected at document start.
  - Bridge (MVP `ytmd:*` subset): `get_config`/`set_config`/`get_path`,
    `report_player_state` events (`bridge-ready`, `player-api-loaded`,
    `play-or-paused`, `time-changed`, `volume-changed`, `seeked`,
    `video-src-changed`, `navigation`), `reload_player`/`restart_app`,
    ad-block v0 ported (OFF by default, ADR-0003), player control used by
    hotkeys.
  - Global hotkeys Ctrl+Alt+Space/Right/Left, single-instance (focuses the
    running window), tray (show/hide + quit), graceful close.
  - Settings: `%LOCALAPPDATA%\Mirlo\config.json` (defaults written on first
    run).
  - Measured (idle, logged-in home, attached to running process):
    **371.1 MB private** — acceptance < 450 MB met. Evidence:
    `docs/research/images/phase-a-idle.png` (**contains a private session:
    redact or replace before making the repo public**).
  - Verified manually: bridge IPC end-to-end (via CDP + `MIRLO_DEBUG_PORT`),
    hotkeys firing (silent play/pause round-trip), single-instance, graceful
    shutdown with no orphan `msedgewebview2`.
  - Leftovers scheduled: ad-block v1 (network-level `WebResourceRequested`),
    settings UI (Phase B), `windows_subsystem` switch + file logging
    (Phase D).
- **Phase B — IN PROGRESS**: plugin host + batch 1 landed (2026-10-16).
  - Bridge plugin host (`window.__MIRLO_PLUGINS__`): `register(id, def)` with
    `defaults` / `styles` / lifecycle (`start(ctx)`, `onPlayerApiReady(api,
    ctx)`, `onConfigChange(cfg)`, `stop()`); per-plugin options live in
    `config.json` under `plugins` (schema v2; defaults in each plugin file,
    the shell stores only user changes); styles via `adoptedStyleSheets`;
    `waitForElement` helper; `ids()`/`get()` debug accessors.
  - New command `set_plugin_config` (ACL `allow-set-plugin-config`) so plugin
    contexts can persist options (`ctx.setConfig`).
  - Compatibility layer: the player element's native `videodatachange` is
    re-emitted on `document` (+ `ytmd:src-changed` on the video at
    `dataloaded`), mirroring pear-desktop's `song-info-front`.
  - Port batch 1, all **default OFF**: blur-nav-bar, compact-sidebar,
    album-color-theme, video-toggle, unobtrusive-player, disable-autoplay
    (`app/src-tauri/plugins/*.js`; attribution headers +
    THIRD_PARTY_NOTICES.md table).
  - Verified live (CDP): six plugins enabled → 5 style sheets, body classes,
    computed `backdrop-filter: blur(8px)`, compact sidebar, album-color CSS
    vars, video-toggle button inside `#player`, autoplay pause on load;
    dynamic disable/enable via config + page reload (no app restart);
    `set_plugin_config` persistence from a plugin; **368.4 MB idle private**
    with all six on (Phase A baseline 371.1). Screenshot:
    `docs/research/images/phase-b-batch1.png`.
  - Remaining Phase B: port batches 2 (audio) and 3 (content), settings UI.
- Machine facts: Windows 11 x64; Rust 1.99.1 (MSVC) installed; VS 2019 Build
  Tools present; WebView2 runtime 155 present; Node 24 present; npm available.
- Build artifacts must NOT go into OneDrive: always set
  `CARGO_TARGET_DIR=C:\Users\luigi\AppData\Local\Temp\opencode\ytm-target`
  (or any temp dir) before cargo commands.

## Next step — Phase B (renderer plugins)

Goal: continue Phase B — plugin host and batch 1 are done (see "Current
state"); next, in this order:

1. Port batch 2 (audio): equalizer, precise-volume, crossfade,
   playback-speed, exponential-volume, skip-silences. These use the Web Audio
   context; the host may need an `audioContext` provider (upstream wires
   `audioSource`/`audioContext` in its renderer core and dispatches
   `ytmd:audio-can-play`; see `src/renderer.ts` in the extracted sources).
2. Port batch 3 (content): sponsorblock, synced-lyrics, skip-disliked-songs,
   quality-changer, album-actions, captions-selector, navigation.
3. Plugin settings UI in the shell (small settings window listing plugins
   with enable toggles + options, backed by `set_plugin_config` and
   `get_config`).

Carry-over notes:

- Ports keep upstream comments + attribution headers and are logged in
  `THIRD_PARTY_NOTICES.md`.
- `defaults: { enabled: false }` for every new port: Mirlo ships plugin
  features opt-in until the settings UI exists (upstream defaults may differ;
  note deviations in the file header).
- Any new renderer→shell command must be added to BOTH `invoke_handler` and
  `build.rs`'s `AppManifest::commands` + `capabilities/main.json` (`allow-*`),
  or the remote page gets `not allowed by ACL`.

## Traps and dev notes

- Tauri 2 **remote IPC needs explicit ACL**: a capability with `remote.urls`
  plus app-permission entries (`allow-<command>`, generated by `build.rs`'s
  `AppManifest::commands`) referenced in the capability. `invoke_handler`
  alone is not enough for remote origins; failures surface as
  `Command ... not allowed by ACL` (debug builds print a full explanation).
- Plugin init order: `#movie_player` can exist **before DOMContentLoaded**;
  the host only calls `onPlayerApiReady` after a plugin's `start()` resolved
  (its config is loaded by then), and `#player` can be re-created during
  YouTube Music's boot — plugins that inject UI into it must re-attach
  (see video-toggle's observer).
- The boot config (`window.__MIRLO_BOOT__`) is templated per window creation;
  the host refreshes through `get_config` at plugin init, so config edits +
  page reload apply without restarting the app.
- With a CDP session attached, YouTube Music's bundle can execute `debugger;`
  statements and freeze the renderer (every `Runtime.evaluate` times out).
  Detach/reload to recover; not a Mirlo bug.
- Windows `data_directory` = WebView2 UserDataFolder; WebView2 uses/creates
  `<dir>\EBWebView` — same layout as the wry PoC profile, which is how the
  session was carried over.
- `MIRLO_DEBUG_PORT=9222` (env) enables CDP on the WebView2 for inspection
  (REA tools or any CDP client); off by default. Example probe:
  `Runtime.evaluate` on the page target.
- Force-killing the host leaves WebView2 trees shutting down slowly; verify
  with a process-tree walk (`Get-CimInstance Win32_Process` filtered by
  command line) and prefer graceful close (`CloseMainWindow()`).
- The app console stays attached (no `windows_subsystem` yet) — useful for
  smoke tests, to be replaced by file logging in Phase D.
- `cargo test --lib` runs the config unit tests without needing a window or
  WebView2 runtime.

## Critical facts and guardrails

- Remote: `https://github.com/4lefernandezc/mirlo` — **private until the first
  release**; the owner will make it public then. Never change repository
  visibility without explicit owner approval. Push uses the owner's stored git
  credentials (no gh CLI installed).
- Reference app: pear-desktop v3.11.0 (ex th-ch/youtube-music), MIT. We MAY
  reuse its plugin code with attribution (add notices to
  `THIRD_PARTY_NOTICES.md` when porting). The user's local copy of the built
  exe lives at
  `C:\Users\luigi\OneDrive\Documentos\yt music nativo\example project\YouTube Music.exe`
  — **never modify or delete it**.
- Extracted analysis working copies (re-creatable): app sources at
  `%TEMP%\opencode\ytm311\` (app dir with `resources/app.asar`, upstream source
  tag v3.11.0 in `src\pear-desktop-3.11.0`).
- ToS posture (ADR-0003): wrapper of the official player only. NO stream
  extraction / InnerTube playback. Downloader plugin is excluded. Ad-block
  ships OFF by default. No "YouTube" in branding; disclaimers kept.
- Never commit secrets. Never commit build artifacts. `.gitignore` covers the
  basics; target al temp dir.

## Repository layout

```
app/                        Tauri 2 application (Phases A+B, in progress)
  ui/index.html             Static fallback page (frontendDist, no build step)
  src-tauri/src/lib.rs      Shell: window, commands, hotkeys, tray, single-instance
  src-tauri/src/config.rs   JSON settings store (schema v2: plugins map)
  src-tauri/src/bridge.js   Bridge + plugin host injected into the player page
  src-tauri/src/plugins.rs  Plugin source registry (include_str!)
  src-tauri/plugins/*.js    Renderer plugin ports (one file per plugin)
  src-tauri/capabilities/   Remote-URL capability (ACL) for the bridge
docs/
  architecture.md           Target architecture
  roadmap.md                Phases and status
  adr/                      Architecture decision records
  research/                 Evidence (plugin inventory, IPC contract, measurements,
                            PoC validation, idle screenshot)
poc/webview2-probe/         Validated Rust + wry spike (seed for Phase A)
tools/measure-memory.ps1    RAM measurement helper (process tree, private WS)
tools/gen-icons.ps1         Regenerates app icons (placeholder mark)
```

## Commands

```powershell
# Build the app (from repo root; keep artifacts out of OneDrive)
$env:CARGO_TARGET_DIR = "C:\Users\luigi\AppData\Local\Temp\opencode\ytm-target"
cargo build --manifest-path app/src-tauri/Cargo.toml --release

# Run the app
cargo run --manifest-path app/src-tauri/Cargo.toml --release

# Checks (run before every commit)
cargo fmt --manifest-path app/src-tauri/Cargo.toml
cargo clippy --manifest-path app/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path app/src-tauri/Cargo.toml --lib

# Measure memory of the running app (attach; keeps it alive)
powershell -NoProfile -File tools/measure-memory.ps1 -ProcessName "mirlo" -SettleSeconds 20

# Build the PoC
cargo build --release --manifest-path poc/webview2-probe/Cargo.toml

# Git
git status
git add -A; git commit -m "type(scope): message"
```

## Guidelines

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`...).
- Rust: `cargo fmt` and `cargo clippy` clean before commit.
- When porting pear-desktop code: keep upstream comments, adjust imports, add
  attribution header, and log it in `THIRD_PARTY_NOTICES.md`.
- Prefer small, reviewable commits; update docs in the same commit as the code
  they describe.
