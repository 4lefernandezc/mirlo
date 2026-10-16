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
  - Remaining Phase B: equalizer + precise-volume (batch 2 leftovers), port
    batch 3 (content), settings UI.
- **Phase B batch 2a — DONE (2026-10-16)**: audio infrastructure + 3 ports.
  - **Audio provider** in the bridge: `AudioContext` +
    `createMediaElementSource(video)` created **on demand** (only when an
    enabled plugin declares `audio: true`; upstream always wires it —
    deviation) and announced via upstream-compatible
    `ytmd:audio-can-play` (`{audioContext, audioSource}`) plus
    `host.audio()` / `host.onAudioReady(cb)`; context resume on first click
    if suspended.
  - Ports (all default OFF): exponential-volume (patches
    `HTMLMediaElement.prototype.volume`; `stop()` restores the descriptor —
    deviation), playback-speed (plain-DOM paper-slider injected into the
    song menu; forces `video.playbackRate`), skip-silences (analyser-based;
    consumes the audio provider).
  - **crossfade excluded** (ADR-0003): upstream fetches the next track's
    stream URL via InnerTube (`youtubei.js`) to fade it — stream extraction
    is out of policy. Recorded in THIRD_PARTY_NOTICES.md + ADR-0003 addendum.
  - Verified (CDP): all nine plugins start with zero console errors; audio
    graph `state=running`; volume patch present with stored read-back;
    forced playbackRate returns to 1; slider DOM built + menu observer
    armed (menu-open injection left to real interaction); 331.8 MB idle
    private with nine plugins on (run-to-run page variance ±5%).
- **Phase B batch 2b — DONE (2026-10-16)**: equalizer + precise-volume.
  - equalizer: config-driven `filters` + `bass-booster` preset applied as
    parallel BiquadFilters through the host audio accessor (upstream v3.11.0
    has no sliders UI; the once-event race was replaced by
    `await __MIRLO_PLUGINS__.audio()`).
  - precise-volume: HUD + wheel/arrow shortcuts + tooltip/slider sync +
    `savedVolume` persistence (debounced `setConfig`), plus the shell side:
    `register_plugin_hotkeys` reads
    `config.plugins["precise-volume"].globalShortcuts` (tauri accelerator
    strings, e.g. "Ctrl+Alt+ArrowUp") and evals
    `changeVolume(...)` in the page (restart to apply, like upstream).
  - Two real traps found and fixed (also for future ports):
    **YouTube Music enforces Trusted Types** — `insertAdjacentHTML`/string
    HTML throws, build nodes with DOM APIs; and **the audio graph may be
    wired before a plugin starts** — use the `audio()` accessor instead of
    the one-shot `ytmd:audio-can-play` event.
  - Verified (CDP + console capture): 11 plugins start with zero errors;
    EQ preset applied (`appliedFilters: 1`); HUD injected with correct
    parent; local ArrowUp 40%→42% with HUD text; shell hotkey
    Ctrl+Alt+ArrowUp 42%→44%; `savedVolume` persisted; **300.3 MB idle
    private with 11 plugins on**.
  - Remaining Phase B: settings UI, then port batch 3 (content).
- **Phase B settings UI — DONE (2026-10-16)**: local settings window.
  - New window label `settings`, served from `app/ui/settings.html`
    (embedded static page, no build step), opened from the tray
    ("Settings…") or with `mirlo.exe --settings`; it shares the WebView2
    environment with the player (same `data_directory` + browser args, which
    WebView2 requires and keeps CDP debugging unified).
  - Page lists General (adblock, hotkeys_enabled) + one card per plugin with
    enable toggle and typed option fields (boolean/number/select/string,
    dotted `path` support), backed by `get_plugin_manifest` (new command;
    UI metadata in `plugins.rs::manifest()`, runtime defaults remain the
    plugin JS), `set_plugin_config`/`set_config` and a "Reload player"
    button (`reload_player`). Changes save on interaction; reload applies
    them without restarting the app.
  - New capability `settings-capability` (local-only, windows:["settings"]);
    closing the settings window only destroys it — `main` still owns app
    exit.
  - Verified (CDP on both targets): 11 cards / 17 toggles / 12 option fields
    rendered; toggling blur-nav-bar off + "Reload player" removed the blur
    from the player (styles 6→5, `backdropFilter: none`) and re-enabling
    restored it; no horizontal overflow. Screenshot:
    `docs/research/images/phase-b-settings.png` (capture artifact: PrintWindow
    clips composited WebView2 surfaces at some window sizes — trust the CDP
    layout numbers).
  - Remaining Phase B: port batch 3 (content).
