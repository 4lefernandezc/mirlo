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
- **Identity/privacy**: repository content must never contain the owner's real
  name, personal email or local filesystem paths — use `$env:TEMP` or `<user>`
  placeholders. The GitHub account name in functional URLs is expected. Commits
  must use the repo-local noreply identity (already configured).
- Keep long work product in the repo (this file + `docs/`), so context limits
  never lose state. At the end of every milestone: update "Current state" here,
  update `CHANGELOG.md`, and commit.
- If context runs out mid-task: commit WIP with a clear message and add a
  "Resume notes" bullet here before finishing.

## Current state (2026-10-20)

- **v0.1.8 RELEASED (public, 2026-10-20)**: tag `v0.1.8` -> CI green +
  Release green (Windows 6m26s incl. portable ZIP, Linux, `checksums`) ->
  draft verified (11 assets, 9/9 checksums OK, `latest.json` 0.1.8 with the
  6 signed platform entries) -> published; updater endpoint anonymous 200
  (0.1.8). The published `-setup.exe`/portable `mirlo.exe` report 0.1.8 and
  the portable starts and logs `--- Mirlo 0.1.8 starting ---`. Contents: the
  synced-lyrics work below (sync fixes, animated rendering, cached and
  prefetched LRCLib lookups). The owner's installed 0.1.7 was running during
  the release, so the portable check exited on the single-instance guard
  (expected); the auto-update E2E was left for the owner (tray -> *Check for
  updates…* or the next launch).
- **Synced lyrics fixed + animated (2026-10-20)**: the highlight
  now follows the song reliably and the rendering got CSS animations.
  Root causes found: (1) the plugin read the position from
  `document.querySelector('video')` — YT Music keeps preloaded `<video>`
  elements and their DOM order flips during transitions, so the highlight
  drifted and click-to-seek moved a video nobody was listening to; it now
  resolves the active video exactly like the bridge does
  (`#movie_player video` first) and seeks via the player API
  (`api.seekTo(seconds, true)`, keeps the progress bar in sync, raw
  `currentTime` only as fallback); (2) `timeupdate` was bound once to the
  video element that existed at `onPlayerApiReady`, and YT Music replaces
  that element during navigation — the sync silently died until a restart;
  it is now registered on `document` **in the capture phase** (`timeupdate`
  does not bubble, but capture listeners still see it from descendants —
  verified in Chromium); (3) LRC lines out of order / with repeated
  timestamps broke the "last line whose time <= now" scan — the parser now
  sorts (stable) and recomputes durations; (4) a track the player never
  reported properly (ad breaks, very fast swaps) left the state stuck in
  `loading` after 8 stale retries — the native "Letra" tab stayed blank and
  the panel showed "Searching lyrics…" forever; it now gives up and
  restores the native text. Visuals: lines fade/slide in with a stagger,
  the active line gets an amber accent bar + tinted background + slight
  slide, the panel animates in on open, empty lines render as spacers
  instead of "♪", everything is CSS (transitions + keyframes, off under
  `prefers-reduced-motion`) and the inline styles were replaced by the
  `.mirlo-lyrics-line` / `.mirlo-active` classes in the plugin `styles`
  block (adoptedStyleSheets). Empty lines are never highlighted (during the
  intro nothing is active), and `updateActive` also runs when the lyrics
  resolve and on play/pause/seeked, so a paused track is in sync at once.
  Load latency: LRCLib search takes 1–6 s (`/api/get` answered 503 under
  load, so it is not a faster path). `cachedSearch` caches the raw search
  responses (in flight shared, failures evicted, 30 entries) and
  `prefetchNext` warms the queue track that follows the current one from the
  `ytmusic-player-queue-item` DOM, so sequential tracks show lyrics at once
  (verified: ~25 ms after `dataloaded`). The first track after launch still
  waits for its own lookup.
- **v0.1.7 RELEASED (public, 2026-10-19)**: tag `v0.1.7` -> workflow green
  (Windows + Linux + the `checksums` job, now fixed) -> draft verified (11
  assets, every checksum OK, `latest.json` with `windows-*` and `linux-*`
  entries) -> published; updater endpoint anonymous 200 (0.1.7). Contents:
  faster and safer resume playback (fires ~1 s after the page is usable,
  the watch URL loads at the saved second with `&t=`, navigation clicks the
  booting app ignored are retried within 3 s, real user input aborts it,
  elapsed ms reported in the log), close-to-tray default (config v4), MPRIS
  media controls on Linux, dark boot background, README install-first.
- **v0.1.6 RELEASED (public, 2026-10-18)**: **first release with Linux
  support** — tag `v0.1.6` → workflow: Windows job ✓ + Linux job ✓
  (AppImage 82 MB + deb, both signed) → the `checksums` job failed on its
  first run (missing `actions/checkout`: `gh` needs a repo context — fixed
  in `6c08890` for future releases; the checksums were generated manually
  this time) → draft verified (all 9 assets + `latest.json` with
  `linux-x86_64*` **and** `windows-x86_64*` entries) → published; updater
  endpoint anonymous 200 (0.1.6, both platforms). Contents: Linux
  support + the resume-playback router fix ("suena pero no se muestra").
