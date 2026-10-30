# Offline recovery screen — 2026-10-29

## Scope

Replace native browser connection errors for the main YouTube Music page
with a useful local screen. This is normal product behavior, not detection
of the AppImage catalog test. It does not pretend that playback works offline.

- `offline.rs` handles WebView2 main-frame connection statuses and WebKitGTK
  network/DNS errors. It leaves cancelled navigations, certificate failures,
  HTTP responses and other origins (including Google login) alone.
- The window initially loads `about:blank`; the first player request starts
  after the native failure handler is attached. Tauri navigation is queued
  outside the native callback's runtime lock to avoid deadlocking startup.
- `ui/index.html` is bundled, including the app icon; no fonts, images or
  scripts need an external server. It follows `prefers-color-scheme`, with
  explicit readable colors in both modes and a keyboard-accessible retry link.
- `ui/offline.js` checks the actual player host every 15 seconds and on an
  `online` event. Checks omit credentials, bypass cache, time out after eight
  seconds and do not overlap. A successful connection navigates to the fixed
  official player URL. The retry link works without JavaScript.
- The player bridge does not initialize on the local screen; session/config
  data is neither cleared nor exposed there. No new renderer commands or
  capabilities were added.

## Verification

- Windows: debug build with an isolated `MIRLO_DATA_DIR` and CDP endpoint.
  Disabling network in CDP and navigating to the player showed the local
  page with its icon. Both emulated system themes had readable text and no
  horizontal overflow. Retrying while disconnected returned to the local
  page. Restoring network and sending `online` loaded the real player with
  its bridge. All test processes/data were separate from the installed app.
- Ubuntu/WSLg: debug build, a separate D-Bus session, fresh XDG cache/data
  directories and `unshare -Urn` to block network. The log reported the same
  DNS error as the AppImage catalog test, followed by a readable local light
  screen (reviewed via X11 capture). Software rendering and sandbox disabling
  were confined to this isolated test process, not shipped settings.
- Rust: fmt and clippy pass on Windows; 31 unit tests pass on Windows and
  Linux. WSL lacks the clippy component; the Linux build still reports
  unrelated pre-existing unused imports/variables/functions.
- Node: `node --test tools/tests/offline.test.mjs` verifies failed DNS,
  recovery, request deduplication and timeout/retry. Added to Windows CI.

## Limits

- This handles failed main-frame loads, not loss of connectivity inside an
  already-loaded SPA. YouTube Music keeps control of buffered playback and
  its own offline UI in that case. A cached/service-worker page may also
  load successfully while offline, so fresh cache matters when testing DNS.
- It does not bypass TLS validation or captive portals. A reachable host is
  not proof of successful authentication/playback; the native page load
  remains the final check after reconnection.
- Screenshots remain outside the repository. No new AppImage has been
  published and the external catalog test has not been rerun. Its warning
  heuristics are not a guarantee of catalog acceptance.
- Bundling the missing GStreamer plugins is a separate task, unchanged here.