- **Phase B batch 3a — DONE (2026-10-16)**: five content plugins + UI helper.
  - Ports (all default OFF): skip-disliked-songs (observer on the like
    button), captions-selector (subtitles button + caption track picker +
    autoload/disable options), quality-changer (gear button + quality
    picker via `getAvailableQualityLevels`), navigation (back/forward
    buttons in `#right-content`), sponsorblock (segments fetched **from the
    page** — the SponsorBlock API allows CORS and YT Music's CSP does not
    block it; `apiURL` configurable; third-party calls happen only while
    enabled).
  - New host helper `showChoiceMenu(anchor, items, onPick)` replaces the
    Electron dialogs upstream used (quality/captions pickers).
  - Verified (CDP + console): 16 plugins start with no plugin errors (the
    only console noise is SponsorBlock's expected 404 when a video has no
    segments); nav buttons ×2, quality/captions buttons present, dislike
    observer attached, sponsorblock api wired + page fetch to
    sponsor.ajay.app returned HTTP 404 (reachable); settings window renders
    16 cards / 24 toggles / 15 option fields without overflow. Screenshot:
    `docs/research/images/phase-b-batch3.png`.
  - Remaining Phase B: album-actions (medium, upstream 22 KB) and
    synced-lyrics (large, 86 KB, upstream uses Electron `net` — decide
    renderer fetch vs shell proxy before porting).