- **v0.1.5 RELEASED (public, 2026-10-18)**: tag `v0.1.5` → workflow green →
  draft verified (NSIS + MSI + sigs + portable ZIP, all checksums matched)
  → published; updater endpoint anonymous 200 (0.1.5, NSIS/MSI signatures).
  Contents: "resume playback where you left off" (track/position/play state
  saved on close and restored on launch) and Discord Rich Presence working
  out of the box (project's built-in application id; config v3 migration).
- **v0.1.4 RELEASED (public, 2026-10-18)**: tag `v0.1.4` → workflow green →
  draft verified (NSIS + MSI + sigs + portable ZIP, all checksums matched)
  → published; updater endpoint anonymous 200 (0.1.4, NSIS/MSI signatures).
  Contents: the "¿Sigues ahí?" inactivity-prompt blocker (`window._lact`
  refresh every 15 min). Released specifically for a user report about
  interrupted playback.
- **v0.1.3 RELEASED (public, 2026-10-17)**: tag `v0.1.3` → workflow green →
  draft verified (NSIS + MSI + sigs + portable ZIP, all checksums matched)
  → published; updater endpoint anonymous 200 (0.1.3, NSIS/MSI signatures).
  Contents: synced lyrics with highlight animation inside the native
  "Letra" tab (plus the loading-race/flicker/wrapper fixes) — see the
  batch 3c notes below.
- **v0.1.2 RELEASED (public, 2026-10-17)**: tag `v0.1.2` → workflow green →
  draft verified (NSIS + MSI + sigs + portable ZIP, all checksums matched
  `SHA256SUMS.txt`) → published; updater endpoint anonymous 200. Contents:
  ad-block v2 (player-response prune — audio ads between tracks), the
  beforeunload-dialog neutralizer, and the minimize-to-tray option. The
  running app offers the 0.1.2 update on its next check.
- **v0.1.0 RELEASED (public)**: repository is public
  (`https://github.com/4lefernandezc/mirlo`), release published with NSIS/MSI
  installers, updater signatures and `latest.json`; auto-update endpoint
  verified anonymously (HTTP 200). Private vulnerability reporting enabled.
  Git history sanitized: all commits use the noreply identity, no personal
  names/emails/local paths in content (repo-local git config pins the noreply
  email — keep it).
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
    **371.1 MB private** — acceptance < 450 MB met.
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
    with all six on (Phase A baseline 371.1).
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
    restored it; no horizontal overflow.
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
    16 cards / 24 toggles / 15 option fields without overflow.
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
    503s during retries and SponsorBlock 404s).
  - **Native-tab animation (2026-10-17)**: the player's own "Letra" tab
    renders the song as one plain-text blob; when timed lyrics exist the
    plugin replaces it with its line-by-line rendering (active line
    highlighted + smooth auto-scroll + click-to-seek) inside the native
    view. Traps: the shelf keeps **several description variants**
    (expandable/non-expandable) in different wrappers and the visible one
    varies — the plugin injects a container into **every** description
    wrapper instead of guessing (the hidden copies stay invisible); while
    a track change resolves, the plain blob is suppressed to avoid a
    stale-text flash; quick next/previous swaps can return a **stale
    `getPlayerResponse()`** — the fetch verifies `videoDetails.videoId`
    against `getVideoData().video_id` and retries briefly instead of
    fetching for the wrong track; style-only tab toggles emit no
    childList mutations, so a 2 s `timeupdate` poll re-runs
    `enhanceNativeShelf()` (it early-returns when nothing changed).
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
- **Ad-block v2 — DONE (2026-10-17)**: the owner reported audio ads between
  tracks with v1 active. Root cause: YouTube Music *announces* audio ads
  inside the `/youtubei/v1/player` response (`playerAds`, `adPlacements`,
  `adSlots`) and serves their audio as regular streams — URL blocking alone
  cannot stop them. v2 prunes those keys from the player response in the
  bridge (same technique as uBlock Origin's `json-prune` filters on YouTube;
  implemented independently — see ADR-0003 Addendum 2). The fetch wrapper is
  always installed and consults the live `config.adblock` flag (refreshed at
  most every 5 s so Settings changes apply roughly live); `__mirlo.adblockStats`
  exposes `{blocked, pruned}` counters for debugging. Verified live: with
  adblock on, the player response holds no ad keys (`getPlayerResponse()`)
  while playback continues; with it off the keys are present.
  - **Also (same day): `beforeunload` dialog neutralized** in the bridge at
    document start (drops `beforeunload` listeners + no-ops
    `window.onbeforeunload`). YouTube Music arms it, so navigating away with
    user activation popped Chromium's "Los cambios no se guardarán" dialog,
    which blocks renderer JS while pending (looked like a CDP freeze — see
    traps). **WebView2's `ScriptDialogOpening` event does NOT fire for
    `beforeunload`** (verified live with an instrumented handler: never
    invoked; the controller-level auto-accept approach was removed).
- **Phase C — SMTC (media session) DONE (2026-10-16)**: Windows media
  integration via `SystemMediaTransportControls` (`windows` crate; no new
  dependencies — features added to the existing Windows-only dep).
  - New module `app/src-tauri/src/media_controls.rs`: session created for the
    main window HWND (`ISystemMediaTransportControlsInterop::GetForWindow` +
    `factory::<SystemMediaTransportControls, _>()`) right after build;
    play/pause/next/previous + position-change forwarded to the page through
    `window.__mirlo.player` (`eval_in_player`); `report_player_state` drives
    status/metadata/timeline. Thumbnail from the URL's `v=` id
    (`i.ytimg.com/vi/<id>/mqdefault.jpg`); byline `"Artist • Album • Year"`
    split into artist/album (unit-tested helpers).
  - Bridge additions: `player.play()`, `player.pause()` (state-aware, unlike
    the toggle) and `player.seek(seconds)` (`#movie_player.seekTo`).
  - Verified live (2026-10-16) with a PowerShell WinRT probe
    (`%TEMP%\opencode\smtc-probe.ps1`) reading the OS-side session
    (`GlobalSystemMediaTransportControlsSessionManager`): status, title,
    artist, album, position/end all correct; `TryTogglePlayPauseAsync`
    (the same path hardware media keys use) paused/resumed the page;
    `TryChangePlaybackPositionAsync(120 s)` moved `video.currentTime` to
    ~123 s; no `smtc:` errors in the log. Memory 387.5 MB after a full
    playback round trip (baseline 371.1 idle; within variance, < 450 MB).