- **Phase B batch 3b (partial) — DONE (2026-10-16)**: album-actions.
  - Bulk like/dislike buttons (4, with a fill-percentage mask) for album
    and playlist pages; page observer on `#browse-page`, per-page change
    observer that re-runs the setup, and `loadFullList`/`applyToList` to
    apply actions across a shelf. Built with DOM/SVG APIs (Trusted Types).
  - Verified (CDP): plugin enabled, `buildButtonContainer()` produces the
    four upstream buttons (`allundislike`, `alldislike`, `alllike`,
    `allunlike`) with the mask overlays; no console exceptions on start.
    Page-level UI (buttons injected into an album's action row) not
    exercised in the automated pass — needs a real album/playlist visit.
  - Remaining Phase B: synced-lyrics only.
- **Phase B batch 3c — DONE (2026-10-16)**: synced-lyrics (reduced port).
  - LRCLib provider + upstream LRC parser + minimal Jaro-Winkler, fetched
    **from the page** (`lrclib.net` sends permissive CORS headers; requires
    the `Lrclib-Client` header; under load it answers 503
    `ServerOverloaded` — the port retries 3× and re-attempts once after
    15 s). UI: a subject-icon button in `#right-content` toggles a lyrics
    overlay panel with synced highlighting, click-to-seek and a plain-text
    fallback; `showLyricsEvenIfInexact` option.
  - Deviations recorded: single provider (no MusixMatch/Genius/Megalobiz/
    YTMusic variants), overlay panel instead of the upstream sidebar.
  - Trap found: a bare `yt-icon-button` custom element renders as a
    **300×300 unstyled block** in YT Music — quality-changer,
    captions-selector and synced-lyrics now build plain `<button>`s with a
    shared `.mirlo-icon-button` style block.
  - Verified (CDP): `state=ready` with 39 synced lines for the current
    track; panel toggle; active line highlighted at the playback position;
    clicking a line seeks exactly (`lines[5]` → 51.0 s); buttons 40×40 in
    the nav bar/player; no plugin console errors (only expected LRCLib
    503s during retries and SponsorBlock 404s). Screenshot:
    `docs/research/images/phase-b-lyrics.png` (CDP capture; prefer
    `cdp-screenshot.mjs` over PrintWindow for WebView2 evidence).
- **Phase B — COMPLETE (all batches ported)**: 18 plugins shipped, plus the
  plugin host, audio provider and settings UI. crossfade excluded
  (ADR-0003).
- **Phase B polish (defaults) — DONE (2026-10-16)**: stable additive plugins
  now ship enabled by default (navigation, video-toggle, precise-volume,
  captions-selector, quality-changer, compact-sidebar — each marked with a
  comment in its `defaults`); behavioral/opinionated ones stay OFF. User
  overrides in `config.json` always win.
- **Ad-block v1 — DONE (2026-10-16)**: network-level blocking on the WebView2
  controller; the Phase A leftover is closed.
  - New module `app/src-tauri/src/adblock.rs`: a
    `WebResourceRequested` handler (+ `AddWebResourceRequestedFilter("*",
    ALL)`) registered from `create_main_window` via
    `window.with_webview(...)` right after build. No cancel API exists in
    WebView2, so blocked requests are *answered*: `ICoreWebView2_2::
    Environment().CreateWebResourceResponse(empty IStream, 403, "Blocked",
    null)` + `args.SetResponse(...)` (the approach from the official
    samples); empty stream from
    `windows::Win32::UI::Shell::SHCreateMemStream(None)`.
  - Same conservative pattern set as v0 (doubleclick.net, googlesyndication,
    googleadservices, /pagead/, /api/stats/ads, activeview); unit-tested
    (`is_blocked`). v0 injection wrappers stay in `bridge.js` as the
    non-Windows/fallback path.
  - Gating **deviation from the original plan**: the handler is registered
    unconditionally and consults a live `AtomicBool` that mirrors
    `config.adblock` (updated in `setup` and `set_config`), so the settings
    toggle applies immediately — no page reload, no window recreation. Still
    OFF by default (ADR-0003). Bounded logging of blocked requests
    (first 10, then every 500).
  - Deps (Windows-only target section): `webview2-com = "0.39"` (must match
    tauri 2.12's, so COM types unify — resolves to 0.39.1) and
    `windows = "0.62"` with `Win32_System_Com` + `Win32_UI_Shell`.
  - Verified live (CDP, app already logged in): on page load the handler
    blocked real doubleclick requests (`ad.doubleclick.net/ccm/s/collect`,
    `static.doubleclick.net/instream/ad_status.js`); a main-frame navigation
    to `pagead2.googlesyndication.com/robots.txt` returned **HTTP ERROR 403**
    while adblock was on and the **real robots.txt content** with it off
    (toggled through the same `set_config` path the settings UI uses, no
    reload); playback kept working with the filter active (track advanced
    0.4 s → 7.3 s); 18 plugins still start; **371.1 MB idle private** — same
    as the Phase A baseline, no regression. Graceful close, no orphan
    `msedgewebview2`. Settings label updated to "Ad-block (network-level;
    applies immediately)".
- Machine facts: Windows 11 x64; Rust 1.99.1 (MSVC) installed; VS 2019 Build
  Tools present; WebView2 runtime 155 present; Node 24 present; npm available.
- Build artifacts must NOT go into OneDrive: always set
  `CARGO_TARGET_DIR=C:\Users\luigi\AppData\Local\Temp\opencode\ytm-target`
  (or any temp dir) before cargo commands.

## Next step — Phase C

Ad-block v1 is done; Phase B is complete. Next: **Phase C (native
integrations)**:

1. **Media Session (SMTC)**: taskbar overlay + hardware media keys — the
   shell already receives `player-state` events (play-or-paused,
   video-src-changed, time-changed) via `report_player_state`; map them to a
   Windows SMTC session (there is a Rust route via the `windows` crate —
   `System::Media` — or a small crate; evaluate both for footprint).
2. **Notifications** on track change (`video-src-changed`).
3. **Scrobbler (Last.fm)** and **Discord rich presence** (upstream has
   plugins for both; Discord needs an IPC client in the shell or a port that
   talks to the local Discord socket).

Also still pending from Phase A/B leftovers: `windows_subsystem` switch +
file logging (planned for Phase D).

Carry-over notes:

- Ports keep upstream comments + attribution headers and are logged in
  `THIRD_PARTY_NOTICES.md`.
- `defaults: { enabled: false }` for every new port: Mirlo ships plugin
  features opt-in until the settings UI exists (upstream defaults may differ;
  note deviations in the file header).
- Any new renderer→shell command must be added to BOTH `invoke_handler` and
  `build.rs`'s `AppManifest::commands` + `capabilities/main.json` (`allow-*`),
  or the remote page gets `not allowed by ACL`.

### Resume notes — Phase C (next session, 2026-10-16)

State: **ad-block v1 is done and verified** (this session's commits: the
adblock module + defaults from the previous session). Next: **Phase C** per
"Next step" above (SMTC/media keys, notifications, scrobbler, Discord).

- The vendored `webview2-com 0.39.1` exposes
  `WebResourceRequestedEventHandler` and the full
  `Microsoft::Web::WebView2::Win32` surface; `PlatformWebview::controller()`
  returns `ICoreWebView2Controller` (see tauri `webview/mod.rs:184`).
- Keep the v0 injection blockers as the non-Windows/fallback path; v1 is
  Windows-only for now (the shell is Windows-first until Phase E).
- Ad-block v1 gating is a live `AtomicBool`; if a future change wants the
  filter registration itself conditional, keep in mind that `with_webview`
  is the only chance to grab the controller right after build, and reloads
  do NOT re-run it.

Other carry-over notes:

- Every new plugin needs: a `plugins/*.js` file registering itself (default
  `enabled: false`), an entry in `plugins.rs::PLUGINS` **and**
  `plugins.rs::manifest()` (unit test enforces the id list/order), a
  THIRD_PARTY_NOTICES.md row, then the verification pass.
- Interactive UI (menus/pickers) should use `__MIRLO_PLUGINS__.showChoiceMenu`
  instead of Electron dialogs; build DOM with APIs, never string HTML
  (Trusted Types). Never use bare `yt-icon-button` (300×300 trap) — plain
  `<button>` + `.mirlo-icon-button` styles (see synced-lyrics.js).
- Third-party fetches from the page work when the API allows CORS
  (sponsor.ajay.app, lrclib.net) — check per provider before building a
  shell proxy.
- CDP freeze trap: after some interactions the YT bundle can hit
  `debugger;` with the inspector attached; recover by restarting the app
  (not a Mirlo bug).

Verification recipe and traps: see the sections below (CDP + console capture
via `%TEMP%\opencode\cdp-console.mjs` shows plugin starts/errors; `cdp-eval.mjs`
for probes — pass a URL substring as 4th arg to target the settings window;
`capture-window.ps1` for screenshots, `-WindowTitle` + `-MoveX/-MoveY/-MoveW/-MoveH`).

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
- **Trusted Types**: YouTube Music enforces
  `require-trusted-types-for 'script'`, so `insertAdjacentHTML` / string
  HTML throws (`This document requires 'TrustedHTML' assignment`). Build
  nodes with DOM APIs (or a Trusted Types policy).
- **Audio graph timing**: the host may wire the audio graph before a plugin
  starts, so the one-shot `ytmd:audio-can-play` event is not a reliable
  handoff — inside plugins use `await __MIRLO_PLUGINS__.audio()` (the event
  is kept for upstream-shaped code).
- Global plugin hotkeys (`precise-volume.globalShortcuts`) are registered by
  the shell at startup from `config.json` (tauri accelerator strings, e.g.
  "Ctrl+Alt+ArrowUp"); changes need an app restart.
- Never reuse YouTube's custom elements bare (`yt-icon-button` renders
  300×300 unstyled); build plain buttons with plugin styles
  (`.mirlo-icon-button`).
- LRCLib requires a descriptive `Lrclib-Client` header and answers 503
  `ServerOverloaded` under load; retry briefly (see synced-lyrics.js).
- Extra windows must share the WebView2 environment with the player (same
  `data_directory` and browser args) or WebView2 spawns a separate browser
  process — that also splits the CDP endpoint (the settings window was
  invisible to debugging until it matched; see `open_settings_window`).
- Frontend assets under `app/ui/` are embedded at compile time: HTML/CSS
  changes need a rebuild, not just an app restart.
- `PrintWindow` captures of WebView2 (composited surfaces) may clip content
  at some window sizes/positions; use CDP layout numbers (scrollWidth vs
  innerWidth) as the source of truth for layout checks.
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
- Ad-block v1 wiring traps: `with_webview` is a fire-and-forget main-thread
  message that runs once the event loop starts — it is the only chance to
  grab the controller right after build (reloads do not re-run it); the
  `WebResourceRequested` handler must answer synchronously;
  `ICoreWebView2WebResourceRequest::Uri` is generated as an **out-param**
  (`Uri(&mut PWSTR)`) — free the buffer with `webview2_com::take_pwstr`.
- CDP ad-block A/B probes: a blocked main-frame navigation renders Chromium's
  "HTTP ERROR 403" page (`chrome-error://chromewebdata/`, empty body), while
  the same URL with ad-block off returns the real content; navigating to a
  JS content-type URL triggers Edge's "Descargar varios archivos" permission
  prompt, which is a **separate CDP target**
  (`edge://permission-request-dialog/`) — deny it by clicking its
  `fluent-button` with text "Bloquear".
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
app/                        Tauri 2 application (Phases A+B done; Phase C next)
  ui/index.html             Static fallback page (frontendDist, no build step)
  ui/settings.html          Local settings window (plugins UI, no build step)
  src-tauri/src/lib.rs      Shell: windows, commands, hotkeys, tray, single-instance
  src-tauri/src/config.rs   JSON settings store (schema v2: plugins map)
  src-tauri/src/adblock.rs  Ad-block v1: WebResourceRequested handler (Windows)
  src-tauri/src/bridge.js   Bridge + plugin host injected into the player page
  src-tauri/src/plugins.rs  Plugin source registry + settings manifest
  src-tauri/plugins/*.js    Renderer plugin ports (one file per plugin)
  src-tauri/capabilities/   Remote-URL + settings-window capabilities (ACL)
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