- **Phase C — notifications DONE (2026-10-16)**: track-change toasts.
  - New module `app/src-tauri/src/notifications.rs` (native WinRT toasts; no
    new dependencies): ToastGeneric XML built by hand (`toast_xml`, escaped),
    `XmlDocument.LoadXml` → `ToastNotification.CreateToastNotification` →
    `ToastNotifier.Show`. Unpackaged-app AUMID registered lazily on first
    use at `HKCU\Software\Classes\AppUserModelId\Mirlo` (`DisplayName` +
    `IconUri`; enough, no Start Menu shortcut needed).
  - Gating: new config field `notifications` (default **true**, General
    checkbox in the settings UI, label notes it only fires when the window
    is not focused). Focus check uses **`GetForegroundWindow() == hwnd`**,
    not tao's `window.is_focused()` — see traps.
  - Dedup: the bridge re-emits `video-src-changed` 2-3x per track
    (emptied/loadedmetadata/scan), so toasts are keyed by title and fire
    once per actual change; the first track observed after launch never
    toasts (it's the previous session's queue). The dedup bookkeeping runs
    even while focused so focused changes still advance "last track"
    (otherwise the next background change would be swallowed as "first").
  - Shows title + artist (byline split reuse) + artwork from the videoId.
  - Verified live (2026-10-16): startup/focused changes → 0 toasts; two
    unfocused changes → exactly one toast each, correct titles
    (`toast: Hey Now Now (n=1)`, `toast: Unglued (n=2)`) with the
    bookkeeping advancing across focused changes. The AUMID registry key
    was created by our code (`DisplayName`/`IconUri` present). **Banner not
    visible in this environment because Windows notifications are disabled
    at the user level** (`ToastNotifier.Setting()` = 2 `DisabledForUser` —
    `Show()` succeeds and the OS drops the toast silently; the module logs
    this once per run). Memory 409 MB fresh idle with all features; 427.9
    after a long playback session — both < 450 target.
- **Phase C — Discord rich presence DONE (2026-10-16)**: minimal IPC client,
  **ships OFF** until a client id is configured.
  - New module `app/src-tauri/src/discord.rs` (no dependencies): frame codec
    (`u32-LE op | u32-LE len | JSON`), worker thread owning the connection
    (`\\.\pipe\discord-ipc-0..9`), handshake `{v:1, client_id}`, READY/ERROR
    handling, PING→PONG, reconnect pacing (5/10/30 s by state) and
    change-detection so SET_ACTIVITY is sent only when the activity really
    differs. Reader thread per connection keeps the pipe healthy.
  - Settings → General: `Discord Rich Presence` checkbox + `client id` text
    field (config `discord_rpc` / `discord_client_id`, default off/empty).
    The activity maps `video-src-changed`/`play-or-paused`/`seeked` to
    type 2 (Listening) with `details` = title, `state` = artist and a
    `timestamps.start` while playing.
  - Verified live (2026-10-16) against the running Discord client with a
    dummy id: `connected to \\.\pipe\discord-ipc-0, handshake sent` →
    `Discord closed the pipe: {"code":4000,"message":"Invalid Client ID"}`
    — the round trip proves the frame codec and handshake are correct.
  - Post-release fixes (same day, user's real client id): the activity now
    updates across track changes (peek-gated reader; a pending blocking
    read deadlocks writes — see traps), shows the **cover** (bridge reports
    `videoId` from the player API; Discord resolves the external artwork
    URL to `mp:external/...` — visible in the ack reply) and the **timer**
    (milliseconds, start+end while playing). Paused tracks carry no
    timestamps by design. **Confirmed working by the user (2026-10-16):
    cover, timer and cross-track updates all render correctly in Discord.**
  - **Built-in Discord application (2026-10-18)**: the project now ships
    its own public client id (`discord.rs::DEFAULT_CLIENT_ID`, app "Mirlo");
    the feature is **on by default** and works out of the box (an empty
    configured id falls back to the built-in one). The Settings field is an
    optional override. Config v3 migration enables the feature for users
    who never configured a client id (their choice was respected otherwise).
    Verified live: empty id → `READY` + ack under `application_id
    1560828287050195045`.
  - **What the user must do to activate it**: nothing (Discord must be
    running); the toggle in Settings turns it off. The activity is displayed
    under the project's "Mirlo" application.
- **Window geometry persistence — DONE (2026-10-16)**: the player window
  reopens with the size/position/maximized state of the last session;
  fresh installs start **maximized**.
  - New module `app/src-tauri/src/window_state.rs`: geometry stored in
    **logical** units (DPI-independent) in
    `%LOCALAPPDATA%\Mirlo\window-state.json`; `Moved`/`Resized` events feed
    `track` (disk writes throttled to 1/s), and `persist` flushes on
    window close, tray quit and `restart_app`.
  - Traps handled: minimize transitions are skipped (bogus bounds); the
    maximized check uses **`GetWindowPlacement().showCmd`**, not tao's
    `is_maximized()` (during the maximize transition IsZoomed lags and the
    maximized bounds were stored as the "restore" geometry); `seed()` loads
    the file into the tracked state *before* the window is built, because
    creation-time events do not arrive and the first (maximized) event used
    to clobber the persisted bounds with defaults.
  - Restore verifies the saved placement still intersects a monitor (≥80 px
    visible) and centers the window otherwise (monitor unplugged).
  - Verified live: fresh → maximized; custom 1200×750 @ (210,160) restored
    exactly; maximize + close keeps the normal geometry with
    `maximized: true`; reopen maximized and un-maximize returns to the
    saved bounds.
- **Phase D — DONE (2026-10-17)**: packaging, release pipeline and auto-update.
  - Installers via Tauri CLI (`npx @tauri-apps/cli@^2 build`): NSIS per-user
    (`currentUser`, no admin) + WiX MSI, embedded WebView2 bootstrapper,
    English/Spanish NSIS language selector, MIT license page. An NSIS install
    hook (`app/src-tauri/installer-hooks.nsh`) relocates the default install
    dir from `%LOCALAPPDATA%\Mirlo` (which is the app-data dir!) to
    `%LOCALAPPDATA%\Programs\Mirlo`; user-chosen dirs are respected. Locally
    verified: silent install → `Programs\Mirlo` (only mirlo.exe +
    uninstall.exe), app runs with **subsystem GUI (2)** (no console), writes
    `%LOCALAPPDATA%\Mirlo\logs\mirlo.log`, graceful close, silent uninstall
    removes the program, data dir preserved. Installer sizes: NSIS 3.78 MiB,
    MSI 4.95 MiB.
  - Auto-update: `tauri-plugin-updater` 2.14 + `createUpdaterArtifacts`
    (both bundles get `.sig`). Public key in `tauri.conf.json`
    (`plugins.updater.pubkey`); endpoint
    `https://github.com/4lefernandezc/mirlo/releases/latest/download/latest.json`;
    NSIS `installMode: passive`. UX: silent check 30 s after startup
    (config flag `update_check`, General toggle), tray item "Check for
    updates…" (always reports), MessageBox confirm → download+install →
    restart. Verified: the check fired live on the installed build and
    logged `update check failed: Could not fetch a valid release JSON`
    (repo has no release yet) — error path works; full update E2E pending a
    real release. **Signing key: `%USERPROFILE%\.tauri\mirlo.key` (no
    password), never commit; public key already embedded.**
  - `windows_subsystem = "windows"` in release (debug keeps console) +
    `logging.rs` (dependency-free file logger, 1 MB rotation, `mirlo.log.old`,
    timestamps via `GetLocalTime`; macros `log_info!`/`log_error!` replace all
    println! call sites) + `dialog.rs` (MessageBoxW helpers; panic hook and
    fatal startup errors show a native box).
  - Release workflow `.github/workflows/release.yml`: on `v*` tag →
    tauri-action builds/signs, creates a **draft** release (installers, sigs,
    `latest.json`, `SHA256SUMS.txt` via `gh release upload`). Requires GitHub
    secrets `TAURI_SIGNING_PRIVATE_KEY` (+ password optional/unset) and a
    public repo for the updater endpoint.
  - Docs: `docs/user/{install,faq,terms}.md`, `docs/release.md` (mantainer
    checklist: secrets, version bump, tag, verify draft, publish; key
    rotation caveat: old installs only trust the old pubkey).
   - Screenshots and research captures were **removed from the repository
     entirely** (2026-10-17, owner decision: privacy and several captures
     predated window fixes). Keep documentation text-only; if media is ever
     re-added, review it for personal data and staleness first.
  - v0.1.0 was **published** on 2026-10-17 (the earlier "owner actions
    remaining" list was completed; see the first bullet in this section).
- **v0.1.1 — RELEASED publicly (2026-10-17)**: portable build published
  (installers + portable ZIP, all three checksums verified, updater endpoint
  serving 0.1.1); auto-update E2E 0.1.0 → 0.1.1 passed on the owner's machine.
  No-install distribution.
  - New `app/src-tauri/src/data_root.rs`: `resolve()` is a **pure function**
    (exe dir, `MIRLO_DATA_DIR` value, LOCALAPPDATA passed in; 5 unit tests
    cover the precedence) and `root()` wires it to the live process.
    Precedence: `MIRLO_DATA_DIR` (explicit override) → empty marker
    `portable.txt` next to the running exe (`<exe_dir>\data`) →
    `%LOCALAPPDATA%\Mirlo` (unchanged default). `is_portable()` = marker
    file only (the env var is a data override, not a distribution mode).
  - All app-owned paths now resolve through it: `config.rs` (config.json,
    webview2-profile), `logging.rs` (logs\mirlo.log), `window_state.rs`;
    the now-unused `AppHandle` parameters were dropped from those helpers
    and from the `set_config`/`set_plugin_config`/`get_path`/`restart_app`
    commands; the panic hook and fatal-startup dialog print the **resolved**
    log path instead of the hardcoded `%LOCALAPPDATA%` string.
  - `updates.rs`: portable copies still run the startup/tray check, but when
    an update exists they show a message pointing at the releases page and
    never download/run the NSIS installer (it would install into
    `%LOCALAPPDATA%\Programs\Mirlo`); installed copies unchanged.
  - CI (`release.yml`): new "Build portable ZIP" step creates
    `Mirlo_<version>_portable_x64.zip` (release `mirlo.exe` + empty
    `portable.txt` + `LICENSE` + `THIRD_PARTY_NOTICES.md` +
    `app/portable/README-PORTABLE.txt`); the checksum step includes the ZIP
    in `SHA256SUMS.txt`; the upload step publishes it in the draft; the
    release body explains the ZIP (manual updates, no updater signature).
  - Docs: `install.md` portable section + download-table row, README
    download line + dev note, `release.md` draft contents + portable
    verification step, plus FAQ / terms / architecture / app README updates.
  - Version bumped to **0.1.1** (`tauri.conf.json` + `Cargo.toml`),
    CHANGELOG section `[0.1.1] - 2026-10-17`.
  - Verified locally (2026-10-17): fmt/clippy/test green (24 tests, 5 new);
    release build run from a folder with `portable.txt` created
    `data\{config.json, logs\mirlo.log, webview2-profile\EBWebView}` while
    the `%LOCALAPPDATA%` log stayed untouched; without the marker the
    LOCALAPPDATA log grew (`--- Mirlo 0.1.1 starting ---`, `ready:
    profile=...\Mirlo\webview2-profile`) and no `data\` appeared next to the
    exe; the CI zip commands were reproduced locally, the extracted ZIP ran
    storing data in `data\`; geometry persisted to `data\window-state.json`
    after a window move; the portable update check reached `latest.json`
    ("0.1.1 is up to date"); graceful close, no orphan webview processes.
  - **Trap found**: during a fresh maximize-only run (no user interaction)
    no Moved/Resized events reach `track` (creation-time events don't
    arrive, matching the documented seed() trap), so `window-state.json` is
    only written once the window is actually moved/resized — pre-existing
    behavior, not a regression; fresh installs re-maximize by default.
- **Resume playback — DONE (2026-10-18)**: new config `resume_playback`
  (**default true**) + General checkbox ("Resume playback where you left
  off"); new module `playback.rs` mirrors the latest player state to
  `playback.json` (throttled 30 s + final write on close/restart) and the
  shell applies it **once per run** on the first `player-api-loaded` via
  `__mirlo.resumePlayback` (waits for the player API + a loaded video,
  seeks or loads the video, restores the play/pause state, and verifies up
  to 4× against YouTube Music's own queue restore).
  - Traps: serde serializes struct fields snake_case by default — the
    struct uses `rename_all = "camelCase"` (+ a `video_id` alias for older
    files) because the bridge reads `target.videoId`; `getVideoData()`
    throws while the player element boots (all calls guarded, and the
    bridge waits for the API instead of bailing); the DOM can hold
    preloaded extra `<video>` elements whose order flips during
    transitions — the bridge resolves the active one via `findVideo()`
    (`#movie_player video` first) everywhere instead of "the first video";
    **loading a track must go through the app router** (a synthetic click
    on a `<a href="/watch?v=…">`), never `loadVideoById()`: the raw API
    switches the audio while YouTube Music's UI keeps showing the previous
    track (reported by a user: "suena pero no se muestra" — reproduced
    live).
  - **Fast start**: the shell fires 0.5 s after each bridge-ready and the
    bridge waits at most ~2 s for a restored video before loading the saved
    track (it used to wait 15 s), with a 0.3 s settle; the router URL
    carries `&t=<position>` so the watch page starts at the saved second,
    and a navigation attempt that the still-booting SPA ignored is retried
    after 3 s. Verified 5.1-5.8 s from process launch to playback (the app
    boot is ~3.5-4 s of that). The bridge reports the elapsed time in
    `resume-done`; the shell logs `playback: resume finished (..., <ms> ms)`
    for field diagnostics.
  - **Do not fight the user** (reported inconsistencies: opened with the
    saved track "playing silently", or after picking a new song the saved
    track's audio took over while the UI showed the selection): the resume
    **aborts on the first real (`isTrusted`) input event**
    (pointerdown/keydown/wheel/touchstart). The shell fires it **1.2 s
    after each `bridge-ready`** and keeps the target armed until the
    bridge confirms with `resume-done`  - YouTube Music reloads the SPA
    during boot (the player flicker), so a reload simply re-applies the
    resume (max 5 attempts). The bridge then verifies the state in a
    user-safe window (up to 6 x 3 s): re-navigates only when the
    restored track differs, re-applies seek/play-state, and stops when
    applied.
  - Verified live: playing case (resumed at 40 s, t~97 after ~1 min);
    router-load case (target differs from the restored queue: bar/cover
    follow the track - resumed at 30 s, t=100); paused case with the
    1.2 s protocol (exact at 30 s, paused: one page reload re-armed the
    resume and `resume-done` stopped it - attempt=1, attempt=2, ok=true).
- **Minimize-to-tray option — DONE (2026-10-17)**: minimizing the player
  hides it from the taskbar (like the tray "Show / Hide"); new config field
  `minimize_to_tray` (**default true**) with a General checkbox in Settings.
  - `window_state::minimized_now` (GetWindowPlacement `showCmd`, same
    approach as the maximized check — tao's `is_minimized()` can lag during
    the transition); the `Resized` handler in `lib.rs` hides the window
    when the flag is on; `focus_main_window` already un-minimizes before
    showing, so the tray/single-instance paths restore it cleanly.
  - Verified live: minimize → `IsWindowVisible=False` (hidden, out of the
    taskbar); launching Mirlo again restored it un-minimized + focused;
    with the toggle off the window minimizes normally (visible + iconic).
    Note: `Process.MainWindowHandle` (PowerShell) switches to another
    top-level window once the main one is hidden — keep the original HWND
    when testing visibility.
- **Close-to-tray (config v4, 2026-10-19)**: closing the window now hides it
  to the tray instead of quitting (Quit from the tray menu exits;
  `restart_app` unaffected). New config `close_to_tray` (default true) and
  `minimize_to_tray` flipped to default **false**; the v4 migration applies
  both to existing configs. `CloseRequested` uses `api.prevent_close()` +
  `window.hide()` when on, else persists state and exits; the tray Quit
  handler now also saves playback.
- **Dark boot background (2026-10-19)**: the main window is created with
  `background_color` (#030303) so YouTube Music's startup reloads (the
  player flicker) do not flash white; the settings window uses #121212.
- **MPRIS (Linux media controls) - DONE (2026-10-19)**: new module
  `mpris.rs` (non-Windows) mirrors the SMTC module using `mpris-server`
  0.9 (zbus 5; async-std executor on a dedicated thread). Reports
  PlaybackStatus + Metadata (title, artist, album, `mpris:artUrl` from the
  video id) and forwards Play/Pause/PlayPause/Next/Previous/Stop(→pause)/
  SetPosition to the page. Verified in WSLg: the service registers as
  `org.mpris.MediaPlayer2.mirlo` on the session bus and the properties
  reply.
- **Inactivity prompt blocked — DONE (2026-10-17)**: the bridge refreshes
  `window._lact` (YouTube Music's last-activity timestamp) every 15 minutes,
  so the "¿Sigues ahí?" / "Are you still there?" prompt — which pauses
  playback until answered — never appears. Same approach as pear-desktop's
  renderer (MIT); the prompt cannot be intercepted after the fact because
  it pauses the player first. Verified that `_lact` exists and stays fresh
  on music.youtube.com; reproducing the prompt itself needs ~1 h idle, so
  end-to-end confirmation rides on the upstream-proven mechanism.
- **Linux feasibility validation (2026-10-18, WSL2/Ubuntu 24.04 + WSLg)**:
  investigated a possible Linux release. Findings:
  - The app **compiles and runs** on Linux as-is: the Windows-only deps
    are gated in `Cargo.toml` and every platform module has
    `cfg(not(target_os = "windows"))` stubs (adblock v1, SMTC, toasts,
    Discord, window state, focus). Verified live in WSLg: bridge loads,
    plugin host starts, SPA navigation works, the updater reached
    `latest.json` (`update check: 0.1.5 is up to date`), config/logs/data
    files work.
  - **Codecs need GStreamer**: with only `libwebkit2gtk-4.1` installed,
    WebKitGTK's MSE reported `aac:false, h264:false, opus:false`
    (`MediaSource` itself exists). Installing
    `gstreamer1.0-libav gstreamer1.0-plugins-good gstreamer1.0-plugins-bad
    gstreamer1.0-plugins-ugly` flips all three to `true` (probe via
    `MediaSource.isTypeSupported`). A Linux release must document/require
    these.
  - `data_root.rs` falls back to `.` without `LOCALAPPDATA` — a real port
    needs XDG paths (`~/.local/share/mirlo`).
  - Boot under WSLg software rendering is slow (~35 s to `ready`); one
    segfault and one hang were observed while *cross-domain navigating*
    (music.youtube.com → www.youtube.com, an artificial test path, not a
    normal Mirlo flow) — needs re-checking on real hardware.
  - **Signed-in playback on WebKitGTK is still UNVERIFIED** (needs a
    Google login in the WSLg window or a real Linux machine).
  - Remaining port work for a release: CI job (ubuntu-22.04 →
    AppImage/deb + updater `linux-x86_64` entry), XDG data paths, MPRIS
    for media keys, libnotify toasts, Discord over Unix sockets, Wayland
    hotkey limitations, install docs.
  - WSL working copy for further tests: `~/mirlo-app` (patched with
    temporary capability/autoplay probes in `bridge.js`; rebuild with
    `~/.cargo/bin/cargo build --release`); runner script:
    `%TEMP%\opencode\run-mirlo.sh`.
- **Linux support (initial) — DONE (2026-10-18)**: release pipeline now
  builds Linux bundles and the app runs on WebKitGTK 4.1.
  - `release.yml`: new `release-linux` job (ubuntu-22.04 → AppImage + deb,
    signed updater artifacts; tauri-action merges the `linux-x86_64` entry
    into `latest.json` alongside the Windows ones) + a final `checksums`
    job that generates one `SHA256SUMS.txt` from every uploaded bundle
    (the Windows job no longer generates checksums). `ci.yml` has an
    `app-linux` build job.
  - `data_root.rs`: non-Windows default base is `$XDG_DATA_HOME` or
    `~/.local/share` (data root `~/.local/share/Mirlo`).
  - `bridge.js` reports media capabilities in `bridge-ready`
    (`caps: {ms, aac, opus, h264}`); the shell logs a warning when MSE
    exists but the codecs are missing (Linux without GStreamer plugins).
  - **Playback VERIFIED on Ubuntu 24.04/WSLg** (even logged-out). Required
    packages: `gstreamer1.0-libav/plugins-good/bad/ugly` (without them
    `aac/h264/opus` are all false and playback fails). Docs: install.md
    has a Linux section (per-distro package names, AppImage/deb, tray/
    Wayland/NVIDIA notes).
  - Known gaps vs Windows (documented): no native notifications, no
    Discord RPC (needs Unix sockets), network ad-block falls back to the
    script layer, global hotkeys are X11-only. MPRIS media controls are
    done (see the MPRIS note above).
  - WSL quirks observed (not app bugs): cross-domain navigation
    (music.youtube.com → www.youtube.com) segfaulted/hung once in
    software rendering; WSLg's host must be alive (`wsl --shutdown` fixes
    "no window" symptoms — check for `msrdc`).
- Machine facts: Windows 11 x64; Rust 1.99.1 (MSVC) installed; VS 2019 Build
  Tools present; WebView2 runtime 155 present; Node 24 present; npm available.
- Build artifacts must NOT go into OneDrive: always set
  `CARGO_TARGET_DIR=$env:TEMP\mirlo-target`
  (or any temp dir) before cargo commands.

## Next step — pending work / Phase C leftover

**v0.1.0 and v0.1.1 are published** (2026-10-17). v0.1.1 (portable build) was
released end-to-end: tag → draft verified (installers + portable ZIP + all
three checksums OK) → published → **auto-update E2E passed on the owner's
machine** (`update available: 0.1.1 (current 0.1.0)` → confirm → passive
install → restart → `--- Mirlo 0.1.1 starting ---`, session preserved). The
signing key lives at `%USERPROFILE%\.tauri\mirlo.key` — keep it backed up
(without it no future version can be signed).

For the next release: follow `docs/release.md` (bump versions in
`tauri.conf.json` + `Cargo.toml`, update `CHANGELOG.md`, tag `vX.Y.Z`, verify
the draft — installers, portable ZIP, `SHA256SUMS.txt` — publish). The
auto-update E2E procedure is now known-good: watch
`%LOCALAPPDATA%\Mirlo\logs\mirlo.log` for `update available:` and
`--- Mirlo <version> starting ---`.

Related follow-ups (separate, not blockers): code signing (SignPath Foundation
free OSS signing / Azure Trusted Signing) and winget submission
(`InstallerType: portable` fits the new zip). Portable mode does NOT by itself
remove the SmartScreen warning for unsigned binaries.

Remaining Phase C item (currently **parked by the owner's decision**,
2026-10-16 — do not start it until the user asks):

1. **Scrobbler (Last.fm)**: needs an api_key + api_secret (the user creates
   the API account at last.fm/api — Mirlo cannot ship credentials) — plan a
   settings-ui section; secrets live in config.json (never commit). Design
   notes: auth flow is browser-token based (`api_key` + token → session
   key), scrobble threshold ~50%/4 min, queue pending scrobbles for offline
   resilience; shell-side HTTPS (reqwest or tauri plugin-http) since the
   API needs signed requests (MD5 signatures — hashing without a big dep:
   `md5` crate is tiny) or page fetch (Last.fm allows CORS — verify; the
   signature needs the api_secret, which must NOT go into the page — so
   shell-side is the right call, with the secret in config.json).

After that, Phase E candidates (not committed): MIC optimizations
(audio-only mode, GPU flags), cross-platform evaluation, native playback
(gated on a fresh ToS/risk review).

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

State: **ad-block v1, SMTC, notifications and Discord rich presence are
done and verified**. Remaining Phase C: the Last.fm scrobbler only (the user
must provide api_key/api_secret — see "Next step" above for the design).

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
- SMTC: the session object lives in a `OnceLock` in `media_controls.rs`;
  it is `Send + Sync` (WinRT agile), so `report_player_state` (sync command,
  main thread) can update it directly. The PowerShell probe in
  `%TEMP%\opencode\smtc-probe.ps1` (WinRT + `AsTask` awaiter) reads the
  OS-side session and can drive `TryTogglePlayPauseAsync` /
  `TryChangePlaybackPositionAsync` — the same delivery path hardware media
  keys use, ideal for end-to-end tests.
- Notifications: AUMID registered lazily in HKCU (DisplayName + IconUri);
  the module logs `ToastNotifier.Setting()` once per run — this machine
  reports `DisabledForUser` (2), so `Show()` succeeds but Windows drops the
  toast (no banner, no history). PS 5.1 cannot bind
  `ToastNotificationHistory.GetHistoryWithId` (`MethodNotFound`); use the
  throwaway Rust probe at `%TEMP%\opencode\toast-probe\` (sends a toast and
  reads the history for the AUMID) when that needs re-checking.
- **Focus checks: never use tao `window.is_focused()` under WebView2** — the
  WebView2 child keeps keyboard focus, the top-level never sees
  `WM_SETFOCUS`, and tao's flag stays false while the window *is* the
  foreground window (proved live). Use
  `GetForegroundWindow() == window.hwnd()` (see `player_is_focused` in
  `lib.rs`).
- Discord presence verification without a real client id: a dummy id makes
  Discord answer `op=2 CLOSE {"code":4000,"message":"Invalid Client ID"}`
  after a correct handshake — that reply proves the pipe connect + frame
  codec + handshake; a real client id yields `READY`. Discord must be
  running (`\\.\pipe\discord-ipc-0` exists).
- **Discord IPC + Windows named pipes: never leave a blocking `ReadFile`
  pending on the connection** — a pending synchronous read serializes
  `WriteFile` even from a duplicated handle, so the next `SET_ACTIVITY`
  hangs forever (the activity sticks on the first track). Fix proven with a
  throwaway probe: peek with `PeekNamedPipe` and read only complete frames
  (`available >= 8 + payload len`). Belt and braces in the module: writes
  run on a helper thread with a 3 s deadline (timeout → drop the connection
  and reconnect on the next activity) and the reader resets on oversized
  (>1 MiB) or partial (5 s) frames. Discord's IPC can transiently stop
  draining while it resolves external artwork; the ack reply mirrors the
  registered activity (resolved `mp:external/...` asset paths, ms
  timestamps) — log it when debugging.
- Discord timestamps are **milliseconds** in the IPC payload; the modern
  client resolves raw https `large_image` URLs via its external-assets API
  (ack shows `mp:external/<hash>/https/...`), so no uploaded assets needed.
- The YT Music SPA often keeps `location.href` at `music.youtube.com/`
  while playing: never derive the video id from the URL alone. The bridge's
  player state now carries `videoId` (from `#movie_player.getVideoData()`);
  `media_controls::artwork_id` prefers it with a URL fallback (used by
  Discord artwork, toast artwork and the SMTC thumbnail).

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
- **`beforeunload` dialogs are the other "freeze" source** (2026-10-17):
  YouTube Music arms a beforeunload handler, so navigating the player away
  pops Chromium's "Los cambios no se guardarán" dialog; while pending it
  blocks renderer JS — every CDP `Runtime.evaluate` times out and
  navigations hang. Two nuances verified live: Chromium only shows the
  dialog when the document has **sticky user activation** (CDP-loaded pages
  without a real click skip it — use `Input.dispatchMouseEvent` to grant
  activation when testing), and WebView2's `ScriptDialogOpening` event is
  **not raised for beforeunload** (an instrumented handler was never
  invoked), so the controller-level auto-accept route does not work. The
  bridge now neutralizes the arming at document start instead. If a dialog
  is pending anyway, `Page.handleJavaScriptDialog {accept:false}` from CDP
  dismisses it (cancel keeps the current page).

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
- **synced-lyrics listener wiring**: `onPlayerApiReady` must register the
  `videodatachange` listener (track changes) *and* the capture-phase media
  listeners (`timeupdate` + `play`/`pause`/`seeked`/`loadedmetadata` on
  `document`). Dropping any of them silently freezes the lyrics on the
  previous track or on a stale line, and the old `if (!video) return` guard
  at the top of that hook used to skip the whole registration when no
  `<video>` existed yet — do not reintroduce it.
- **Abrupt track transitions in the owner's install are a plugin symptom,
  not a shell bug** (2026-10-17): verification sessions left every plugin
  enabled in the owner's `config.json`. `skip-silences` fast-forwards
  absolute silence (`currentTime += 0.2` every 2 ms below −100 dB), which
  erases the natural gap between tracks — it is meant for speech content.
  `sponsorblock` with `intro`/`outro` categories cuts the start/end of
  music videos. Both ship OFF by default in Mirlo; disable them again if
  the owner reports "brusco" transitions after plugin testing.
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
- **tao `is_focused()` is false under WebView2 even when the window is
  foreground** (the child window holds focus; the top-level never receives
  `WM_SETFOCUS`). Any focus-dependent feature must use
  `GetForegroundWindow() == hwnd` (see `player_is_focused`).
- Windows toasts: `Show()` succeeds even with user notifications disabled —
  check `ToastNotifier.Setting()` (`Enabled = 0`, `DisabledForUser = 2`).
  `document.hasFocus()` in the page is *not* an OS-focus signal under
  WebView2 (stays true while another window is foreground).
- Driving focus for tests (headless shell cannot set foreground): focus the
  app with a `SetCursorPos` + `mouse_event` click on its title bar; defocus
  by minimizing (`ShowWindow(6)` — note the window may stay "foreground" for
  `GetForegroundWindow` until another window is clicked) or by clicking
  another window. `WScript.Shell.AppActivate` fails from the non-interactive
  shell (foreground lock).
- Force-killing the host leaves WebView2 trees shutting down slowly; verify
  with a process-tree walk (`Get-CimInstance Win32_Process` filtered by
  command line) and prefer graceful close (`CloseMainWindow()`).
- Release builds run without a console (`windows_subsystem = "windows"`);
  debug builds keep it. All shell diagnostics go through
  `logging::log_info!`/`log_error!` (file + console in debug) — never
  `println!`/`eprintln!` in new code.
- The updater endpoint is `releases/latest/download/latest.json` on the
  (currently private) repo: until the repo is public, checks 404 and log
  `update check failed` (harmless, silent).
- Bundling with `createUpdaterArtifacts: true` requires
  `TAURI_SIGNING_PRIVATE_KEY` in the environment (`tauri build` signs the
  updater artifacts). The key is `%USERPROFILE%\.tauri\mirlo.key` (empty
  password; `npx @tauri-apps/cli@^2 signer generate --ci` regenerates one).
  The embedded public key must always match the key used to sign releases,
  or updates are rejected as invalid signatures.
- NSIS trap: the default per-user install dir is `$LOCALAPPDATA\<productName>`
  — identical to the app-data dir `%LOCALAPPDATA%\Mirlo`. The `installerHooks`
  file (`installer-hooks.nsh`, PREINSTALL macro) relocates it to
  `%LOCALAPPDATA%\Programs\Mirlo` when the user kept the default; if the
  product name or data dir ever changes, revisit this hook.
- PowerShell 5.1 cannot read PE headers via `PEReader`; read the subsystem
  from the raw bytes (`e_lfanew` at 0x3C, subsystem u16 at +24+68; 2 = GUI).
- Interactive scripted proofs: the updater prompt/install comes from
  `dialog.rs` (MessageBoxW); the tray item "Check for updates…" is the
  interactive path. `update_check` (config, default true) gates only the
  startup check.
- `cargo test --lib` runs the config unit tests without needing a window or
  WebView2 runtime.

## Critical facts and guardrails

- Remote: `https://github.com/4lefernandezc/mirlo` — **public** since the
  v0.1.0 release (2026-10-17). Never change repository visibility without
  explicit owner approval. gh CLI is installed and authenticated (account
  `4lefernandezc`); use it for releases, secrets and workflow inspection.
- Reference app: pear-desktop v3.11.0 (ex th-ch/youtube-music), MIT. We MAY
  reuse its plugin code with attribution (add notices to
  `THIRD_PARTY_NOTICES.md` when porting). The owner keeps a local copy of the
  reference build **outside this repository** (in their private working
  folder; ask the owner for the path). **Never modify or delete owner-local
  files.**
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
  src-tauri/src/logging.rs  File logger (%LOCALAPPDATA%\Mirlo\logs, rotation)
  src-tauri/src/dialog.rs   Native MessageBoxW helpers (updater prompts, fatal errors)
  src-tauri/src/updates.rs  Auto-update: startup check + tray item (tauri-plugin-updater)
  src-tauri/src/adblock.rs  Ad-block v1: WebResourceRequested handler (Windows)
  src-tauri/src/media_controls.rs  SMTC media session (Windows)
  src-tauri/src/notifications.rs  Track-change toasts (Windows)
  src-tauri/src/discord.rs  Discord Rich Presence IPC client (thin, no deps)
  src-tauri/src/window_state.rs  Window geometry persistence (window-state.json)
  src-tauri/src/playback.rs  Resume-playback state (playback.json)
  src-tauri/src/bridge.js   Bridge + plugin host + ad-block v2 (prune) +
                            beforeunload + inactivity-prompt neutralizers
  src-tauri/src/plugins.rs  Plugin source registry + settings manifest
  src-tauri/installer-hooks.nsh  NSIS hook: install dir move + (future) tweaks
  src-tauri/plugins/*.js    Renderer plugin ports (one file per plugin)
  src-tauri/capabilities/   Remote-URL + settings-window capabilities (ACL)
docs/
  architecture.md           Target architecture
  roadmap.md                Phases and status
  release.md                Maintainer release checklist (secrets, tag, verify)
  user/                     User docs: install, FAQ, terms and scope
  adr/                      Architecture decision records
  research/                 Evidence (plugin inventory, IPC contract, measurements,
                            PoC validation, idle screenshot)
.github/workflows/
  ci.yml                    fmt/clippy/test/build on push and PR
  release.yml               Signed draft release on v* tags (+ SHA256SUMS.txt)
poc/webview2-probe/         Validated Rust + wry spike (seed for Phase A)
tools/measure-memory.ps1    RAM measurement helper (process tree, private WS)
tools/gen-icons.ps1         Regenerates app icons (placeholder mark)
```

## Commands

```powershell
# Build the app (from repo root; keep artifacts out of OneDrive)
$env:CARGO_TARGET_DIR = "$env:TEMP\mirlo-target"
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
